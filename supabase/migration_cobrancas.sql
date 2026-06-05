-- ============================================================================
-- Migration: Cobranças (emprestou cartão/dinheiro → controla quem te deve)
-- ============================================================================
-- 3 tabelas:
--   user_settings → config do usuário (chave PIX pra receber). 1 linha por user.
--   debtors       → pessoas que te devem (nome + telefone p/ WhatsApp).
--   charges       → cada dívida: valor, descrição, vencimento, pago/pendente.
--
-- RLS: mesma regra do resto do app — dono enxerga só o que é seu.
-- Idempotente onde dá; rode uma vez.
-- ============================================================================

-- ── 1. Configurações do usuário (chave PIX p/ gerar QR / copia-e-cola) ──────
create table if not exists public.user_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  pix_key       text,
  pix_key_type  text check (pix_key_type in ('cpf','cnpj','email','phone','random')),
  pix_name      text,   -- nome do recebedor (vai no payload EMV do PIX)
  pix_city      text,   -- cidade do recebedor (vai no payload EMV do PIX)
  updated_at    timestamptz default now()
);

-- ── 2. Devedores ────────────────────────────────────────────────────────────
create table if not exists public.debtors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  phone       text,            -- só dígitos ou formatado; o app normaliza p/ wa.me
  note        text,
  created_at  timestamptz default now()
);
create index if not exists idx_debtors_user on public.debtors(user_id);

-- ── 3. Cobranças ────────────────────────────────────────────────────────────
create table if not exists public.charges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  debtor_id   uuid not null references public.debtors(id) on delete cascade,
  description text not null,
  amount      numeric(12, 2) not null check (amount > 0),
  due_date    date,
  paid        boolean not null default false,
  paid_at     timestamptz,
  created_at  timestamptz default now()
);
create index if not exists idx_charges_user on public.charges(user_id);
create index if not exists idx_charges_debtor on public.charges(debtor_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.user_settings enable row level security;
alter table public.debtors       enable row level security;
alter table public.charges       enable row level security;

drop policy if exists "user_settings_dono" on public.user_settings;
create policy "user_settings_dono" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "debtors_dono" on public.debtors;
create policy "debtors_dono" on public.debtors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "charges_dono" on public.charges;
create policy "charges_dono" on public.charges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── RPC: resumo de cobranças por devedor ────────────────────────────────────
-- Retorna, por devedor: total devido (não pago), total pago, qtd pendente,
-- vencido (qtd e valor). Facilita a tela e o relatório.
create or replace function public.get_debtors_summary()
returns table (
  debtor_id     uuid,
  name          text,
  phone         text,
  open_amount   numeric,
  paid_amount   numeric,
  open_count    bigint,
  overdue_count bigint,
  overdue_amount numeric,
  next_due      date
)
language sql
security invoker
stable
as $$
  select
    d.id,
    d.name,
    d.phone,
    coalesce(sum(c.amount) filter (where not c.paid), 0)                              as open_amount,
    coalesce(sum(c.amount) filter (where c.paid), 0)                                  as paid_amount,
    count(c.id) filter (where not c.paid)                                             as open_count,
    count(c.id) filter (where not c.paid and c.due_date < current_date)               as overdue_count,
    coalesce(sum(c.amount) filter (where not c.paid and c.due_date < current_date), 0) as overdue_amount,
    min(c.due_date) filter (where not c.paid)                                         as next_due
  from public.debtors d
  left join public.charges c on c.debtor_id = d.id and c.user_id = auth.uid()
  where d.user_id = auth.uid()
  group by d.id, d.name, d.phone
  order by open_amount desc, d.name asc;
$$;
