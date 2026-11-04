-- ============================================================================
-- Migration: Viagens — centro de custos + lugares marcados no mapa
-- ============================================================================
-- trips        → a viagem (nome, destino, datas, orçamento opcional)
-- trip_places  → pontos marcados no mapa (pousada, restaurante, píer...),
--                com a posição do GPS e a precisão da leitura
-- transactions.trip_id → o gasto da viagem é uma DESPESA normal: entra no saldo
--                no ato (regra mestra), aparece em Despesas e nos gráficos. A
--                viagem só agrupa — é o "centro de custos".
-- transactions.card_label → nome do cartão usado, SÓ informativo. Não é
--                credit_card_id: o gasto não entra em fatura nem ocupa limite.
--                Texto e sem FK de propósito — uma 2ª FK para credit_cards
--                deixaria ambíguo o embed `credit_card:credit_cards` do app.
--
-- O id das linhas pode vir do cliente: o app gera o UUID antes de salvar pra
-- reenviar sem duplicar o que foi registrado sem internet.
--
-- Excluir a viagem apaga os lugares; os gastos continuam (aconteceram) e só
-- perdem o vínculo.
--
-- RLS: cada conta só vê e mexe nas próprias viagens. Idempotente.
-- ============================================================================

create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  destination text check (length(destination) <= 160),
  start_date  date,
  end_date    date,
  budget      numeric(12, 2) check (budget is null or budget >= 0),
  created_at  timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists idx_trips_user on public.trips(user_id, start_date desc);

alter table public.trips enable row level security;
drop policy if exists "trips_dono" on public.trips;
create policy "trips_dono" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.trip_places (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  kind        text not null default 'outro'
              check (kind in ('hospedagem','restaurante','praia','passeio','barco','mercado','outro')),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  real,
  notes       text check (length(notes) <= 1000),
  created_at  timestamptz not null default now()
);
create index if not exists idx_trip_places_trip on public.trip_places(trip_id);

alter table public.trip_places enable row level security;
drop policy if exists "trip_places_dono" on public.trip_places;
create policy "trip_places_dono" on public.trip_places
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

alter table public.transactions
  add column if not exists trip_id uuid references public.trips(id) on delete set null;
alter table public.transactions
  add column if not exists card_label text check (length(card_label) <= 80);
create index if not exists idx_transactions_trip
  on public.transactions(trip_id) where trip_id is not null;

-- Lista de viagens com o total gasto e quantos lugares foram marcados.
-- security invoker: o RLS de trips/transactions filtra pelo usuário logado.
create or replace function public.get_trips()
returns table (
  id uuid, name text, destination text, start_date date, end_date date,
  budget numeric, spent numeric, places int, created_at timestamptz
)
language sql stable security invoker set search_path = public
as $$
  select t.id, t.name, t.destination, t.start_date, t.end_date, t.budget,
         coalesce((select sum(x.amount) from public.transactions x
                   where x.trip_id = t.id and x.type = 'expense'), 0),
         (select count(*)::int from public.trip_places p where p.trip_id = t.id),
         t.created_at
  from public.trips t
  order by coalesce(t.start_date, t.created_at::date) desc, t.created_at desc;
$$;

grant execute on function public.get_trips() to authenticated;
