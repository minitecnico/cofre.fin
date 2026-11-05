import { supabase } from './supabase';
import { currentUserId, cardService } from './index';
import { randomLinkCode } from '../utils/randomCode';
import { PUBLIC_APP_URL } from '../constants';

/**
 * Viagens — caderno de gastos de cada viagem, À PARTE das finanças do mês.
 *
 * Os gastos ficam em `trip_expenses`: não entram em Despesas nem no saldo — o
 * propósito é saber quanto a viagem custou. `card_label` só anota o cartão usado.
 * Viajantes entram pelo @nick (convite + aceite, como nas metas coletivas) e
 * anotam gastos também. O dono pode gerar um link público só de leitura.
 *
 * Feito pra lugar sem sinal (ilha, barco):
 *  - travelCache: o que foi carregado por último fica no aparelho pra abrir offline.
 *  - travelOutbox: gasto anotado sem internet entra numa fila e é enviado
 *    quando a rede volta. O id (UUID) nasce aqui e o envio ignora duplicado —
 *    reenviar a mesma linha nunca cria duas.
 */

// Sinal fraco às vezes não falha: fica pendurado. Passou disso, vai pra fila.
const TIMEOUT_MS = 12000;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ]);
}

/** Falha de rede (sem sinal, sinal fraco, demora) — dá pra tentar de novo depois. */
export function isNetworkError(err) {
  if (!navigator.onLine) return true;
  return /fetch|network|load failed|timeout|timed out|abort/i.test(err?.message || '');
}

/** Mensagem pra mostrar quando uma ação que precisa de internet falha. */
export function travelErrorMessage(err) {
  return isNetworkError(err) ? 'Sem internet — tente de novo quando tiver sinal.' : err.message;
}

export const tripService = {
  /** Viagens próprias e as que a pessoa participa, com total gasto (RPC get_trips). */
  async list() {
    const { data, error } = await withTimeout(supabase.rpc('get_trips'));
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('trips')
      .insert({ user_id: userId, ...payload })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase.from('trips').update(payload).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  },

  /** Apaga a viagem com os gastos e convites dela. */
  async remove(id) {
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (error) throw error;
  },

  /** Tudo que a tela da viagem usa — é também o que fica salvo pra abrir offline. */
  async details(tripId) {
    const [trip, expenses, members, invites, cards] = await withTimeout(Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).single(),
      supabase
        .from('trip_expenses')
        .select('*')
        .eq('trip_id', tripId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('trip_members').select('*').eq('trip_id', tripId).order('joined_at'),
      // RLS: só o dono vê os convites da viagem; pros outros volta vazio.
      supabase.from('trip_invites').select('*').eq('trip_id', tripId).eq('status', 'pending').order('created_at'),
      cardService.listSimple(),
    ]));
    for (const r of [trip, expenses, members, invites]) if (r.error) throw r.error;
    return { trip: trip.data, expenses: expenses.data || [], members: members.data || [], invites: invites.data || [], cards };
  },

  // ── Gastos: salvam ou vão pra fila ─────────────────────────────────────────
  // `row` já vem completa (id, user_id, trip_id) — sem internet não dá pra
  // perguntar ao Supabase quem está logado. O RLS confere no envio.

  /** @returns {Promise<{ queued: boolean }>} */
  addExpense: (row) => saveOrQueue('trip_expenses', row),

  async updateExpense(id, patch) {
    const { error } = await supabase.from('trip_expenses').update(patch).eq('id', id);
    if (error) throw error;
  },

  async removeExpense(id) {
    const { error } = await supabase.from('trip_expenses').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Viajantes ─────────────────────────────────────────────────────────────
  // Convidar e responder passam por RPC, que valida tudo no banco.

  /** Convida pelo @nick (com ou sem @) — o convite aparece em Viagens da pessoa. */
  async invite(tripId, nick) {
    const { error } = await supabase.rpc('invite_to_trip', { p_trip_id: tripId, p_nick: nick });
    if (error) throw error;
  },

  async cancelInvite(inviteId) {
    const { error } = await supabase.from('trip_invites').delete().eq('id', inviteId);
    if (error) throw error;
  },

  /** Convites que outras pessoas mandaram para o usuário logado. */
  async myInvites() {
    const { data, error } = await withTimeout(supabase.rpc('list_my_trip_invites'));
    if (error) throw error;
    return data || [];
  },

  async respondInvite(inviteId, accept) {
    const { error } = await supabase.rpc('respond_trip_invite', { p_invite_id: inviteId, p_accept: accept });
    if (error) throw error;
  },

  /** Dono remove alguém, ou o próprio viajante sai. */
  async removeMember(tripId, userId) {
    const { error } = await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId);
    if (error) throw error;
  },

  // ── Link público (só leitura) ─────────────────────────────────────────────

  /**
   * Gera o link <dominio>/viagem/<code> (o código é a credencial — CSPRNG).
   * Já existindo, reaproveita; `rotate: true` troca o código e o anterior
   * para de funcionar.
   * @returns {Promise<string>} código
   */
  async share(tripId, { rotate = false } = {}) {
    const { data, error } = await supabase.from('trips').select('share_code').eq('id', tripId).single();
    if (error) throw error;
    if (data.share_code && !rotate) return data.share_code;
    const code = randomLinkCode();
    await this.update(tripId, { share_code: code });
    return code;
  },

  async stopSharing(tripId) {
    await this.update(tripId, { share_code: null });
  },

  /** Página pública: gastos da viagem pelo código do link, ou null. */
  async resolveShare(code) {
    const { data, error } = await supabase.rpc('resolve_trip_share', { p_code: code });
    if (error) throw error;
    return data || null;
  },
};

export const tripShareUrl = (code) => `${PUBLIC_APP_URL}/viagem/${code}`;

async function send(table, row) {
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}

async function saveOrQueue(table, row) {
  try {
    await withTimeout(send(table, row));
    return { queued: false };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    writeOutbox([...readOutbox(), { table, row }]);
    return { queued: true };
  }
}

// ── Fila do que foi registrado sem internet ──────────────────────────────────

const OUTBOX_KEY = 'cofre:travel-outbox';

function readOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || [];
  } catch {
    return [];
  }
}

function writeOutbox(items) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

let flushing = null;

export const travelOutbox = {
  /** Itens na fila desta viagem, do usuário logado. */
  forTrip: (userId, tripId) => readOutbox().filter((i) => i.row.user_id === userId && i.row.trip_id === tripId),

  discard(id) {
    writeOutbox(readOutbox().filter((i) => i.row.id !== id));
  },

  /** Corrige um item que ainda não subiu (e tira o erro anotado, pra tentar de novo). */
  update(id, patch) {
    writeOutbox(readOutbox().map((i) => (i.row.id === id ? { table: i.table, row: { ...i.row, ...patch } } : i)));
  },

  /**
   * Envia a fila. Para no primeiro erro de rede (ainda sem sinal). Erro do
   * banco (ex.: viagem apagada noutro aparelho) fica anotado no item — a
   * pessoa vê na lista e descarta.
   */
  flush() {
    flushing ||= (async () => {
      for (const item of readOutbox()) {
        try {
          await withTimeout(send(item.table, item.row));
          writeOutbox(readOutbox().filter((i) => i.row.id !== item.row.id));
        } catch (err) {
          if (isNetworkError(err)) return;
          writeOutbox(readOutbox().map((i) => (i.row.id === item.row.id ? { ...i, error: err.message } : i)));
        }
      }
    })().finally(() => { flushing = null; });
    return flushing;
  },
};

// ── Última versão carregada, pra abrir sem internet ──────────────────────────

const cacheKey = (key) => `cofre:travel:${key}`;

export const travelCache = {
  read(key) {
    try {
      return JSON.parse(localStorage.getItem(cacheKey(key)));
    } catch {
      return null;
    }
  },
  write(key, data) {
    try {
      localStorage.setItem(cacheKey(key), JSON.stringify(data));
    } catch {
      // Sem espaço: só não abre offline.
    }
  },
  remove(key) {
    localStorage.removeItem(cacheKey(key));
  },
};
