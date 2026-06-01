-- ============================================================================
-- Migration: visualização por mês (cada mês como ciclo fechado)
-- ============================================================================
-- Execute este script no SQL Editor do Supabase.
-- Idempotente: pode rodar várias vezes sem problema.
--
-- O QUE MUDA:
--   - get_balance() agora aceita um parâmetro `p_month` (formato: '2026-04')
--   - get_period_summary() segue funcionando com day/week/month, mas o "month"
--     agora respeita o mês passado em p_reference (não força mês atual)
--   - get_expenses_by_category() aceita p_month
--
-- A IDEIA: o frontend escolhe um mês ('2026-04', '2026-05'...) e todas as
-- consultas devolvem dados APENAS desse mês — sem misturar.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- Saldo do mês selecionado: receitas do mês − despesas do mês
-- p_month: 'YYYY-MM' (ex: '2026-04'). Se NULL, usa mês atual.
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.get_balance();

create or replace function public.get_balance(p_month text default null)
returns table (balance numeric, total_income numeric, total_expense numeric)
language plpgsql
security invoker
stable
as $$
declare
  v_start date;
  v_end date;
begin
  -- Se mês não especificado, usa o atual
  if p_month is null then
    v_start := date_trunc('month', current_date)::date;
  else
    v_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  end if;
  v_end := (v_start + interval '1 month')::date;

  return query
    select
      coalesce(sum(case when type = 'income'  then amount else 0 end), 0)
        - coalesce(sum(case when type = 'expense' then amount else 0 end), 0),
      coalesce(sum(case when type = 'income'  then amount else 0 end), 0),
      coalesce(sum(case when type = 'expense' then amount else 0 end), 0)
    from public.transactions
    where user_id = auth.uid()
      and date >= v_start
      and date <  v_end;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Resumo do período. Para 'month', usa p_reference como mês.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_period_summary(
  p_period text default 'month',
  p_reference text default null  -- 'YYYY-MM' para mês específico
)
returns table (income numeric, expense numeric, balance numeric, tx_count bigint)
language plpgsql
security invoker
stable
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
  v_ref_date date;
begin
  -- Resolve a data de referência
  if p_reference is not null then
    v_ref_date := to_date(p_reference || '-01', 'YYYY-MM-DD');
  else
    v_ref_date := current_date;
  end if;

  if p_period = 'day' then
    v_start := date_trunc('day', v_ref_date::timestamptz);
    v_end   := v_start + interval '1 day';
  elsif p_period = 'week' then
    v_start := date_trunc('week', v_ref_date::timestamptz);
    v_end   := v_start + interval '1 week';
  else
    v_start := date_trunc('month', v_ref_date::timestamptz);
    v_end   := v_start + interval '1 month';
  end if;

  return query
    select
      coalesce(sum(case when type = 'income'  then amount else 0 end), 0),
      coalesce(sum(case when type = 'expense' then amount else 0 end), 0),
      coalesce(sum(case when type = 'income'  then amount else -amount end), 0),
      count(*)::bigint
    from public.transactions
    where user_id = auth.uid()
      and date >= v_start::date
      and date <  v_end::date;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Despesas por categoria do mês selecionado
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_expenses_by_category(p_month text default null)
returns table (
  category_id uuid,
  name text,
  color text,
  icon text,
  total numeric,
  tx_count bigint
)
language plpgsql
security invoker
stable
as $$
declare
  v_start date;
  v_end date;
begin
  if p_month is null then
    v_start := date_trunc('month', current_date)::date;
  else
    v_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  end if;
  v_end := (v_start + interval '1 month')::date;

  return query
    select
      c.id,
      c.name,
      c.color,
      c.icon,
      coalesce(sum(t.amount), 0)::numeric,
      count(t.id)::bigint
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.user_id = auth.uid()
      and t.type = 'expense'
      and t.date >= v_start
      and t.date <  v_end
    group by c.id, c.name, c.color, c.icon
    order by sum(t.amount) desc;
end;
$$;
