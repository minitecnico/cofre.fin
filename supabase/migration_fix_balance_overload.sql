-- ============================================================================
-- Migration: remove ambiguidade entre get_balance() e get_balance(text)
-- ============================================================================
-- Execute este script no SQL Editor do Supabase em projetos que já aplicaram
-- migration_monthly.sql. Idempotente: pode rodar várias vezes.

drop function if exists public.get_balance();

create or replace function public.get_balance_forecast(p_months int default 3)
returns table (month text, projected numeric, avg_income numeric, avg_expense numeric)
language plpgsql
security invoker
stable
as $$
declare
  v_avg_income numeric;
  v_avg_expense numeric;
  v_current_balance numeric;
  v_monthly_delta numeric;
  v_running numeric;
  i int;
begin
  select
    coalesce(avg(case when type = 'income'  then amount else 0 end) * 30, 0),
    coalesce(avg(case when type = 'expense' then amount else 0 end) * 30, 0)
    into v_avg_income, v_avg_expense
  from public.transactions
  where user_id = auth.uid()
    and date >= (now() - interval '3 months')::date;

  v_avg_income := coalesce(v_avg_income, 0);
  v_avg_expense := coalesce(v_avg_expense, 0);

  select balance into v_current_balance from public.get_balance(null::text);
  v_monthly_delta := v_avg_income - v_avg_expense;
  v_running := v_current_balance;

  for i in 1..p_months loop
    v_running := v_running + v_monthly_delta;
    return query select
      to_char(date_trunc('month', now() + (i || ' months')::interval), 'YYYY-MM'),
      round(v_running, 2),
      round(v_avg_income, 2),
      round(v_avg_expense, 2);
  end loop;
end;
$$;
