import { supabase } from './supabase';
import { currentUserId, categoryService, cardService } from './index';

/**
 * Viagens — centro de custos + lugares marcados no mapa.
 *
 * O gasto da viagem é uma DESPESA normal em `transactions` com `trip_id`:
 * desconta do saldo na hora e aparece em Despesas. `card_label` só anota o
 * cartão usado — não é credit_card_id, não entra em fatura nem limite.
 *
 * Feito pra lugar sem sinal (ilha, barco):
 *  - travelCache: o que foi carregado por último fica no aparelho pra abrir offline.
 *  - travelOutbox: lugar/gasto registrado sem internet entra numa fila e é
 *    enviado quando a rede volta. O id (UUID) nasce aqui e o envio ignora
 *    duplicado — reenviar a mesma linha nunca cria duas.
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

const EXPENSE_COLUMNS = 'id, trip_id, amount, description, date, paid, card_label, category_id, created_at, category:categories(id, name, color)';

export const tripService = {
  /** Viagens com total gasto e nº de lugares (RPC get_trips). */
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

  /** Apaga só a viagem: os lugares ficam no mapa e os gastos em Despesas, sem o vínculo. */
  async remove(id) {
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Tudo que a tela da viagem usa — é também o que fica salvo pra abrir offline.
   * Lugares: TODOS os da pessoa (com o nome da viagem em que foram marcados) —
   * voltando à mesma cidade, os de viagens anteriores aparecem no mapa.
   */
  async details(tripId) {
    const [trip, places, expenses, categories, cards] = await withTimeout(Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).single(),
      supabase.from('trip_places').select('*, trip:trips(name)').order('created_at'),
      supabase
        .from('transactions')
        .select(EXPENSE_COLUMNS)
        .eq('trip_id', tripId)
        .eq('type', 'expense')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      categoryService.list('expense'),
      cardService.listSimple(),
    ]));
    for (const r of [trip, places, expenses]) if (r.error) throw r.error;
    return { trip: trip.data, places: places.data || [], expenses: expenses.data || [], categories, cards };
  },

  // ── Lugares e gastos: salvam ou vão pra fila ───────────────────────────────
  // `row` já vem completa (id, user_id, trip_id) — sem internet não dá pra
  // perguntar ao Supabase quem está logado. O RLS confere o user_id no envio.

  /** @returns {Promise<{ queued: boolean }>} */
  addPlace: (row) => saveOrQueue('trip_places', row),

  async updatePlace(id, patch) {
    const { error } = await supabase.from('trip_places').update(patch).eq('id', id);
    if (error) throw error;
  },

  async removePlace(id) {
    const { error } = await supabase.from('trip_places').delete().eq('id', id);
    if (error) throw error;
  },

  /** @returns {Promise<{ queued: boolean }>} */
  addExpense: (row) => saveOrQueue('transactions', { ...row, type: 'expense' }),

  async updateExpense(id, patch) {
    const { error } = await supabase.from('transactions').update(patch).eq('id', id);
    if (error) throw error;
  },

  async removeExpense(id) {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
  },
};

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
