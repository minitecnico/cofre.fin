-- ============================================================================
-- Migration: múltiplas chaves PIX + links de pagamento (QR imagem + curto)
-- ============================================================================
-- 1. pix_keys  → o usuário cadastra VÁRIAS chaves PIX (rótulo, tipo, etc).
-- 2. pix_links → cada "cobrar via PIX" vira um link curto público: guarda o
--    copia-e-cola, o valor, o recebedor e a URL do QR (imagem no Storage).
-- 3. bucket público `pix-qr` → guarda a imagem PNG do QR.
-- 4. RPC resolve_pix_link → a página pública /pix/:code resolve sem login.
-- Idempotente.
-- ============================================================================

-- ── 1. Chaves PIX (múltiplas) ───────────────────────────────────────────────
create table if not exists public.pix_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text,                 -- ex: "Nubank", "Conta PJ"
  key         text not null,
  key_type    text check (key_type in ('cpf','cnpj','email','phone','random')),
  name        text not null,        -- nome do recebedor (vai no payload EMV)
  city        text not null,        -- cidade do recebedor (vai no payload EMV)
  is_default  boolean not null default false,
  created_at  timestamptz default now()
);
create index if not exists idx_pix_keys_user on public.pix_keys(user_id);

-- ── 2. Links de pagamento PIX ───────────────────────────────────────────────
create table if not exists public.pix_links (
  code           text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  payload        text not null,     -- copia e cola (BR Code)
  amount         numeric(12,2),
  recipient_name text,
  qr_url         text,              -- URL pública da imagem do QR no Storage
  created_at     timestamptz default now()
);
create index if not exists idx_pix_links_user on public.pix_links(user_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.pix_keys  enable row level security;
alter table public.pix_links enable row level security;

drop policy if exists "pix_keys_dono" on public.pix_keys;
create policy "pix_keys_dono" on public.pix_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "pix_links_dono" on public.pix_links;
create policy "pix_links_dono" on public.pix_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3. Bucket público para o QR (imagem é pública por natureza) ─────────────
insert into storage.buckets (id, name, public)
values ('pix-qr', 'pix-qr', true)
on conflict (id) do update set public = true;

drop policy if exists "pixqr_insert_own" on storage.objects;
create policy "pixqr_insert_own" on storage.objects
  for insert with check (bucket_id = 'pix-qr' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pixqr_update_own" on storage.objects;
create policy "pixqr_update_own" on storage.objects
  for update using (bucket_id = 'pix-qr' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pixqr_delete_own" on storage.objects;
create policy "pixqr_delete_own" on storage.objects
  for delete using (bucket_id = 'pix-qr' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── 4. RPC pública de resolução (página /pix/:code, sem login) ──────────────
drop function if exists public.resolve_pix_link(text);
create or replace function public.resolve_pix_link(p_code text)
returns table (payload text, amount numeric, recipient_name text, qr_url text)
language sql
security definer
set search_path = public
stable
as $$
  select payload, amount, recipient_name, qr_url
  from public.pix_links where code = p_code limit 1;
$$;
grant execute on function public.resolve_pix_link(text) to anon, authenticated;

-- ── Seed: migra a chave única antiga (user_settings) p/ pix_keys ────────────
insert into public.pix_keys (user_id, label, key, key_type, name, city, is_default)
select user_id, 'Principal', pix_key, pix_key_type, pix_name, pix_city, true
from public.user_settings
where pix_key is not null and pix_name is not null and pix_city is not null
  and not exists (select 1 from public.pix_keys k where k.user_id = user_settings.user_id);
