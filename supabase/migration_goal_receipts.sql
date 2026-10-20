-- ============================================================================
-- Migration: comprovantes de PIX nas metas (Objetivos)
-- ============================================================================
-- A pessoa anexa o comprovante do PIX que fez pra guardar dinheiro numa meta —
-- junto com o depósito ("Adicionar valor") ou depois, avulso.
--
-- 1. tabela `goal_receipts` → uma linha por arquivo (valor é opcional: só vem
--    preenchido quando o comprovante foi anexado no depósito).
-- 2. bucket PRIVADO `goal-receipts` → o arquivo em si, em
--    "{user_id}/{goal_id}/{uuid}.{ext}". O app abre via signed URL.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1. Tabela
create table if not exists public.goal_receipts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  goal_id     uuid not null references public.goals(id) on delete cascade,
  amount      numeric(12, 2),
  file_path   text not null,
  file_name   text not null,
  mime_type   text not null,
  created_at  timestamptz default now()
);
create index if not exists idx_goal_receipts_goal on public.goal_receipts(goal_id);

alter table public.goal_receipts enable row level security;

-- Dono gerencia os próprios comprovantes — e só pode anexar em meta que é dele
-- (a FK sozinha aceitaria o id de uma meta alheia).
drop policy if exists "goal_receipts_dono" on public.goal_receipts;
create policy "goal_receipts_dono" on public.goal_receipts
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );

-- 2. Bucket privado: até 5 MB, só imagem ou PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'goal-receipts', 'goal-receipts', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policies — cada usuário só enxerga/manipula a PRÓPRIA pasta.
drop policy if exists "goal_receipts_select_own" on storage.objects;
create policy "goal_receipts_select_own" on storage.objects
  for select using (
    bucket_id = 'goal-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "goal_receipts_insert_own" on storage.objects;
create policy "goal_receipts_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'goal-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "goal_receipts_delete_own" on storage.objects;
create policy "goal_receipts_delete_own" on storage.objects
  for delete using (
    bucket_id = 'goal-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
