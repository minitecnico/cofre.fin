-- ============================================================================
-- Migration: histórico de depósitos também em metas INDIVIDUAIS
-- ============================================================================
-- Rodar DEPOIS de migration_goals_shared.sql e migration_goals_contrib_edit.sql.
--
-- Antes, "Adicionar valor" numa meta individual só somava no current_amount —
-- sem registro, não dava para corrigir ou apagar um depósito. Agora toda meta
-- grava em goal_contributions (via goal_contribute), e as RPCs de editar/
-- excluir (que já exigem user_id = auth.uid()) passam a valer para as duas.
--
-- Depósitos feitos antes desta migration continuam só no total (sem linha no
-- histórico). Idempotente.
-- ============================================================================

-- Dono de meta individual não está em goal_members: libera dono OU participante.
create or replace function public.goal_contribute(p_goal_id uuid, p_amount numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (
    public.is_goal_member(p_goal_id)
    or exists (select 1 from public.goals where id = p_goal_id and user_id = auth.uid())
  ) then
    raise exception 'Você não participa desta meta.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Informe um valor válido.';
  end if;

  insert into public.goal_contributions (goal_id, user_id, display_name, amount)
  values (p_goal_id, auth.uid(), public.user_display_name(auth.uid()), round(p_amount, 2));

  update public.goals
  set current_amount = coalesce(current_amount, 0) + round(p_amount, 2),
      completed = coalesce(current_amount, 0) + round(p_amount, 2) >= target_amount
  where id = p_goal_id;
end $$;

drop policy if exists "goal_contrib_leitura" on public.goal_contributions;
create policy "goal_contrib_leitura" on public.goal_contributions
  for select using (
    public.is_goal_member(goal_id)
    or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );
