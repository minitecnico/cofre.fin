-- ============================================================================
-- Migration: Cotação — planilhas do cliente com itens destacados
-- ============================================================================
-- A pessoa envia a planilha (.xlsx/.xls/.csv), o app lê no navegador e guarda:
--   quotes       → cabeçalho (columns) e linhas (rows) de cada planilha
--   quote_marks  → um registro por linha destacada (row_index)
--
-- Destaque em tabela própria (e não numa coluna da cotação) porque várias
-- pessoas usam a mesma conta ao mesmo tempo: cada toque grava só a SUA linha,
-- então dois aparelhos marcando juntos não se apagam. Realtime em quote_marks
-- faz o destaque de um aparecer na tela do outro na hora.
--
-- RLS: cada conta só vê e mexe nas próprias cotações.
-- Idempotente — e converte a versão anterior (coluna quotes.highlighted).
-- ============================================================================

create table if not exists public.quotes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(name) between 1 and 200),
  columns     jsonb not null default '[]'::jsonb,
  rows        jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_quotes_user on public.quotes(user_id, updated_at desc);

alter table public.quotes enable row level security;
drop policy if exists "quotes_dono" on public.quotes;
create policy "quotes_dono" on public.quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.quote_marks (
  quote_id   uuid not null references public.quotes(id) on delete cascade,
  row_index  int  not null check (row_index >= 0),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (quote_id, row_index)
);

alter table public.quote_marks enable row level security;
drop policy if exists "quote_marks_dono" on public.quote_marks;
create policy "quote_marks_dono" on public.quote_marks
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.quotes q where q.id = quote_id and q.user_id = auth.uid())
  );

-- Versão anterior guardava os destaques numa coluna da cotação: migra e remove.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quotes' and column_name = 'highlighted'
  ) then
    insert into public.quote_marks (quote_id, row_index, user_id)
    select q.id, h, q.user_id from public.quotes q, unnest(q.highlighted) as h
    on conflict do nothing;
    alter table public.quotes drop column highlighted;
  end if;
end $$;

-- Realtime: destaque feito num aparelho aparece nos outros.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quote_marks'
  ) then
    alter publication supabase_realtime add table public.quote_marks;
  end if;
end $$;
