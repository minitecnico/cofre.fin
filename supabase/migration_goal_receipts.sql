-- ============================================================================
-- Migration: comprovantes de PIX nas metas (Objetivos)
-- ============================================================================
-- A pessoa anexa o comprovante do PIX que fez pra guardar dinheiro numa meta —
-- junto com o depósito ("Adicionar valor") ou depois, avulso.
--
-- 1. tabela `goal_receipts` → uma linha por arquivo (valor é opcional: só vem
--    preenchido quando o comprovante foi anexado no depósito).
-- 2. bucket PRIVADO `goal-receipts` → o arquivo em si, em
--    "{user_id de quem enviou}/{goal_id}/{uuid}.{ext}". O app abre via signed URL.
--
-- Meta coletiva: todos os participantes ENVIAM e VEEM os comprovantes (é a
-- prova do PIX na conta da meta); só o DONO da meta exclui. Não existe edição.
--
-- Rodar DEPOIS de migration_goals_shared.sql (usa is_goal_member e
-- user_display_name). Idempotente: pode rodar mais de uma vez — inclusive por
-- cima da versão anterior, que era só do dono.
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
-- Quem enviou, como os outros participantes veem na lista.
alter table public.goal_receipts add column if not exists display_name text;
create index if not exists idx_goal_receipts_goal on public.goal_receipts(goal_id);

-- O nome vem do cadastro, gravado pelo banco — o cliente não escolhe.
create or replace function public.goal_receipt_set_name()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.display_name := public.user_display_name(new.user_id);
  return new;
end $$;

drop trigger if exists trg_goal_receipt_set_name on public.goal_receipts;
create trigger trg_goal_receipt_set_name
  before insert on public.goal_receipts
  for each row execute function public.goal_receipt_set_name();

alter table public.goal_receipts enable row level security;

drop policy if exists "goal_receipts_dono" on public.goal_receipts;  -- versão anterior

-- Ler: dono da meta ou participante.
drop policy if exists "goal_receipts_leitura" on public.goal_receipts;
create policy "goal_receipts_leitura" on public.goal_receipts
  for select using (
    public.is_goal_member(goal_id)
    or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );

-- Enviar: em nome próprio, numa meta de que é dono ou participante
-- (a FK sozinha aceitaria o id de uma meta alheia).
drop policy if exists "goal_receipts_envio" on public.goal_receipts;
create policy "goal_receipts_envio" on public.goal_receipts
  for insert with check (
    auth.uid() = user_id
    and (
      public.is_goal_member(goal_id)
      or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
    )
  );

-- Excluir: só o dono da meta. Sem policy de update — comprovante não se edita.
drop policy if exists "goal_receipts_exclusao" on public.goal_receipts;
create policy "goal_receipts_exclusao" on public.goal_receipts
  for delete using (
    exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
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

-- Policies do Storage — seguem a tabela: o arquivo é acessível a quem enxerga
-- a linha em goal_receipts (o RLS da tabela vale dentro da subquery).
drop policy if exists "goal_receipts_select_own" on storage.objects;  -- versão anterior
drop policy if exists "goal_receipts_delete_own" on storage.objects;  -- versão anterior

drop policy if exists "goal_receipts_select" on storage.objects;
create policy "goal_receipts_select" on storage.objects
  for select using (
    bucket_id = 'goal-receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.goal_receipts r where r.file_path = objects.name)
    )
  );

-- Enviar: só na própria pasta (a participação na meta é checada na tabela).
drop policy if exists "goal_receipts_insert_own" on storage.objects;
create policy "goal_receipts_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'goal-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "goal_receipts_delete" on storage.objects;
create policy "goal_receipts_delete" on storage.objects
  for delete using (
    bucket_id = 'goal-receipts'
    and (
      -- dono da meta apaga qualquer comprovante dela
      exists (
        select 1 from public.goal_receipts r
        join public.goals g on g.id = r.goal_id
        where r.file_path = objects.name and g.user_id = auth.uid()
      )
      -- quem enviou só limpa arquivo sem registro (upload que falhou no meio)
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not exists (select 1 from public.goal_receipts r where r.file_path = objects.name)
      )
    )
  );
