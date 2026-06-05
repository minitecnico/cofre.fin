import { supabase } from './supabase';
import { currentUserId } from './index';

/**
 * Services de Cobranças.
 *
 * Domínio: o usuário empresta cartão/dinheiro pra terceiros e precisa controlar
 * quem deve, quanto, e quando vence.
 *
 *   debtorService   → pessoas que devem (CRUD)
 *   chargeService   → cada dívida individual (CRUD + marcar pago)
 *   settingsService → config do usuário (chave PIX p/ receber)
 *
 * Convenção do projeto: services lançam exceção (throw), não retornam {error}.
 * RLS filtra por user_id; nos inserts é obrigatório passar user_id.
 */

// ─────────────────────────────────────────────────────────────────────────
// Devedores
// ─────────────────────────────────────────────────────────────────────────

export const debtorService = {
  /** Lista devedores (mais recentes primeiro). */
  async list() {
    const { data, error } = await supabase
      .from('debtors')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async create({ name, phone, note }) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('debtors')
      .insert({ user_id: userId, name, phone: phone || null, note: note || null })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, patch) {
    const { data, error } = await supabase
      .from('debtors')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  /** Remove o devedor (cascade apaga as cobranças dele). */
  async remove(id) {
    const { error } = await supabase.from('debtors').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Resumo por devedor (total devido/pago, pendentes, vencidas) via RPC.
   */
  async summary() {
    const { data, error } = await supabase.rpc('get_debtors_summary');
    if (error) throw error;
    return (data || []).map((d) => ({
      debtorId: d.debtor_id,
      name: d.name,
      phone: d.phone,
      openAmount: Number(d.open_amount) || 0,
      paidAmount: Number(d.paid_amount) || 0,
      openCount: Number(d.open_count) || 0,
      overdueCount: Number(d.overdue_count) || 0,
      overdueAmount: Number(d.overdue_amount) || 0,
      nextDue: d.next_due,
    }));
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Cobranças (dívidas individuais)
// ─────────────────────────────────────────────────────────────────────────

export const chargeService = {
  /** Lista cobranças (opcionalmente de um devedor), com o devedor embutido. */
  async list({ debtorId } = {}) {
    let query = supabase
      .from('charges')
      .select('*, debtor:debtors ( id, name, phone )')
      .order('paid', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false });
    if (debtorId) query = query.eq('debtor_id', debtorId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async create({ debtorId, description, amount, dueDate }) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('charges')
      .insert({
        user_id: userId,
        debtor_id: debtorId,
        description,
        amount,
        due_date: dueDate || null,
      })
      .select('*, debtor:debtors ( id, name, phone )')
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, patch) {
    const { data, error } = await supabase
      .from('charges')
      .update(patch)
      .eq('id', id)
      .select('*, debtor:debtors ( id, name, phone )')
      .single();
    if (error) throw error;
    return data;
  },

  /** Marca como paga/pendente, gravando o momento do pagamento. */
  async setPaid(id, paid) {
    return this.update(id, { paid, paid_at: paid ? new Date().toISOString() : null });
  },

  async remove(id) {
    const { error } = await supabase.from('charges').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Configurações do usuário (chave PIX)
// ─────────────────────────────────────────────────────────────────────────

export const settingsService = {
  /** Retorna a config do usuário ou null se ainda não cadastrou. */
  async get() {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      pixKey: data.pix_key || '',
      pixKeyType: data.pix_key_type || '',
      pixName: data.pix_name || '',
      pixCity: data.pix_city || '',
    };
  },

  /** Cria/atualiza (upsert) a config PIX do usuário. */
  async savePix({ pixKey, pixKeyType, pixName, pixCity }) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        pix_key: pixKey || null,
        pix_key_type: pixKeyType || null,
        pix_name: pixName || null,
        pix_city: pixCity || null,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },
};
