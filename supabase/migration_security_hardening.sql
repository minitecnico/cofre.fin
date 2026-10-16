-- ============================================================================
-- Migration: endurecimento de segurança dos links públicos
-- ============================================================================
-- Achados da revisão de segurança (2026-10-16):
--
-- 1. Links ANTIGOS de relatório (/r/:code) usavam um código derivado do path
--    do PDF (hash djb2 de "{user_id}/relatorio-AAAA-MM.pdf"). Quem conhece o
--    user_id (ele aparece na URL assinada do PDF) calcula o código de qualquer
--    mês e baixa o relatório. Links antigos de PIX usavam Math.random (curtos,
--    enumeráveis). O app gera códigos fortes (16 chars, CSPRNG) desde ago/2026,
--    mas as linhas antigas continuavam resolvendo.
--    → apaga códigos < 16 chars e as RPCs públicas passam a recusá-los.
--
-- 2. report_links.url é gravada pelo próprio usuário (RLS só exige ser dono).
--    Uma URL `javascript:` ou externa transformava /r/:code em XSS/redirect
--    aberto na origem do app. O front agora valida; aqui o banco também barra.
--
-- 3. Códigos curtos não podem mais ser gravados (check constraints).
--
-- ATENÇÃO: links antigos (/r e /pix) que já foram enviados param de funcionar —
-- é a intenção. Gere de novo pelo app se precisar.
-- Idempotente.
-- ============================================================================

-- ── 1. Remove links com código fraco ────────────────────────────────────────
delete from public.report_links where length(code) < 16;
delete from public.pix_links   where length(code) < 16;

alter table public.report_links drop constraint if exists report_links_code_len;
alter table public.report_links add  constraint report_links_code_len check (length(code) >= 16);

alter table public.pix_links drop constraint if exists pix_links_code_len;
alter table public.pix_links add  constraint pix_links_code_len check (length(code) >= 16);

alter table public.debtors drop constraint if exists debtors_share_code_len;
alter table public.debtors add  constraint debtors_share_code_len check (share_code is null or length(share_code) >= 16);

-- ── 2. URLs gravadas só podem apontar pro Storage do Supabase ───────────────
-- (o front ainda confere que é ESTE projeto; aqui barra javascript:/externos)
delete from public.report_links
 where url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/sign/reports/';
alter table public.report_links drop constraint if exists report_links_url_storage;
alter table public.report_links add  constraint report_links_url_storage
  check (url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/sign/reports/');

update public.pix_links set qr_url = null
 where qr_url is not null
   and qr_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/pix-qr/';
alter table public.pix_links drop constraint if exists pix_links_qr_url_storage;
alter table public.pix_links add  constraint pix_links_qr_url_storage
  check (qr_url is null or qr_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/pix-qr/');

-- ── 3. RPCs públicas recusam códigos curtos ─────────────────────────────────
create or replace function public.resolve_report_link(p_code text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select url from public.report_links
   where code = p_code and length(p_code) >= 16
   limit 1;
$$;
grant execute on function public.resolve_report_link(text) to anon, authenticated;

create or replace function public.resolve_pix_link(p_code text)
returns table (payload text, amount numeric, recipient_name text, qr_url text)
language sql
security definer
set search_path = public
stable
as $$
  select payload, amount, recipient_name, qr_url
    from public.pix_links
   where code = p_code and length(p_code) >= 16
   limit 1;
$$;
grant execute on function public.resolve_pix_link(text) to anon, authenticated;
