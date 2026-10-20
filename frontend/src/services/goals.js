import { supabase } from './supabase';
import { RECEIPT_EXT, RECEIPT_MAX_BYTES } from '../constants';

/**
 * Service unificado para a página Objetivos:
 *   - Metas / Goals (goalService)
 *   - Comprovantes de PIX das metas (goalReceiptService)
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
        is_shared: payload.is_shared || false,
        pix_key: payload.pix_key || null,
        pix_key_type: payload.pix_key_type || null,
        pix_name: payload.pix_name || null,
        pix_city: payload.pix_city || null,
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
    // O cascade do banco apaga as linhas de goal_receipts, mas não os arquivos
    // no Storage — remove eles antes. Se falhar, a meta fica: apagá-la perderia
    // o único registro de onde estão os arquivos, que ocupariam espaço pra sempre.
    const { data: receipts } = await supabase
      .from('goal_receipts')
      .select('file_path')
      .eq('goal_id', id);
    if (receipts?.length) {
      const { error: rmErr } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .remove(receipts.map((r) => r.file_path));
      if (rmErr) throw rmErr;
    }

    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Metas coletivas ───────────────────────────────────────────────────────
  // Leitura de membros/depósitos é filtrada pelo RLS (só participantes);
  // convidar, responder e depositar passam por RPC, que valida tudo no banco.

  /** Participantes, convites pendentes e depósitos de uma meta coletiva. */
  async sharedDetails(goalId) {
    const [members, invites, contributions] = await Promise.all([
      supabase.from('goal_members').select('*').eq('goal_id', goalId).order('joined_at'),
      supabase.from('goal_invites').select('*').eq('goal_id', goalId).eq('status', 'pending').order('created_at'),
      supabase.from('goal_contributions').select('*').eq('goal_id', goalId).order('created_at', { ascending: false }),
    ]);
    for (const r of [members, invites, contributions]) if (r.error) throw r.error;
    return { members: members.data || [], invites: invites.data || [], contributions: contributions.data || [] };
  },

  /** Convida pelo @nick (com ou sem @) — o convite aparece dentro do app. */
  async invite(goalId, nick) {
    const { error } = await supabase.rpc('invite_to_goal', { p_goal_id: goalId, p_nick: nick });
    if (error) throw error;
  },

  async cancelInvite(inviteId) {
    const { error } = await supabase.from('goal_invites').delete().eq('id', inviteId);
    if (error) throw error;
  },

  /** Convites que outras pessoas mandaram para o usuário logado. */
  async myInvites() {
    const { data, error } = await supabase.rpc('list_my_goal_invites');
    if (error) throw error;
    return data || [];
  },

  async respondInvite(inviteId, accept) {
    const { error } = await supabase.rpc('respond_goal_invite', { p_invite_id: inviteId, p_accept: accept });
    if (error) throw error;
  },

  /** Depósitos de uma meta (individual ou coletiva), mais recentes primeiro. */
  async listContributions(goalId) {
    const { data, error } = await supabase
      .from('goal_contributions')
      .select('*')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /**
   * Registra um depósito (meta individual ou coletiva): grava no histórico e
   * soma no total; se atingir o alvo, a meta fica completed.
   */
  async contribute(goalId, amount) {
    const { error } = await supabase.rpc('goal_contribute', { p_goal_id: goalId, p_amount: amount });
    if (error) throw error;
  },

  /** Corrige o valor de um depósito próprio (o total da meta acompanha). */
  async updateContribution(id, amount) {
    const { error } = await supabase.rpc('goal_contribution_update', { p_id: id, p_amount: amount });
    if (error) throw error;
  },

  /** Exclui um depósito próprio e tira o valor do total da meta. */
  async removeContribution(id) {
    const { error } = await supabase.rpc('goal_contribution_delete', { p_id: id });
    if (error) throw error;
  },

  /** Sair da meta (membro) ou remover um participante (dono). */
  async removeMember(goalId, userId) {
    const { error } = await supabase.from('goal_members').delete().eq('goal_id', goalId).eq('user_id', userId);
    if (error) throw error;
  },

  /**
   * Escuta mudanças em metas, participantes, convites e depósitos (o RLS do
   * Realtime entrega só o que o usuário pode ver). Retorna o cancelamento.
   */
  subscribe(onChange) {
    const channel = supabase.channel('goals_live');
    for (const table of ['goals', 'goal_members', 'goal_invites', 'goal_contributions']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};

// ═════════════════════════════════════════════════════════════════════════
// PERFIL / @NICK (identifica o usuário nos convites de metas coletivas)
// ═════════════════════════════════════════════════════════════════════════

export const profileService = {
  /** Nick do usuário logado, ou null se ainda não criou. */
  async getMyNick() {
    const { data, error } = await supabase.from('profiles').select('nick').maybeSingle();
    if (error) throw error;
    return data?.nick || null;
  },

  async setNick(nick) {
    const userId = await currentUserId();
    const clean = nick.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(clean)) {
      throw new Error('Use de 3 a 20 caracteres: letras, números, _ ou .');
    }
    const { error } = await supabase.from('profiles').upsert({ user_id: userId, nick: clean });
    if (error) {
      if (error.code === '23505') throw new Error(`O nick @${clean} já está em uso.`);
      throw error;
    }
    return clean;
  },
};

// ═════════════════════════════════════════════════════════════════════════
// COMPROVANTES DE PIX DAS METAS
// ═════════════════════════════════════════════════════════════════════════

const RECEIPTS_BUCKET = 'goal-receipts';

/**
 * Arquivos ficam no bucket privado 'goal-receipts' (migration_goal_receipts.sql)
 * e a tabela goal_receipts guarda o path + valor do PIX, quando informado.
 * Em meta coletiva todos os participantes enviam e veem; só o dono exclui.
 */
export const goalReceiptService = {
  /** Comprovantes da meta (mais recentes primeiro), cada um com `url` assinada válida por 1h. */
  async list(goalId) {
    const { data, error } = await supabase
      .from('goal_receipts')
      .select('*')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data.length) return [];

    const { data: signed, error: signErr } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrls(data.map((r) => r.file_path), 60 * 60);
    if (signErr) throw signErr;
    const urlByPath = Object.fromEntries(signed.map((s) => [s.path, s.signedUrl]));
    return data.map((r) => ({ ...r, url: urlByPath[r.file_path] || null }));
  },

  /**
   * Sobe o arquivo e registra. A 1ª pasta do path é o user_id — é o que a
   * policy do Storage confere.
   */
  async upload(goalId, file, amount = null) {
    const ext = RECEIPT_EXT[file.type];
    if (!ext) throw new Error('Envie uma imagem (JPG, PNG ou WEBP) ou um PDF.');
    if (file.size > RECEIPT_MAX_BYTES) throw new Error('Arquivo muito grande — o limite é 5 MB.');

    const userId = await currentUserId();
    const path = `${userId}/${goalId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (upErr) throw upErr;

    const { data, error } = await supabase
      .from('goal_receipts')
      .insert({
        user_id: userId,
        goal_id: goalId,
        amount,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
      })
      .select('*')
      .single();
    if (error) {
      // Sem a linha o arquivo fica inalcançável pelo app — não deixa lixo no bucket.
      await supabase.storage.from(RECEIPTS_BUCKET).remove([path]);
      throw error;
    }
    return data;
  },

  /**
   * Só o dono da meta consegue (RLS). Arquivo antes da linha: a policy do
   * Storage libera o dono justamente pela linha em goal_receipts.
   */
  async remove(receipt) {
    const { error: rmErr } = await supabase.storage.from(RECEIPTS_BUCKET).remove([receipt.file_path]);
    if (rmErr) throw rmErr;
    const { error } = await supabase.from('goal_receipts').delete().eq('id', receipt.id);
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
