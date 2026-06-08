-- ============================================================================
-- Migration: Empregos / Buscador de Vagas — vagas salvas (favoritos)
-- ----------------------------------------------------------------------------
-- A busca em si é stateless (vai pro serverless /api/jobs e volta). Só
-- persistimos o que é do usuário: as vagas que ele favoritou.
-- O histórico de buscas fica no sessionStorage do front (não precisa tabela).
--
-- RLS: mesma regra única do resto do app — dono enxerga só o que é seu.
-- Idempotente; pode rodar mais de uma vez.
-- ============================================================================

create table if not exists public.saved_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  job_id       text not null,            -- id normalizado do provider (ex: remotive-123)
  source       text not null,            -- Remotive, Arbeitnow, ...
  title        text not null,
  company      text,
  location     text,
  work_mode    text,                     -- remote | hybrid | onsite
  contract_type text,
  salary_min   numeric(12, 2),
  salary_max   numeric(12, 2),
  apply_url    text,
  published_at text,                     -- guardado como veio do provider
  created_at   timestamptz default now(),
  -- mesmo anúncio não duplica pro mesmo usuário
  unique (user_id, source, job_id)
);

create index if not exists idx_saved_jobs_user on public.saved_jobs(user_id, created_at desc);

alter table public.saved_jobs enable row level security;

drop policy if exists "saved_jobs_owner" on public.saved_jobs;
create policy "saved_jobs_owner" on public.saved_jobs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
