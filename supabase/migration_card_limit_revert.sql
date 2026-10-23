-- ============================================================================
-- Migration: volta o limite do cartão para a regra do ciclo
-- ============================================================================
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Desfaz a migration_card_limit_installments.sql (removida do repo), que
-- fazia as parcelas futuras ocuparem limite. Volta a regra anterior:
--   - Limite ocupado = compras NÃO PAGAS do cartão dentro do ciclo atual.
--   - Parcelas futuras não ocupam limite.
--
-- A função abaixo é a mesma de migration_card_smart_limit.sql. O tipo de
-- retorno muda de novo, então o DO derruba a versão atual antes de recriar.
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
  open_bill numeric,        -- Compras NÃO PAGAS no ciclo atual (ocupam limite)
  paid_in_cycle numeric,    -- Compras JÁ PAGAS no ciclo atual (referência)
  total_used numeric,       -- Soma de open_bill (= limite ocupado)
  available numeric,        -- card_limit - open_bill (limite disponível)
  utilization_percent numeric,
  purchase_count bigint,    -- Quantidade de compras no ciclo (todas)
  unpaid_count bigint,      -- Quantidade de compras NÃO pagas
  cycle_start date,
  cycle_end date
)
language plpgsql
security invoker
stable
as $$
declare
  v_card record;
  v_today date := current_date;
  v_closing_day int;
  v_cycle_start date;
  v_cycle_end date;
  v_limit numeric;
begin
  -- Valida cartão e dono
  select * into v_card
  from public.credit_cards
  where id = p_card_id and user_id = auth.uid();

  if not found then
    return;
  end if;

  v_closing_day := v_card.closing_day;
  v_limit := coalesce(v_card.card_limit, 0);

  -- Calcula ciclo atual baseado no closing_day
  if extract(day from v_today)::int <= v_closing_day then
    -- Estamos antes do fechamento → ciclo começou no fechamento do mês passado
    v_cycle_start := (date_trunc('month', v_today) - interval '1 month')::date
                     + (v_closing_day - 1) * interval '1 day'
                     + interval '1 day';
    v_cycle_end := date_trunc('month', v_today)::date
                   + (v_closing_day - 1) * interval '1 day';
  else
    -- Estamos depois do fechamento → ciclo começou no fechamento deste mês
    v_cycle_start := date_trunc('month', v_today)::date
                     + (v_closing_day - 1) * interval '1 day'
                     + interval '1 day';
    v_cycle_end := (date_trunc('month', v_today) + interval '1 month')::date
                   + (v_closing_day - 1) * interval '1 day';
  end if;

  return query
  with cycle_txs as (
    select amount, paid
    from public.transactions
    where credit_card_id = p_card_id
      and user_id = auth.uid()
      and type = 'expense'
      and date >= v_cycle_start
      and date <= v_cycle_end
  ),
  agg as (
    select
      coalesce(sum(amount) filter (where not paid), 0)::numeric as v_open_bill,
      coalesce(sum(amount) filter (where paid), 0)::numeric     as v_paid_in_cycle,
      count(*)::bigint                                          as v_purchase_count,
      count(*) filter (where not paid)::bigint                  as v_unpaid_count
    from cycle_txs
  )
  select
    v_limit,
    a.v_open_bill,
    a.v_paid_in_cycle,
    a.v_open_bill,                                  -- total_used = só não pagas
    greatest(v_limit - a.v_open_bill, 0)::numeric,  -- available
    case when v_limit > 0
         then round((a.v_open_bill / v_limit) * 100, 2)
         else 0
    end,
    a.v_purchase_count,
    a.v_unpaid_count,
    v_cycle_start,
    v_cycle_end
  from agg a;
end;
$$;
