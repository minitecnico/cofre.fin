-- ============================================================================
-- Migration: validade dos links de extrato (/extrato/:code)
-- ============================================================================
-- Limita o estrago de um link encaminhado pelo devedor pra terceiros:
--
--   debtors.share_expires_at → link vale até essa data (o app grava +90 dias
--                              ao gerar; link vencido é trocado por um novo
--                              automaticamente quando o credor reabre o envio).
--   resolve_debtor_statement → devolve `status`:
--       'expired' → link vencido (nenhum dado)
--       'settled' → dívida quitada (só o nome, pra "tudo pago")
--       'active'  → extrato completo (+ expires_at)
--   notify_payment           → link vencido não gera aviso de pagamento.
--
-- Links já existentes ganham 90 dias a partir de agora.
-- Rode DEPOIS de migration_extrato_pix_label.sql e migration_payment_notices.sql.
-- Idempotente.
-- ============================================================================

alter table public.debtors
  add column if not exists share_expires_at timestamptz;

update public.debtors
   set share_expires_at = now() + interval '90 days'
 where share_code is not null and share_expires_at is null;

-- ── Extrato público com validade e status ───────────────────────────────────
create or replace function public.resolve_debtor_statement(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    -- Link vencido: não revela nada além do status.
    when d.share_expires_at is not null and d.share_expires_at < now()
      then jsonb_build_object('status', 'expired')
    -- Dívida quitada: só o nome, pra mensagem de "tudo pago". Se surgir
    -- cobrança nova, o mesmo link volta a mostrar o extrato.
    when not exists (
      select 1 from public.charges oc
       where oc.debtor_id = d.id and oc.user_id = d.user_id and not oc.paid
    )
      then jsonb_build_object('status', 'settled', 'debtor_name', d.name)
    else jsonb_build_object(
    'status', 'active',
    'expires_at', d.share_expires_at,
    'debtor_name', d.name,
    'owner_name', coalesce(
      k.name,
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name'
    ),
    'pix', case when k.key is null then null else jsonb_build_object(
      'key', k.key, 'key_type', k.key_type, 'name', k.name, 'city', k.city, 'label', k.label
    ) end,
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                   c.id,
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
  ) end
  from public.debtors d
  left join auth.users u on u.id = d.user_id
  left join lateral (
    select pk.key, pk.key_type, pk.name, pk.city, pk.label
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

-- ── Aviso de pagamento: recusa link vencido ─────────────────────────────────
create or replace function public.notify_payment(p_code text, p_charge_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_debtor  record;
  v_ids     uuid[];
  v_amount  numeric;
begin
  if p_code is null or length(p_code) < 16 or p_charge_ids is null then
    return false;
  end if;

  -- Link expirado não gera aviso.
  select id, user_id into v_debtor from public.debtors
   where share_code = p_code
     and (share_expires_at is null or share_expires_at > now());
  if not found then return false; end if;

  -- Só parcelas DESTE devedor e ainda em aberto; valor calculado aqui.
  select array_agg(c.id order by c.id), sum(c.amount)
    into v_ids, v_amount
    from public.charges c
   where c.debtor_id = v_debtor.id
     and c.user_id = v_debtor.user_id
     and not c.paid
     and c.id = any(p_charge_ids);
  if v_ids is null then return false; end if;

  -- Mesmo conjunto há pouco → já avisado (toques repetidos não duplicam).
  if exists (
    select 1 from public.payment_notices n
     where n.debtor_id = v_debtor.id and n.status = 'pending'
       and n.created_at > now() - interval '10 minutes'
       and n.charge_ids @> v_ids and n.charge_ids <@ v_ids
  ) then
    return true;
  end if;

  if (select count(*) from public.payment_notices n
       where n.debtor_id = v_debtor.id and n.created_at > now() - interval '1 day') >= 30 then
    return false;
  end if;

  insert into public.payment_notices (user_id, debtor_id, charge_ids, amount)
  values (v_debtor.user_id, v_debtor.id, v_ids, v_amount);
  return true;
end;
$$;
grant execute on function public.notify_payment(text, uuid[]) to anon, authenticated;
