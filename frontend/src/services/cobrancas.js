import { supabase } from './supabase';
import { currentUserId } from './index';
import { splitInstallmentAmount, generateInstallmentDates } from '../utils/format';
import { buildPixPayload, pixQrCodeDataUrl } from './pix';
import { randomLinkCode } from '../utils/randomCode';
import { PUBLIC_APP_URL, SHARE_LINK_DAYS, DAY_MS } from '../constants';

/**
 * Extrato público de um devedor (rota /extrato/:code, sem login).
 * RPC SECURITY DEFINER: devolve só o extrato daquele código exato.
 */
export async function resolveDebtorStatement(code) {
  const { data, error } = await supabase.rpc('resolve_debtor_statement', { p_code: code });
  if (error) throw error;
  return data || null;
}

/**
 * Devedor avisa (pelo extrato público) que gerou o PIX destas parcelas.
 * RPC anon: valida as parcelas e recalcula o valor no servidor.
 * @returns {Promise<boolean>} true = credor avisado
 */
export async function notifyPayment(code, chargeIds) {
  const { data, error } = await supabase.rpc('notify_payment', { p_code: code, p_charge_ids: chargeIds });
  if (error) throw error;
  return !!data;
}

/**
 * Services de Cobranças.
 *
 * Domínio: o usuário empresta cartão/dinheiro pra terceiros e precisa controlar
 * quem deve, quanto, e quando vence.
 *
 *   debtorService   → pessoas que devem (CRUD)
 *   chargeService   → cada dívida individual (CRUD + marcar pago)
 *
 * Convenção do projeto: services lançam exceção (throw), não retornam {error}.
 * RLS filtra por user_id; nos inserts é obrigatório passar user_id.
 */

// ─────────────────────────────────────────────────────────────────────────
// Devedores
// ─────────────────────────────────────────────────────────────────────────

export const debtorService = {
  /** Lista devedores (ordem alfabética). */
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

  /**
   * Link público do extrato do devedor (<dominio>/extrato/<code>), ao vivo.
   * Vale SHARE_LINK_DAYS dias. Enquanto válido, reaproveita o mesmo (o link já
   * enviado continua funcionando); vencido, gera outro sozinho. `rotate: true`
   * troca o código na hora e invalida o anterior.
   * @returns {Promise<{ url: string, expiresAt: string }>}
   */
  async shareLink(id, { rotate = false } = {}) {
    const { data, error } = await supabase
      .from('debtors')
      .select('share_code, share_expires_at')
      .eq('id', id)
      .single();
    if (error) throw error;

    let code = data.share_code;
    let expiresAt = data.share_expires_at;
    const expired = !expiresAt || new Date(expiresAt).getTime() <= Date.now();
    if (rotate || !code || expired) {
      code = randomLinkCode();
      expiresAt = new Date(Date.now() + SHARE_LINK_DAYS * DAY_MS).toISOString();
      await this.update(id, { share_code: code, share_expires_at: expiresAt });
    }
    return { url: `${PUBLIC_APP_URL}/extrato/${code}`, expiresAt };
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
      code: d.code ?? null,            // nº sequencial humano (#001) — migration_debtors_code
      name: d.name,
      phone: d.phone,
      openAmount: Number(d.open_amount) || 0,
      paidAmount: Number(d.paid_amount) || 0,
      openCount: Number(d.open_count) || 0,
      overdueCount: Number(d.overdue_count) || 0,
      overdueAmount: Number(d.overdue_amount) || 0,
      nextDue: d.next_due,
      lastChargedAt: d.last_charged_at || null, // último lembrete enviado (dívidas em aberto)
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
      .select('*, debtor:debtors ( id, name, phone ), credit_card:credit_cards ( id, name, color )')
      .order('paid', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false });
    if (debtorId) query = query.eq('debtor_id', debtorId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async create({ debtorId, description, amount, dueDate, cardId }) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('charges')
      .insert({
        user_id: userId,
        debtor_id: debtorId,
        description,
        amount,
        due_date: dueDate || null,
        credit_card_id: cardId || null,
      })
      .select('*, debtor:debtors ( id, name, phone ), credit_card:credit_cards ( id, name, color )')
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Cria uma cobrança PARCELADA: N parcelas independentes compartilhando um
   * installment_group_id. Mesma lógica das despesas no cartão — cada parcela
   * tem vencimento no mês correto e a 1ª pega o centavo sobressalente.
   *
   * @param {Object} args
   * @param {string} args.debtorId
   * @param {string} args.description  base (vira "Desc (1/6)", "Desc (2/6)"…)
   * @param {number} args.totalAmount  valor total a parcelar
   * @param {number} args.count        nº de parcelas
   * @param {string} args.firstDueDate vencimento da 1ª parcela 'YYYY-MM-DD'
   */
  async createInstallments({ debtorId, description, totalAmount, count, firstDueDate, cardId }) {
    const userId = await currentUserId();
    const groupId = (crypto?.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.round(totalAmount * 100)}`;
    const amounts = splitInstallmentAmount(totalAmount, count);
    const dates = firstDueDate ? generateInstallmentDates(firstDueDate, count) : Array(count).fill(null);

    const rows = amounts.map((amt, i) => ({
      user_id: userId,
      debtor_id: debtorId,
      description: `${description} (${i + 1}/${count})`,
      amount: amt,
      due_date: dates[i],
      credit_card_id: cardId || null,
      installment_total: count,
      installment_number: i + 1,
      installment_group_id: groupId,
    }));

    const { data, error } = await supabase
      .from('charges')
      .insert(rows)
      .select('*, debtor:debtors ( id, name, phone ), credit_card:credit_cards ( id, name, color )');
    if (error) throw error;
    return data;
  },

  async update(id, patch) {
    const { data, error } = await supabase
      .from('charges')
      .update(patch)
      .eq('id', id)
      .select('*, debtor:debtors ( id, name, phone ), credit_card:credit_cards ( id, name, color )')
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Edita um parcelamento inteiro de uma vez.
   *   description   → novo nome base; cada parcela vira "Nome (i/N)"
   *   cardId        → cartão de todas as parcelas ('' / null = nenhum)
   *   pendingAmount → novo valor de cada parcela AINDA NÃO PAGA (pagas ficam
   *                   travadas — o que já foi recebido não muda)
   */
  async updateGroup(groupId, items, { description, cardId, pendingAmount }) {
    const { error } = await supabase
      .from('charges')
      .update({ credit_card_id: cardId || null })
      .eq('installment_group_id', groupId);
    if (error) throw error;

    if (pendingAmount > 0) {
      const { error: amtErr } = await supabase
        .from('charges')
        .update({ amount: pendingAmount })
        .eq('installment_group_id', groupId)
        .eq('paid', false);
      if (amtErr) throw amtErr;
    }

    // A descrição embute "(i/N)" e difere por parcela → uma atualização por linha.
    const results = await Promise.all(items.map((c) => supabase
      .from('charges')
      .update({ description: `${description} (${c.installment_number}/${c.installment_total})` })
      .eq('id', c.id)));
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  },

  /** Marca como paga/pendente, gravando o momento do pagamento. */
  async setPaid(id, paid) {
    return this.update(id, { paid, paid_at: paid ? new Date().toISOString() : null });
  },

  async remove(id) {
    const { error } = await supabase.from('charges').delete().eq('id', id);
    if (error) throw error;
  },

  /** Exclui várias cobranças de uma vez. */
  async removeMany(ids) {
    if (!ids || ids.length === 0) return;
    const { error } = await supabase.from('charges').delete().in('id', ids);
    if (error) throw error;
  },

  /**
   * Marca cobranças como ENVIADAS (lembrete cobrado). Incrementa o contador e
   * carimba o momento, pra UI sinalizar "cobrado há Xd" e evitar cobrar a mesma
   * pessoa várias vezes. Só afeta as não pagas. Retorna quantas foram marcadas.
   */
  async markCharged(ids) {
    if (!ids || ids.length === 0) return 0;
    const { data, error } = await supabase.rpc('mark_charges_sent', { p_ids: ids });
    if (error) throw error;
    return data || 0;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Chaves PIX (múltiplas)
// ─────────────────────────────────────────────────────────────────────────

export const pixKeyService = {
  /** Lista as chaves do usuário (a padrão primeiro). */
  async list() {
    const { data, error } = await supabase
      .from('pix_keys')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async create({ label, key, keyType, name, city, isDefault }) {
    const userId = await currentUserId();
    // Se marcou como padrão (ou é a 1ª), desmarca as outras
    const existing = await this.list();
    const makeDefault = isDefault || existing.length === 0;
    if (makeDefault && existing.length) await this._clearDefault(userId);

    const { data, error } = await supabase
      .from('pix_keys')
      .insert({
        user_id: userId,
        label: label || null,
        key,
        key_type: keyType || null,
        name,
        city,
        is_default: makeDefault,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from('pix_keys').delete().eq('id', id);
    if (error) throw error;
  },

  /** Marca uma chave como padrão (desmarca as demais). */
  async setDefault(id) {
    const userId = await currentUserId();
    await this._clearDefault(userId);
    const { error } = await supabase.from('pix_keys').update({ is_default: true }).eq('id', id);
    if (error) throw error;
  },

  async _clearDefault(userId) {
    await supabase.from('pix_keys').update({ is_default: false }).eq('user_id', userId);
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Links de pagamento PIX (QR imagem no Storage + link curto público)
// ─────────────────────────────────────────────────────────────────────────

export const pixLinkService = {
  /**
   * Cria um link de pagamento PIX:
   *   1. monta o copia-e-cola (payload EMV) com a chave escolhida
   *   2. gera o QR como imagem PNG e sobe pro bucket público `pix-qr`
   *   3. grava em `pix_links` com um código curto
   *   4. devolve a URL curta (<dominio>/pix/<code>) pra compartilhar
   *
   * @param {Object} args
   * @param {Object} args.pixKey  linha de pix_keys ({ key, key_type, name, city })
   * @param {number} [args.amount]
   * @param {string} [args.recipientName] nome exibido na página (padrão: name da chave)
   * @returns {Promise<{ shortUrl, payload, qrUrl, code }>}
   */
  async createPaymentLink({ pixKey, amount, recipientName }) {
    const userId = await currentUserId();
    if (!pixKey?.key) throw new Error('Selecione uma chave PIX.');

    const payload = buildPixPayload({
      key: pixKey.key,
      keyType: pixKey.key_type,
      name: pixKey.name,
      city: pixKey.city,
      amount,
    });

    // QR → imagem PNG → blob
    const dataUrl = await pixQrCodeDataUrl(payload);
    const blob = await (await fetch(dataUrl)).blob();

    // O código é a credencial do link público (resolve_pix_link é liberada pro
    // `anon` e devolve o payload EMV, que contém a chave PIX). Precisa ser
    // imprevisível — `Math.random()` não serve.
    const code = randomLinkCode();
    const path = `${userId}/${code}.png`;

    const { error: upErr } = await supabase.storage
      .from('pix-qr')
      .upload(path, blob, { contentType: 'image/png', upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('pix-qr').getPublicUrl(path);
    const qrUrl = pub?.publicUrl || null;

    const { error: insErr } = await supabase.from('pix_links').insert({
      code,
      user_id: userId,
      payload,
      amount: amount ?? null,
      recipient_name: recipientName || pixKey.name,
      qr_url: qrUrl,
    });
    if (insErr) throw insErr;

    return {
      shortUrl: `${PUBLIC_APP_URL}/pix/${code}`,
      payload,
      qrUrl,
      code,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Avisos de pagamento (devedor gerou o PIX no extrato → credor é notificado)
// ─────────────────────────────────────────────────────────────────────────

export const paymentNoticeService = {
  /** Avisos ainda não resolvidos, mais recentes primeiro. */
  async listPending() {
    const { data, error } = await supabase
      .from('payment_notices')
      .select('*, debtor:debtors ( id, name, code )')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /** "Ok, visto": tira o aviso da lista. Não mexe em nenhuma parcela. */
  async dismiss(id) {
    const { error } = await supabase.from('payment_notices').update({ status: 'dismissed' }).eq('id', id);
    if (error) throw error;
  },

  /** Busca 1 aviso com o devedor embutido (o evento do Realtime traz só a linha crua). */
  async get(id) {
    const { data, error } = await supabase
      .from('payment_notices')
      .select('*, debtor:debtors ( id, name, code )')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /**
   * Escuta novos avisos em tempo real (o RLS do Realtime entrega só os do
   * usuário logado). Retorna a função que cancela a inscrição.
   */
  subscribe(onInsert) {
    const channel = supabase
      .channel('payment_notices_inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payment_notices' }, (payload) => onInsert(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
