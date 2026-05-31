-- ============================================================================
-- Migration: duração (fim) das recorrências
-- ============================================================================
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Antes, toda recorrência era "para sempre" (gerava indefinidamente).
-- Agora o usuário pode definir POR QUANTOS MESES a recorrência deve gerar
-- (ex.: 2 meses, 12 meses). Guardamos isso como `end_month`: o primeiro dia
-- do ÚLTIMO mês em que a transação deve ser criada.
--
--   duração de N meses, começando em start_month
--     → end_month = start_month + (N - 1) meses
--
-- end_month NULL  = recorrência sem fim (comportamento antigo, indefinido).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. COLUNA — end_month (nullable; null = sem fim)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.recurring_transactions
  add column if not exists end_month date;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. FUNÇÃO — gera as recorrências do mês, respeitando o fim (end_month)
-- ─────────────────────────────────────────────────────────────────────────
-- Mesma lógica de antes, com UMA condição nova no filtro: só gera se o mês
-- alvo estiver dentro da janela [start_month, end_month]. Continua idempotente.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.generate_recurring_for_month(p_month text)
returns int
language plpgsql
security invoker
volatile
as $$
declare
  v_month_start date;
  v_month_end date;
  v_last_day int;
  v_target_day int;
  v_target_date date;
  v_created int := 0;
  v_recurring record;
begin
  -- Valida e parseia o mês alvo
  v_month_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_month_end := (v_month_start + interval '1 month')::date;
  v_last_day := extract(day from (v_month_end - interval '1 day'))::int;

  -- Itera por cada modelo ativo do usuário cuja janela cobre o mês alvo:
  --   start_month <= mês alvo  E  (sem fim OU end_month >= mês alvo)
  for v_recurring in
    select *
    from public.recurring_transactions
    where user_id = auth.uid()
      and active = true
      and start_month <= v_month_start
      and (end_month is null or end_month >= v_month_start)
  loop
    -- Determina o dia: respeita day_of_month, ajustando pro último dia
    -- caso o mês alvo seja menor (ex: dia 31 em fevereiro → dia 28/29)
    v_target_day := least(v_recurring.day_of_month, v_last_day);
    v_target_date := v_month_start + (v_target_day - 1) * interval '1 day';

    -- Já existe uma transação desse modelo no mês alvo? Se sim, pula.
    if not exists (
      select 1 from public.transactions
      where user_id = auth.uid()
        and recurring_id = v_recurring.id
        and date >= v_month_start
        and date < v_month_end
    ) then
      insert into public.transactions (
        user_id, type, amount, description, date,
        category_id, credit_card_id, recurring_id, paid
      )
      values (
        auth.uid(),
        v_recurring.type,
        v_recurring.amount,
        v_recurring.description,
        v_target_date,
        v_recurring.category_id,
        v_recurring.credit_card_id,
        v_recurring.id,
        v_recurring.type = 'income' -- receitas já vêm marcadas como "pagas/recebidas"
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$$;
