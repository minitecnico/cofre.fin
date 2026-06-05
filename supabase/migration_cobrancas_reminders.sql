-- ============================================================================
-- Migration: Cobranças — rastreio de envio (lembretes) + status de atenção
-- ============================================================================
-- Objetivo: sinalizar que uma cobrança JÁ FOI cobrada, pra não ficar mandando
-- a mesma pessoa 2-3 vezes. Guardamos:
--   charges.last_charged_at → quando foi o último lembrete enviado
--   charges.charged_count   → quantas vezes já cobramos
--
-- A UI usa isso pro esquema de cores ("cobrado há 2d", "nunca cobrado",
-- "cobrar de novo?") e pro painel de alertas de devedores.
-- Idempotente; rode uma vez.
-- ============================================================================

alter table public.charges
  add column if not exists last_charged_at timestamptz,
  add column if not exists charged_count   integer not null default 0;

-- ── RPC: marca cobranças como enviadas ──────────────────────────────────────
-- Incrementa o contador e carimba o momento. Só age nas NÃO pagas e do dono
-- (RLS via auth.uid()). Retorna quantas foram marcadas.
create or replace function public.mark_charges_sent(p_ids uuid[])
returns integer
language sql
security invoker
volatile
as $$
  with upd as (
    update public.charges
       set charged_count   = charged_count + 1,
           last_charged_at  = now()
     where id = any(p_ids)
       and user_id = auth.uid()
       and not paid
    returning 1
  )
  select coalesce(count(*), 0)::int from upd;
$$;

-- ── RPC: resumo por devedor (recriado p/ incluir o último lembrete) ──────────
-- Muda a assinatura (nova coluna last_charged_at), então precisa de drop antes.
drop function if exists public.get_debtors_summary();
create or replace function public.get_debtors_summary()
returns table (
  debtor_id      uuid,
  name           text,
  phone          text,
  open_amount    numeric,
  paid_amount    numeric,
  open_count     bigint,
  overdue_count  bigint,
  overdue_amount numeric,
  next_due       date,
  last_charged_at timestamptz
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
    min(c.due_date) filter (where not c.paid)                                         as next_due,
    max(c.last_charged_at) filter (where not c.paid)                                  as last_charged_at
  from public.debtors d
  left join public.charges c on c.debtor_id = d.id and c.user_id = auth.uid()
  where d.user_id = auth.uid()
  group by d.id, d.name, d.phone
  order by open_amount desc, d.name asc;
$$;
