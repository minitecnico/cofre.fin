-- ============================================================================
-- Migration: limite do cartão considera TODAS as parcelas não pagas
-- ============================================================================
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- COMO O BANCO FAZ (e agora o app também):
--   - Compra parcelada prende o limite pelo VALOR TOTAL na hora da compra.
--     Ex.: R$ 1.200 em 12x → R$ 1.200 ocupados, não só a parcela do mês.
--   - A cada parcela paga (fatura paga ou compra marcada como paga) o valor
--     dela volta pro limite.
--   - Como cada parcela já é uma transação própria, a regra fica simples:
--     limite ocupado = soma de TODAS as compras não pagas do cartão, de
--     qualquer data (inclui faturas antigas não pagas e parcelas futuras).
--
-- O que muda em get_card_summary() (substitui migration_card_smart_limit.sql):
--   - used_limit (novo): todas as não pagas → base de available e utilization_percent.
--   - open_bill: só o que falta pagar da fatura atual (ciclo de hoje). Antes
--     também era a base do limite.
--   - Saem paid_in_cycle, total_used, current_bill_month, current_bill_amount
--     (sem uso no app).
--
-- O tipo de retorno muda e `create or replace` não troca colunas de saída,
-- então o DO abaixo derruba qualquer assinatura que exista no banco antes.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_card_summary'
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create function public.get_card_summary(p_card_id uuid)
returns table (
  card_limit numeric,
  used_limit numeric,           -- TODAS as compras não pagas (inclui parcelas futuras)
  available numeric,            -- card_limit - used_limit
  utilization_percent numeric,  -- used_limit / card_limit
  open_bill numeric,            -- não pago da fatura atual
  purchase_count bigint,        -- compras na fatura atual (todas)
  unpaid_count bigint,          -- compras não pagas na fatura atual
  cycle_start date,
  cycle_end date                -- dia em que a fatura atual fecha
)
language plpgsql
security invoker
stable
as $$
declare
  v_closing_day int;
  v_limit numeric;
  v_today date := current_date;
  v_cycle_start date;
  v_cycle_end date;
begin
  select cc.closing_day, coalesce(cc.card_limit, 0)
    into v_closing_day, v_limit
    from public.credit_cards cc
   where cc.id = p_card_id and cc.user_id = auth.uid();
  if not found then return; end if;

  -- Ciclo atual: dia seguinte ao último fechamento até o próximo fechamento.
  -- Ex.: fecha dia 14, hoje 04/05 → 15/abr a 14/mai; hoje 20/05 → 15/mai a 14/jun.
  if extract(day from v_today)::int <= v_closing_day then
    v_cycle_start := (date_trunc('month', v_today) - interval '1 month')::date + v_closing_day;
    v_cycle_end   := date_trunc('month', v_today)::date + v_closing_day - 1;
  else
    v_cycle_start := date_trunc('month', v_today)::date + v_closing_day;
    v_cycle_end   := (date_trunc('month', v_today) + interval '1 month')::date + v_closing_day - 1;
  end if;

  return query
  select
    v_limit,
    u.used_total,
    greatest(v_limit - u.used_total, 0)::numeric,
    case when v_limit > 0 then round(u.used_total / v_limit * 100, 2) else 0 end,
    b.bill_open,
    b.bill_count,
    b.bill_unpaid,
    v_cycle_start,
    v_cycle_end
  from (
    select coalesce(sum(t.amount), 0)::numeric as used_total
      from public.transactions t
     where t.credit_card_id = p_card_id
       and t.user_id = auth.uid()
       and t.type = 'expense'
       and not t.paid
  ) u,
  (
    select coalesce(sum(t.amount) filter (where not t.paid), 0)::numeric as bill_open,
           count(*)::bigint                                             as bill_count,
           count(*) filter (where not t.paid)::bigint                   as bill_unpaid
      from public.transactions t
     where t.credit_card_id = p_card_id
       and t.user_id = auth.uid()
       and t.type = 'expense'
       and t.date between v_cycle_start and v_cycle_end
  ) b;
end;
$$;
