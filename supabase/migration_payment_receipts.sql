-- ============================================================================
-- Migration: devedor envia o comprovante do PIX pelo extrato público
-- ============================================================================
-- Depois de pagar, o banco gera o comprovante; o devedor salva e envia pelo
-- próprio extrato (/extrato/:code, sem login). O comprovante entra no AVISO DE
-- PAGAMENTO que ele gerou ao tocar em "Pagar" — e o aviso volta pra lista do
-- credor em Cobranças, agora com o arquivo.
--
--   payment_receipts               → um arquivo por linha (dono = credor)
--   bucket privado payment-receipts → "{share_code}/{uuid}.{ext}"
--   payment_receipt_upload_ok()    → a policy de upload do anon: código válido,
--                                    aviso nas últimas 24h, até 10 arquivos/dia
--   attach_payment_receipt()       → anon registra o arquivo enviado (valida
--                                    tudo no servidor; não confia no front)
--
-- Rodar DEPOIS de migration_payment_notices.sql e migration_extrato_expiry.sql.
-- Idempotente.
-- ============================================================================

create table if not exists public.payment_receipts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  debtor_id   uuid not null references public.debtors(id) on delete cascade,
  notice_id   uuid not null references public.payment_notices(id) on delete cascade,
  file_path   text not null unique,
  file_name   text not null,
  mime_type   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_payment_receipts_notice on public.payment_receipts(notice_id);
create index if not exists idx_payment_receipts_debtor on public.payment_receipts(debtor_id, created_at desc);

alter table public.payment_receipts enable row level security;

-- Credor lê e apaga os dele. Inserir só pela RPC (sem policy de insert).
drop policy if exists "payment_receipts_dono_le" on public.payment_receipts;
create policy "payment_receipts_dono_le" on public.payment_receipts
  for select using (auth.uid() = user_id);
drop policy if exists "payment_receipts_dono_apaga" on public.payment_receipts;
create policy "payment_receipts_dono_apaga" on public.payment_receipts
  for delete using (auth.uid() = user_id);

-- Realtime: o app do credor fica sabendo na hora (RLS filtra só os dele).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_receipts'
  ) then
    alter publication supabase_realtime add table public.payment_receipts;
  end if;
end $$;

-- ── Bucket privado: até 5 MB, só imagem ou PDF ──────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts', 'payment-receipts', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Quem pode subir arquivo na pasta de um código ───────────────────────────
-- SECURITY DEFINER: o anon não enxerga debtors/payment_notices/storage.objects.
create or replace function public.payment_receipt_upload_ok(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.debtors d
     where d.share_code = p_code
       and length(p_code) >= 16
       and (d.share_expires_at is null or d.share_expires_at > now())
       -- só depois de "Pagar": precisa de um aviso recente pra anexar
       and exists (
         select 1 from public.payment_notices n
          where n.debtor_id = d.id and n.created_at > now() - interval '1 day'
       )
  )
  -- anti-spam: até 10 arquivos por dia na pasta do código
  and (
    select count(*) from storage.objects o
     where o.bucket_id = 'payment-receipts'
       and (storage.foldername(o.name))[1] = p_code
       and o.created_at > now() - interval '1 day'
  ) < 10;
$$;
grant execute on function public.payment_receipt_upload_ok(text) to anon, authenticated;

drop policy if exists "payment_receipts_upload" on storage.objects;
create policy "payment_receipts_upload" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'payment-receipts'
    and public.payment_receipt_upload_ok((storage.foldername(name))[1])
  );

-- Credor abre e apaga o arquivo pelo registro em payment_receipts.
drop policy if exists "payment_receipts_select" on storage.objects;
create policy "payment_receipts_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.payment_receipts r
       where r.file_path = objects.name and r.user_id = auth.uid()
    )
  );

drop policy if exists "payment_receipts_delete" on storage.objects;
create policy "payment_receipts_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.payment_receipts r
       where r.file_path = objects.name and r.user_id = auth.uid()
    )
  );

-- ── RPC pública: registra o comprovante no aviso mais recente ───────────────
create or replace function public.attach_payment_receipt(
  p_code text, p_path text, p_file_name text, p_mime text
)
returns boolean
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_debtor record;
  v_notice uuid;
begin
  if p_code is null or length(p_code) < 16 or p_path is null
     or p_path not like p_code || '/%'
     or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    return false;
  end if;

  select id, user_id into v_debtor from public.debtors
   where share_code = p_code
     and (share_expires_at is null or share_expires_at > now());
  if not found then return false; end if;

  -- O arquivo tem que existir de verdade no bucket.
  if not exists (
    select 1 from storage.objects where bucket_id = 'payment-receipts' and name = p_path
  ) then
    return false;
  end if;

  select id into v_notice from public.payment_notices
   where debtor_id = v_debtor.id and created_at > now() - interval '1 day'
   order by created_at desc limit 1;
  if v_notice is null then return false; end if;

  insert into public.payment_receipts (user_id, debtor_id, notice_id, file_path, file_name, mime_type)
  values (v_debtor.user_id, v_debtor.id, v_notice, p_path, left(coalesce(p_file_name, 'comprovante'), 120), p_mime)
  on conflict (file_path) do nothing;

  -- O aviso volta pra lista do credor, agora com o comprovante.
  update public.payment_notices set status = 'pending' where id = v_notice;
  return true;
end;
$$;
grant execute on function public.attach_payment_receipt(text, text, text, text) to anon, authenticated;
