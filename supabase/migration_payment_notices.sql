-- ============================================================================
-- Migration: Cobranças — aviso de pagamento do devedor → credor
-- ============================================================================
-- Quando o devedor toca em "Pagar" no extrato público (/extrato/:code), o app
-- registra um AVISO com as parcelas escolhidas e o credor é NOTIFICADO em tempo
-- real (Supabase Realtime). O aviso é só notificação: não altera nenhuma
-- parcela — marcar como pago continua sendo manual, pelo credor.
--
--   payment_notices          → avisos (pending = novo · dismissed = visto)
--   notify_payment()         → anon, via share_code. Valida as parcelas e
--                              recalcula o valor no servidor (não confia no front).
--                              Anti-spam: mesmo conjunto em 10 min não duplica;
--                              teto de 30 avisos/dia por devedor.
--   resolve_debtor_statement → recriada devolvendo o `id` de cada cobrança
--                              (necessário pro aviso; ids são uuid e o anon não
--                              consegue fazer nada com eles fora destas RPCs).
-- Idempotente.
-- ============================================================================

create table if not exists public.payment_notices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  debtor_id   uuid not null references public.debtors(id) on delete cascade,
  charge_ids  uuid[] not null,
  amount      numeric(12, 2) not null,
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_payment_notices_user on public.payment_notices(user_id, status, created_at desc);
create index if not exists idx_payment_notices_debtor on public.payment_notices(debtor_id, created_at desc);

alter table public.payment_notices enable row level security;
drop policy if exists "payment_notices_dono" on public.payment_notices;
create policy "payment_notices_dono" on public.payment_notices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: o app do credor escuta os inserts (RLS filtra só os dele).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_notices'
  ) then
    alter publication supabase_realtime add table public.payment_notices;
  end if;
end $$;

-- ── RPC pública: devedor avisa que gerou o PIX ──────────────────────────────
drop function if exists public.notify_payment(text, uuid[]);
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

  select id, user_id into v_debtor from public.debtors where share_code = p_code;
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

-- Aviso é SÓ notificação: não existe RPC que marque parcelas como pagas a
-- partir dele. Remove a versão anterior desta migration, se já foi aplicada.
drop function if exists public.confirm_payment_notice(uuid);

-- ── Extrato público: agora com o id de cada cobrança ────────────────────────
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
