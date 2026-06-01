import { supabase } from './supabase';

/**
 * Service unificado para a página Objetivos:
 *   - Metas / Goals (goalService)
 *   - Notas / Notes (noteService)
 *
 * Cada um é independente — não compartilham lógica nem afetam outros services.
 */

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Não autenticado');
  return data.user.id;
}

// ═════════════════════════════════════════════════════════════════════════
// METAS / GOALS
// ═════════════════════════════════════════════════════════════════════════

export const goalService = {
  /** Lista todas as metas (não completadas primeiro, depois completadas). */
  async list() {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('completed', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        title: payload.title,
        description: payload.description || null,
        target_amount: payload.target_amount,
        current_amount: payload.current_amount || 0,
        deadline: payload.deadline || null,
        color: payload.color || '#b8e94e',
        icon: payload.icon || 'target',
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from('goals')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Adiciona um depósito à meta. Se o total atingir/passar o alvo,
   * marca como completed automaticamente.
   */
  async deposit(id, amount) {
    const { data: goal, error: fetchErr } = await supabase
      .from('goals')
      .select('current_amount, target_amount')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const newAmount = Number(goal.current_amount || 0) + Number(amount);
    const completed = newAmount >= Number(goal.target_amount);

    const { data, error } = await supabase
      .from('goals')
      .update({ current_amount: newAmount, completed })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  /** Retira valor da meta (caso o usuário desistir, etc). */
  async withdraw(id, amount) {
    const { data: goal, error: fetchErr } = await supabase
      .from('goals')
      .select('current_amount')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const newAmount = Math.max(0, Number(goal.current_amount || 0) - Number(amount));
    const { data, error } = await supabase
      .from('goals')
      .update({ current_amount: newAmount, completed: false })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) throw error;
  },
};

// ═════════════════════════════════════════════════════════════════════════
// NOTAS / NOTES
// ═════════════════════════════════════════════════════════════════════════

export const noteService = {
  /** Lista todas as notas (pinned no topo, depois mais recentes primeiro). */
  async list() {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        title: payload.title || null,
        content: payload.content || '',
        pinned: payload.pinned || false,
        color: payload.color || '#fef3c7',
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  /** Atualiza apenas o conteúdo. Usado pelo auto-save. */
  async updateContent(id, content) {
    const { data, error } = await supabase
      .from('notes')
      .update({ content })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from('notes')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async togglePin(id, pinned) {
    const { error } = await supabase
      .from('notes')
      .update({ pinned })
      .eq('id', id);
    if (error) throw error;
  },

  async remove(id) {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) throw error;
  },
};
