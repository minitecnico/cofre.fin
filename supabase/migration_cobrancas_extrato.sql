-- ============================================================================
-- Migration: Cobranças — extrato público do devedor ("carteira")
-- ============================================================================
-- O credor envia ao devedor um link <dominio>/extrato/<code>. A página pública
-- (sem login) mostra, AO VIVO: total da dívida, quanto já pagou, quanto falta,
-- parcelas pagas × pendentes, e um PIX pra pagar o que está em aberto.
--
--   debtors.share_code         → código do link (null = nunca compartilhado).
--                                Gerado no front com CSPRNG (utils/randomCode).
--   resolve_debtor_statement() → RPC SECURITY DEFINER liberada pro anon.
--
-- Segurança: o código É a credencial (mesmo modelo de /pix e /r). A RPC só
-- devolve o extrato de UM código exato e nunca expõe telefone, observação,
-- cartão ou ids. Para revogar um link, o app gera um código novo.
-- Idempotente.
-- ============================================================================

alter table public.debtors
  add column if not exists share_code text unique;

drop function if exists public.resolve_debtor_statement(text);
create or replace function public.resolve_debtor_statement(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'debtor_name', d.name,
    'owner_name', coalesce(
      k.name,
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name'
    ),
    'pix', case when k.key is null then null else jsonb_build_object(
      'key', k.key, 'key_type', k.key_type, 'name', k.name, 'city', k.city
    ) end,
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description',          c.description,
        'amount',               c.amount,
        'due_date',             c.due_date,
        'paid',                 c.paid,
        'paid_at',              c.paid_at,
        'installment_number',   c.installment_number,
        'installment_total',    c.installment_total,
        'installment_group_id', c.installment_group_id
      ) order by c.due_date nulls last, c.created_at)
      from public.charges c
      where c.debtor_id = d.id and c.user_id = d.user_id
    ), '[]'::jsonb)
  )
  from public.debtors d
  left join auth.users u on u.id = d.user_id
  left join lateral (
    select pk.key, pk.key_type, pk.name, pk.city
    from public.pix_keys pk
    where pk.user_id = d.user_id
    order by pk.is_default desc, pk.created_at asc
    limit 1
  ) k on true
  where d.share_code = p_code
    and length(p_code) >= 16
  limit 1;
$$;

grant execute on function public.resolve_debtor_statement(text) to anon, authenticated;
