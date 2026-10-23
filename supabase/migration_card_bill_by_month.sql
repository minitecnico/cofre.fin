-- ============================================================================
-- Migration: fatura do cartão = lançamentos do MÊS (vence no due_day dele)
-- ============================================================================
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- COMO O USUÁRIO LANÇA O CARTÃO: uma despesa por cartão por mês, com o total
-- da fatura, datada perto do vencimento (ex.: Nubank vence dia 12 → lança
-- "Diversos" em 13/10 = fatura de outubro).
--
-- A regra antiga (bill_month_for_purchase) tratava a data como DIA DA COMPRA:
-- depois do fechamento, ia pra fatura seguinte. Com o uso acima, o lançamento
-- de 13/10 (fecha dia 5) caía na fatura de NOVEMBRO — e a fatura de outubro,
-- já paga, aparecia como "novembro paga".
--
-- REGRA NOVA:
--   - Fatura do mês M = despesas do cartão com data dentro de M.
--   - Vence em M no due_day; fecha no closing_day (em M se closing_day <
--     due_day, senão no mês anterior). Dia além do fim do mês → último dia.
--   - Fatura atual = a primeira que ainda não venceu (vence hoje ou depois).
--   - Limite ocupado = o que falta pagar da fatura atual (mesma ideia de antes).
--
-- Reescreve — e passa a versionar — get_card_bills, get_card_bill_transactions,
-- pay_card_bill e get_card_summary (as duas primeiras e o pay_card_bill com mês
-- só existiam no banco). bill_month_for_purchase deixa de ser usada por elas,
-- mas fica no banco.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('get_card_summary', 'get_card_bills', 'get_card_bill_transactions', 'pay_card_bill')
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Datas da fatura do mês p_bill_month (qualquer dia do mês serve).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.card_bill_dates(p_closing_day int, p_due_day int, p_bill_month date)
returns table (closes_on date, due_on date)
language sql
immutable
as $$
  with m as (
    select date_trunc('month', p_bill_month::timestamp)::date                       as cur,
           (date_trunc('month', p_bill_month::timestamp) - interval '1 month')::date as prev
  )
  select
    case when p_closing_day < p_due_day
         then m.cur  + least(p_closing_day, extract(day from m.cur  + interval '1 month' - interval '1 day')::int) - 1
         else m.prev + least(p_closing_day, extract(day from m.prev + interval '1 month' - interval '1 day')::int) - 1
    end,
    m.cur + least(p_due_day, extract(day from m.cur + interval '1 month' - interval '1 day')::int) - 1
  from m;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Faturas do cartão (só meses com lançamentos), da mais antiga à mais nova.
-- ─────────────────────────────────────────────────────────────────────────
create function public.get_card_bills(p_card_id uuid)
returns table (
  bill_month date,
  closes_on date,
  due_on date,
  total_amount numeric,
  paid_amount numeric,
  unpaid_amount numeric,
  purchase_count bigint,
  is_fully_paid boolean,
  is_closed boolean
)
language sql
stable
as $$
  select b.month, d.closes_on, d.due_on,
         b.total, b.paid, b.total - b.paid, b.n,
         b.unpaid_n = 0,
         d.closes_on < current_date
    from (
      select date_trunc('month', t.date::timestamp)::date                  as month,
             sum(t.amount)::numeric                                        as total,
             coalesce(sum(t.amount) filter (where t.paid), 0)::numeric     as paid,
             count(*)::bigint                                              as n,
             count(*) filter (where not t.paid)                            as unpaid_n
        from public.transactions t
       where t.credit_card_id = p_card_id
         and t.user_id = auth.uid()
         and t.type = 'expense'
       group by 1
    ) b
    join public.credit_cards cc on cc.id = p_card_id and cc.user_id = auth.uid()
    cross join lateral public.card_bill_dates(cc.closing_day, cc.due_day, b.month) d
   order by b.month;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Lançamentos de UMA fatura (detalhe).
-- ─────────────────────────────────────────────────────────────────────────
create function public.get_card_bill_transactions(p_card_id uuid, p_bill_month date)
returns table (
  id                 uuid,
  description        text,
  amount             numeric,
  date               date,
  paid               boolean,
  installment_number integer,
  installment_total  integer,
  category_name      text,
  category_color     text
)
language sql
stable
as $$
  select t.id, t.description, t.amount, t.date, t.paid,
         t.installment_number, t.installment_total, c.name, c.color
    from public.transactions t
    left join public.categories c on c.id = t.category_id
   where t.credit_card_id = p_card_id
     and t.user_id = auth.uid()
     and t.type = 'expense'
     and t.date >= date_trunc('month', p_bill_month::timestamp)::date
     and t.date <  (date_trunc('month', p_bill_month::timestamp) + interval '1 month')::date
   order by t.date asc, t.id asc;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Paga uma fatura (marca os lançamentos não pagos do mês). Sem mês: paga a
-- mais antiga com algo em aberto. Retorna quantos foram marcados.
-- ─────────────────────────────────────────────────────────────────────────
create function public.pay_card_bill(p_card_id uuid, p_bill_month date default null)
returns int
language plpgsql
security invoker
volatile
as $$
declare
  v_month date;
  v_count int;
begin
  if not exists (select 1 from public.credit_cards cc where cc.id = p_card_id and cc.user_id = auth.uid()) then
    raise exception 'Cartão não encontrado ou sem permissão';
  end if;

  v_month := coalesce(
    date_trunc('month', p_bill_month::timestamp)::date,
    (select date_trunc('month', min(t.date)::timestamp)::date
       from public.transactions t
      where t.credit_card_id = p_card_id and t.user_id = auth.uid()
        and t.type = 'expense' and not t.paid)
  );
  if v_month is null then return 0; end if;

  update public.transactions as t
     set paid = true
   where t.credit_card_id = p_card_id
     and t.user_id = auth.uid()
     and t.type = 'expense'
     and not t.paid
     and t.date >= v_month
     and t.date <  (v_month + interval '1 month')::date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Resumo do cartão: fatura atual + limite. Mesmas colunas de antes.
-- ─────────────────────────────────────────────────────────────────────────
create function public.get_card_summary(p_card_id uuid)
returns table (
  card_limit numeric,
  open_bill numeric,          -- falta pagar da fatura atual (ocupa limite)
  paid_in_cycle numeric,      -- já pago da fatura atual
  total_used numeric,         -- = open_bill
  available numeric,          -- card_limit - open_bill
  utilization_percent numeric,
  purchase_count bigint,      -- lançamentos da fatura atual
  unpaid_count bigint,        -- lançamentos não pagos da fatura atual
  cycle_start date,           -- 1º dia do mês da fatura atual
  cycle_end date              -- dia em que a fatura atual fecha (alerta "fecha em X dias")
)
language plpgsql
security invoker
stable
as $$
declare
  v_closing int;
  v_due_day int;
  v_limit numeric;
  v_month date := date_trunc('month', current_date::timestamp)::date;
  v_due date;
  v_closes date;
begin
  select cc.closing_day, cc.due_day, coalesce(cc.card_limit, 0)
    into v_closing, v_due_day, v_limit
    from public.credit_cards cc
   where cc.id = p_card_id and cc.user_id = auth.uid();
  if not found then return; end if;

  -- Fatura atual: a deste mês, se ainda não venceu; senão a do mês que vem.
  select d.due_on into v_due from public.card_bill_dates(v_closing, v_due_day, v_month) d;
  if current_date > v_due then
    v_month := (v_month + interval '1 month')::date;
  end if;
  select d.closes_on into v_closes from public.card_bill_dates(v_closing, v_due_day, v_month) d;

  return query
  select
    v_limit,
    a.unpaid_total,
    a.paid_total,
    a.unpaid_total,
    greatest(v_limit - a.unpaid_total, 0)::numeric,
    case when v_limit > 0 then round(a.unpaid_total / v_limit * 100, 2) else 0 end,
    a.tx_count,
    a.unpaid_tx,
    v_month,
    v_closes
  from (
    select coalesce(sum(t.amount) filter (where not t.paid), 0)::numeric as unpaid_total,
           coalesce(sum(t.amount) filter (where t.paid), 0)::numeric     as paid_total,
           count(*)::bigint                                              as tx_count,
           count(*) filter (where not t.paid)::bigint                    as unpaid_tx
      from public.transactions t
     where t.credit_card_id = p_card_id
       and t.user_id = auth.uid()
       and t.type = 'expense'
       and t.date >= v_month
       and t.date <  (v_month + interval '1 month')::date
  ) a;
end;
$$;
