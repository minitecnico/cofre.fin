-- ============================================================================
-- Migration: Viagens — gastos próprios, viajantes por @nick e link público
-- ============================================================================
-- Rode DEPOIS de migration_trips.sql e migration_goals_shared.sql (usa
-- profiles e user_display_name de lá).
--
-- 1. trip_expenses → os gastos da viagem viram um caderno À PARTE: não entram
--    nas despesas do mês nem no saldo. O propósito é saber quanto a viagem
--    custou. Categorias fixas (hospedagem, transporte...) porque cada viajante
--    tem as próprias categorias do app. card_label = cartão usado, só anotação.
--    Gastos que já tinham sido lançados como despesa (transactions.trip_id)
--    são MOVIDOS pra cá — saem de Despesas — e as colunas trip_id/card_label
--    de transactions são removidas.
-- 2. trips.notes → observações da viagem.
-- 3. Viajantes, como nas metas coletivas: o dono convida pelo @nick
--    (invite_to_trip), o convidado aceita ou recusa dentro do app
--    (respond_trip_invite). Viajantes veem a viagem e anotam gastos; cada um
--    edita/exclui os próprios (o dono, todos).
-- 4. trips.share_code → link público <dominio>/viagem/<code> (sem login) pra
--    outras pessoas verem os gastos. O código é a credencial (mesmo modelo do
--    extrato de cobranças): gerado no app com CSPRNG, null = não compartilhado.
--    resolve_trip_share não expõe observações, orçamento, cartão nem ids.
--
-- Excluir a viagem apaga os gastos dela (caderno da viagem) e os convites.
-- Idempotente.
-- ============================================================================

-- ── Colunas novas em trips ──────────────────────────────────────────────────
alter table public.trips add column if not exists notes text check (length(notes) <= 2000);
alter table public.trips add column if not exists share_code text unique;

-- ── Gastos da viagem ────────────────────────────────────────────────────────
create table if not exists public.trip_expenses (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade, -- quem anotou
  description text not null check (length(description) > 0), -- sem teto: vem de transactions, que não tem
  amount      numeric(12, 2) not null check (amount > 0),
  date        date not null default current_date,
  category    text not null default 'outro'
              check (category in ('hospedagem','transporte','alimentacao','passeios','compras','outro')),
  card_label  text check (length(card_label) <= 80),
  created_at  timestamptz not null default now()
);
create index if not exists idx_trip_expenses_trip on public.trip_expenses(trip_id, date desc);

-- Gastos lançados como despesa na versão anterior: vêm pra cá e saem de Despesas.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'trip_id'
  ) then
    insert into public.trip_expenses (id, trip_id, user_id, description, amount, date, category, card_label, created_at)
    select x.id, x.trip_id, x.user_id, coalesce(nullif(x.description, ''), 'Gasto'), x.amount, x.date, 'outro',
           x.card_label, coalesce(x.created_at, now())
    from public.transactions x
    where x.trip_id is not null and x.type = 'expense'
    on conflict (id) do nothing;

    delete from public.transactions where trip_id is not null;
    alter table public.transactions drop column trip_id;
    alter table public.transactions drop column if exists card_label;
  end if;
end $$;

-- ── Viajantes e convites ────────────────────────────────────────────────────
create table if not exists public.trip_members (
  trip_id      uuid not null references public.trips(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  display_name text,
  joined_at    timestamptz default now(),
  primary key (trip_id, user_id)
);
create index if not exists idx_trip_members_user on public.trip_members(user_id);

create table if not exists public.trip_invites (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  invitee_id   uuid not null references auth.users(id) on delete cascade,
  invitee_nick text not null,                 -- cópia p/ o dono ver (profiles é privado)
  invited_by   uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at   timestamptz default now(),
  unique (trip_id, invitee_id)
);
create index if not exists idx_trip_invites_invitee on public.trip_invites(invitee_id) where status = 'pending';

-- SECURITY DEFINER evita recursão de RLS (policy de trip_members lendo trip_members).
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid());
$$;

-- O dono entra como viajante 'owner' ao criar a viagem.
create or replace function public.trip_add_owner_member()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role, display_name)
  values (new.id, new.user_id, 'owner', public.user_display_name(new.user_id))
  on conflict (trip_id, user_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_trip_add_owner_member on public.trips;
create trigger trg_trip_add_owner_member
  after insert on public.trips
  for each row execute function public.trip_add_owner_member();

-- Viagens criadas antes desta migration.
insert into public.trip_members (trip_id, user_id, role, display_name)
select t.id, t.user_id, 'owner', public.user_display_name(t.user_id)
from public.trips t
on conflict (trip_id, user_id) do nothing;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- trips: "trips_dono" (dono faz tudo) continua; viajantes só leem.
drop policy if exists "trips_viajantes_leem" on public.trips;
create policy "trips_viajantes_leem" on public.trips
  for select using (public.is_trip_member(id));

alter table public.trip_expenses enable row level security;
alter table public.trip_members  enable row level security;
alter table public.trip_invites  enable row level security;

drop policy if exists "trip_expenses_leitura" on public.trip_expenses;
create policy "trip_expenses_leitura" on public.trip_expenses
  for select using (public.is_trip_member(trip_id));

drop policy if exists "trip_expenses_anotar" on public.trip_expenses;
create policy "trip_expenses_anotar" on public.trip_expenses
  for insert with check (user_id = auth.uid() and public.is_trip_member(trip_id));

-- Cada viajante mexe nos próprios gastos; o dono da viagem, em todos.
drop policy if exists "trip_expenses_editar" on public.trip_expenses;
create policy "trip_expenses_editar" on public.trip_expenses
  for update using (
    user_id = auth.uid()
    or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  ) with check (public.is_trip_member(trip_id));

drop policy if exists "trip_expenses_excluir" on public.trip_expenses;
create policy "trip_expenses_excluir" on public.trip_expenses
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

drop policy if exists "trip_members_leitura" on public.trip_members;
create policy "trip_members_leitura" on public.trip_members
  for select using (public.is_trip_member(trip_id));

-- Sair da viagem (o próprio viajante) ou remover alguém (o dono). O dono não sai.
drop policy if exists "trip_members_remover" on public.trip_members;
create policy "trip_members_remover" on public.trip_members
  for delete using (
    role <> 'owner' and (
      user_id = auth.uid()
      or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
    )
  );

-- Convites: o dono vê/cancela; o convidado vê os que recebeu. Criar e responder só via RPC.
drop policy if exists "trip_invites_leitura" on public.trip_invites;
create policy "trip_invites_leitura" on public.trip_invites
  for select using (
    invitee_id = auth.uid()
    or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

drop policy if exists "trip_invites_cancelar" on public.trip_invites;
create policy "trip_invites_cancelar" on public.trip_invites
  for delete using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- ── RPCs ────────────────────────────────────────────────────────────────────

/** Dono convida alguém pelo @nick (com ou sem o @). */
create or replace function public.invite_to_trip(p_trip_id uuid, p_nick text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_nick    text := lower(ltrim(trim(p_nick), '@'));
  v_invitee uuid;
  v_id      uuid;
begin
  if not exists (select 1 from public.trips where id = p_trip_id and user_id = auth.uid()) then
    raise exception 'Só quem criou a viagem pode convidar.';
  end if;
  select user_id into v_invitee from public.profiles where nick = v_nick;
  if v_invitee is null then
    raise exception 'Nenhum usuário com o nick @%.', v_nick;
  end if;
  if v_invitee = auth.uid() then
    raise exception 'Você já está nesta viagem.';
  end if;
  if exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = v_invitee) then
    raise exception 'Essa pessoa já está na viagem.';
  end if;

  insert into public.trip_invites (trip_id, invitee_id, invitee_nick, invited_by, status)
  values (p_trip_id, v_invitee, v_nick, auth.uid(), 'pending')
  on conflict (trip_id, invitee_id) do update set status = 'pending', created_at = now()
  returning id into v_id;
  return v_id;
end $$;

/** Convites pendentes do usuário logado, com o nome da viagem e quem convidou. */
create or replace function public.list_my_trip_invites()
returns table (id uuid, trip_id uuid, trip_name text, destination text, inviter_name text, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select i.id, i.trip_id, t.name, t.destination, public.user_display_name(i.invited_by), i.created_at
  from public.trip_invites i join public.trips t on t.id = i.trip_id
  where i.status = 'pending' and i.invitee_id = auth.uid()
  order by i.created_at desc;
$$;

/** Convidado aceita (vira viajante) ou recusa. Só o próprio convidado responde. */
create or replace function public.respond_trip_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_trip uuid;
begin
  select trip_id into v_trip from public.trip_invites
  where id = p_invite_id and status = 'pending' and invitee_id = auth.uid();
  if v_trip is null then
    raise exception 'Convite não encontrado ou já respondido.';
  end if;

  update public.trip_invites
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_invite_id;

  if p_accept then
    insert into public.trip_members (trip_id, user_id, role, display_name)
    values (v_trip, auth.uid(), 'member', public.user_display_name(auth.uid()))
    on conflict (trip_id, user_id) do nothing;
  end if;
end $$;

-- Lista de viagens (as próprias e as que a pessoa participa) com o total gasto.
-- security invoker: o RLS filtra. Muda o retorno da versão anterior → drop.
drop function if exists public.get_trips();
create function public.get_trips()
returns table (
  id uuid, name text, destination text, start_date date, end_date date,
  budget numeric, spent numeric, travelers int, is_owner boolean, owner_name text, created_at timestamptz
)
language sql stable security invoker set search_path = public
as $$
  select t.id, t.name, t.destination, t.start_date, t.end_date, t.budget,
         coalesce((select sum(e.amount) from public.trip_expenses e where e.trip_id = t.id), 0),
         (select count(*)::int from public.trip_members m where m.trip_id = t.id),
         t.user_id = auth.uid(),
         (select m.display_name from public.trip_members m where m.trip_id = t.id and m.role = 'owner'),
         t.created_at
  from public.trips t
  order by coalesce(t.start_date, t.created_at::date) desc, t.created_at desc;
$$;

/**
 * Página pública /viagem/:code — só os gastos (e quem viajou, pelo primeiro
 * nome). Sem observações, orçamento, cartão nem ids.
 */
create or replace function public.resolve_trip_share(p_code text)
returns jsonb
language sql security definer set search_path = public stable
as $$
  select jsonb_build_object(
    'name', t.name,
    'destination', t.destination,
    'start_date', t.start_date,
    'end_date', t.end_date,
    'travelers', coalesce((
      select jsonb_agg(split_part(m.display_name, ' ', 1) order by m.role = 'owner' desc, m.joined_at)
      from public.trip_members m where m.trip_id = t.id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', e.description,
        'amount', e.amount,
        'date', e.date,
        'category', e.category,
        'by', (select split_part(m.display_name, ' ', 1) from public.trip_members m
               where m.trip_id = e.trip_id and m.user_id = e.user_id)
      ) order by e.date desc, e.created_at desc)
      from public.trip_expenses e where e.trip_id = t.id
    ), '[]'::jsonb)
  )
  from public.trips t
  where t.share_code = p_code and length(p_code) >= 16
  limit 1;
$$;

grant execute on function public.get_trips()                       to authenticated;
grant execute on function public.invite_to_trip(uuid, text)         to authenticated;
grant execute on function public.list_my_trip_invites()             to authenticated;
grant execute on function public.respond_trip_invite(uuid, boolean) to authenticated;
grant execute on function public.resolve_trip_share(text)           to anon, authenticated;
revoke execute on function public.invite_to_trip(uuid, text)         from anon;
revoke execute on function public.list_my_trip_invites()             from anon;
revoke execute on function public.respond_trip_invite(uuid, boolean) from anon;
