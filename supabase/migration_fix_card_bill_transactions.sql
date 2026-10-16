-- ============================================================================
-- Migration: corrige get_card_bill_transactions (detalhe da fatura do cartão)
-- ============================================================================
-- Bug: a função devolve uma coluna chamada `id` (RETURNS TABLE), e a busca do
-- cartão usava `where id = p_card_id` sem qualificar. No PL/pgSQL isso é
-- ambíguo (variável de saída `id` × coluna credit_cards.id) → erro 42702 em
-- TODA chamada: o detalhe das compras de cada fatura nunca carregava.
--
-- Correção: qualificar com alias (cc.id / cc.user_id). Lógica idêntica à que
-- estava no banco — esta função existia só lá, agora fica versionada aqui.
-- Segue SECURITY INVOKER (padrão): RLS + auth.uid() garantem que só o dono vê.
-- Depende de public.bill_month_for_purchase(int, date), já existente no banco.
-- Idempotente.
-- ============================================================================

create or replace function public.get_card_bill_transactions(p_card_id uuid, p_bill_month date)
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
language plpgsql
stable
as $function$
declare
  v_closing_day int;
begin
  select cc.closing_day into v_closing_day
    from public.credit_cards cc
   where cc.id = p_card_id and cc.user_id = auth.uid();
  if not found then return; end if;

  return query
  select t.id, t.description, t.amount, t.date, t.paid,
         t.installment_number, t.installment_total, c.name, c.color
    from public.transactions t
    left join public.categories c on c.id = t.category_id
   where t.credit_card_id = p_card_id
     and t.user_id = auth.uid()
     and t.type = 'expense'
     and public.bill_month_for_purchase(v_closing_day, t.date) = p_bill_month
   order by t.date asc, t.id asc;
end;
$function$;
