-- ============================================================================
-- Migration: Storage para relatórios em PDF
-- ============================================================================
-- Cria um bucket PRIVADO onde o app guarda os PDFs de relatório gerados.
-- O app sobe em "{user_id}/relatorio-YYYY-MM.pdf" e compartilha via SIGNED URL
-- (link temporário que baixa o arquivo, sem precisar de login).
--
-- Por que Storage e não uma coluna no Postgres: blobs incham a tabela, deixam
-- os SELECTs lentos e complicam o RLS. Storage é feito pra isso.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1. Bucket privado
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- 2. Policies — cada usuário só enxerga/manipula a PRÓPRIA pasta.
--    A pasta é o primeiro segmento do path: storage.foldername(name)[1] = user_id
drop policy if exists "reports_select_own" on storage.objects;
create policy "reports_select_own" on storage.objects
  for select using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reports_insert_own" on storage.objects;
create policy "reports_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reports_update_own" on storage.objects;
create policy "reports_update_own" on storage.objects
  for update using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reports_delete_own" on storage.objects;
create policy "reports_delete_own" on storage.objects
  for delete using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
