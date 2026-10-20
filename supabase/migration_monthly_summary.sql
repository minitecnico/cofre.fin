-- ============================================================================
-- Migration: receita, despesa e saldo mês a mês (gráfico do Dashboard)
-- ============================================================================
-- Substitui a antiga get_monthly_history (removida em migration_drop_reports.sql),
-- que contava a partir de HOJE. Esta termina no mês escolhido no app
-- (MonthContext) e devolve todos os meses do intervalo, inclusive os vazios.
--
-- Saldo do mês = receitas − despesas (regra mestra: despesa no cartão conta).
-- security invoker: o RLS de transactions filtra pelo usuário logado.
-- Idempotente.
-- ============================================================================

create or replace function public.get_monthly_summary(p_end_month text, p_months int default 6)
returns table (month text, income numeric, expense numeric, balance numeric)
language sql
security invoker
stable
as $$
  with periods as (
    select generate_series(
      to_date(p_end_month, 'YYYY-MM') - make_interval(months => least(greatest(p_months, 1), 24) - 1),
      to_date(p_end_month, 'YYYY-MM'),
      interval '1 month'
    )::date as month_start
  )
  select to_char(p.month_start, 'YYYY-MM'),
         coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
         coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
         coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
           - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
    from periods p
    left join public.transactions t
      on t.user_id = auth.uid()
     and t.date >= p.month_start
     and t.date < (p.month_start + interval '1 month')
   group by p.month_start
   order by p.month_start;
$$;

revoke execute on function public.get_monthly_summary(text, int) from public, anon;
grant execute on function public.get_monthly_summary(text, int) to authenticated;
