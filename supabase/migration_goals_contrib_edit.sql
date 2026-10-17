-- ============================================================================
-- Migration: editar / excluir depósito de meta coletiva
-- ============================================================================
-- Rodar DEPOIS de migration_goals_shared.sql.
--
-- Cada participante só altera os depósitos que ELE registrou. A RPC ajusta o
-- goals.current_amount pela diferença (e recalcula completed) na mesma
-- transação — o total da meta nunca fica fora de sincronia com o histórico.
-- Idempotente.
-- ============================================================================

/** Altera o valor de um depósito próprio. */
create or replace function public.goal_contribution_update(p_id uuid, p_amount numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_goal  uuid;
  v_old   numeric;
  v_delta numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Informe um valor válido.';
  end if;

  select goal_id, amount into v_goal, v_old
  from public.goal_contributions
  where id = p_id and user_id = auth.uid()
  for update;
  if v_goal is null then
    raise exception 'Depósito não encontrado (só quem registrou pode alterar).';
  end if;

  v_delta := round(p_amount, 2) - v_old;
  update public.goal_contributions set amount = round(p_amount, 2) where id = p_id;

  update public.goals
  set current_amount = greatest(0, coalesce(current_amount, 0) + v_delta),
      completed = greatest(0, coalesce(current_amount, 0) + v_delta) >= target_amount
  where id = v_goal;
end $$;

/** Exclui um depósito próprio e tira o valor do total da meta. */
create or replace function public.goal_contribution_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_goal uuid;
  v_old  numeric;
begin
  delete from public.goal_contributions
  where id = p_id and user_id = auth.uid()
  returning goal_id, amount into v_goal, v_old;
  if v_goal is null then
    raise exception 'Depósito não encontrado (só quem registrou pode excluir).';
  end if;

  update public.goals
  set current_amount = greatest(0, coalesce(current_amount, 0) - v_old),
      completed = greatest(0, coalesce(current_amount, 0) - v_old) >= target_amount
  where id = v_goal;
end $$;

grant execute on function public.goal_contribution_update(uuid, numeric) to authenticated;
grant execute on function public.goal_contribution_delete(uuid)          to authenticated;
revoke execute on function public.goal_contribution_update(uuid, numeric) from anon;
revoke execute on function public.goal_contribution_delete(uuid)          from anon;
