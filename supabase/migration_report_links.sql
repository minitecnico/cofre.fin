-- ============================================================================
-- Migration: encurtador de link in-app para relatórios
-- ============================================================================
-- Guarda um código curto → URL assinada do PDF. O app compartilha
-- "https://<dominio>/r/<code>" (curto, domínio próprio) e a rota pública /r/:code
-- resolve via RPC e redireciona pro PDF.
--
-- Segurança: a TABELA é dono-apenas (RLS). O anônimo NÃO lê a tabela direto
-- (evita enumerar todas as URLs). A resolução é feita por uma RPC
-- SECURITY DEFINER que devolve só a URL de UM código exato.
-- Idempotente.
-- ============================================================================

create table if not exists public.report_links (
  code        text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  url         text not null,
  created_at  timestamptz default now()
);
create index if not exists idx_report_links_user on public.report_links(user_id);

alter table public.report_links enable row level security;

-- Dono gerencia os próprios links
drop policy if exists "report_links_dono" on public.report_links;
create policy "report_links_dono" on public.report_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- RPC pública de resolução: anônimo passa o código, recebe só aquela URL.
-- SECURITY DEFINER ignora o RLS, mas só expõe 1 linha por código exato.
create or replace function public.resolve_report_link(p_code text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select url from public.report_links where code = p_code limit 1;
$$;

grant execute on function public.resolve_report_link(text) to anon, authenticated;
