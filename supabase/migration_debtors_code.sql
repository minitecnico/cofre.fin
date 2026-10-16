-- ============================================================================
-- Migration: Cobranças — número sequencial por devedor (#001, #002…)
-- ============================================================================
-- O `id` (uuid) continua sendo a chave técnica. `code` é o identificador
-- HUMANO: curto, sequencial e único POR USUÁRIO — distingue dois "João" na
-- tela, no seletor e no relatório PDF.
--
--   debtors.code        → int, único em (user_id, code)
--   trg_debtors_code    → preenche o próximo número no insert (com lock por
--                         usuário, pra dois cadastros simultâneos não colidirem)
--   get_debtors_summary → recriada devolvendo `code`
--
-- Números não são reaproveitados: apagar o #002 não faz o próximo virar #002.
-- Idempotente.
-- ============================================================================

alter table public.debtors
  add column if not exists code integer;

-- Backfill: numera os devedores existentes por ordem de cadastro.
with numbered as (
  select id, row_number() over (partition by user_id order by created_at, id) as rn
  from public.debtors
  where code is null
)
update public.debtors d
   set code = n.rn + coalesce((select max(x.code) from public.debtors x where x.user_id = d.user_id), 0)
  from numbered n
 where d.id = n.id;

create unique index if not exists idx_debtors_user_code on public.debtors(user_id, code);

-- Próximo número no insert.
create or replace function public.set_debtor_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    perform pg_advisory_xact_lock(hashtext('debtor_code:' || new.user_id::text));
    select coalesce(max(code), 0) + 1 into new.code
      from public.debtors
     where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_debtors_code on public.debtors;
create trigger trg_debtors_code
  before insert on public.debtors
  for each row execute function public.set_debtor_code();

alter table public.debtors alter column code set not null;

-- ── RPC: resumo por devedor (agora com `code`) ──────────────────────────────
drop function if exists public.get_debtors_summary();
create or replace function public.get_debtors_summary()
returns table (
  debtor_id       uuid,
  code            integer,
  name            text,
  phone           text,
  open_amount     numeric,
  paid_amount     numeric,
  open_count      bigint,
  overdue_count   bigint,
  overdue_amount  numeric,
  next_due        date,
  last_charged_at timestamptz
)
language sql
security invoker
stable
as $$
  select
    d.id,
    d.code,
    d.name,
    d.phone,
    coalesce(sum(c.amount) filter (where not c.paid), 0)                              as open_amount,
    coalesce(sum(c.amount) filter (where c.paid), 0)                                  as paid_amount,
    count(c.id) filter (where not c.paid)                                             as open_count,
    count(c.id) filter (where not c.paid and c.due_date < current_date)               as overdue_count,
    coalesce(sum(c.amount) filter (where not c.paid and c.due_date < current_date), 0) as overdue_amount,
    min(c.due_date) filter (where not c.paid)                                         as next_due,
    max(c.last_charged_at) filter (where not c.paid)                                  as last_charged_at
  from public.debtors d
  left join public.charges c on c.debtor_id = d.id and c.user_id = auth.uid()
  where d.user_id = auth.uid()
  group by d.id, d.code, d.name, d.phone
  order by open_amount desc, d.name asc;
$$;
