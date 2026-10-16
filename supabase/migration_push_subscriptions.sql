-- ============================================================================
-- Migration: Web Push — notificação com o app FECHADO
-- ============================================================================
-- Complementa migration_payment_notices.sql (rode aquela antes).
--
--   push_subscriptions        → cada aparelho/navegador em que o usuário ativou
--                               as notificações (endpoint + chaves do push).
--   payment_notices.pushed_at → quando o push daquele aviso foi enviado. A
--                               função /api/push-notify só envia avisos recentes
--                               e ainda sem pushed_at (e carimba antes de enviar),
--                               então chamar a função de novo não reenvia.
--
-- Quem lê as inscrições pra enviar é a função serverless com a service role
-- (fora do RLS). O app só grava/apaga as próprias.
-- Idempotente.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_dono" on public.push_subscriptions;
create policy "push_subscriptions_dono" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.payment_notices
  add column if not exists pushed_at timestamptz;
