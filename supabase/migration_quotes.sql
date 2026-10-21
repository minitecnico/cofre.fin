-- ============================================================================
-- Migration: Cotação — planilhas do cliente com itens destacados
-- ============================================================================
-- A pessoa envia a planilha (.xlsx/.xls/.csv), o app lê no navegador e guarda
-- aqui: cabeçalho (columns), linhas (rows) e quais linhas foram destacadas
-- (highlighted = índices das linhas). Reabrir a cotação traz tudo de volta.
--
-- Uma cotação por planilha enviada. RLS padrão: cada um só vê as suas.
-- Idempotente.
-- ============================================================================

create table if not exists public.quotes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(name) between 1 and 200),
  columns     jsonb not null default '[]'::jsonb,
  rows        jsonb not null default '[]'::jsonb,
  highlighted int[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_quotes_user on public.quotes(user_id, updated_at desc);

alter table public.quotes enable row level security;
drop policy if exists "quotes_dono" on public.quotes;
create policy "quotes_dono" on public.quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
