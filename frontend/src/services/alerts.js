import { supabase } from './supabase';
import { cardService, dashboardService, transactionService } from './index';

/**
 * Service de Alertas — detecta situações que merecem atenção do usuário.
 *
 * É um service PURO: não modifica dados, não dispara notificações, não toca em UI.
 * Só RETORNA uma lista de alertas baseado no estado atual.
 *
 * O hook useAlerts e o componente AlertCenter consomem esse retorno.
 *
 * SEVERIDADES:
 *   - 'critical' (vermelho)  → vencida, cartão >= 95%, saldo negativo
 *   - 'warning'  (laranja)   → vence hoje, cartão >= 80%, despesas > receitas
 *   - 'info'     (azul/cinza) → vence em 3 dias, fatura fechando em 2 dias
 *
 * IDs estáveis: cada alerta tem um ID determinístico (ex: 'tx-overdue-{uuid}')
 *   pra que possamos saber se "já avisamos esse" e não notificar 2x.
 */

/** Hoje sem hora (timezone-safe) */
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parseia 'YYYY-MM-DD' como data local. */
function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Diferença em DIAS entre 2 datas (b - a). Negativo = b é anterior. */
function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

/** Formata moeda BR */
function fmtMoney(n) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n || 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Detectores individuais
// ─────────────────────────────────────────────────────────────────────────

/**
 * Despesas vencidas, vencendo hoje, ou em até 3 dias.
 * Aceita uma lista de transações já filtradas pelo mês relevante.
 */
function detectDueDateAlerts(transactions, t0) {
  const alerts = [];
  for (const tx of transactions || []) {
    if (tx.type !== 'expense' || tx.paid) continue;
    const d = parseLocalDate(tx.date);
    if (!d) continue;
    const diff = daysBetween(t0, d);

    if (diff < 0) {
      alerts.push({
        id: `tx-overdue-${tx.id}`,
        severity: 'critical',
        kind: 'overdue',
        title: 'Despesa vencida',
        message: `${tx.description} venceu há ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'dia' : 'dias'}.`,
        amount: Number(tx.amount),
        date: tx.date,
        link: '/expenses',
        meta: { txId: tx.id },
      });
    } else if (diff === 0) {
      alerts.push({
        id: `tx-today-${tx.id}`,
        severity: 'warning',
        kind: 'due_today',
        title: 'Vence hoje',
        message: `${tx.description} vence hoje.`,
        amount: Number(tx.amount),
        date: tx.date,
        link: '/expenses',
        meta: { txId: tx.id },
      });
    } else if (diff <= 3) {
      alerts.push({
        id: `tx-soon-${tx.id}`,
        severity: 'info',
        kind: 'due_soon',
        title: `Vence em ${diff} ${diff === 1 ? 'dia' : 'dias'}`,
        message: `${tx.description}.`,
        amount: Number(tx.amount),
        date: tx.date,
        link: '/expenses',
        meta: { txId: tx.id, daysUntil: diff },
      });
    }
  }
  return alerts;
}

/**
 * Cartões com utilização alta + cartão fechando em poucos dias.
 */
function detectCardAlerts(cards, t0) {
  const alerts = [];
  for (const summary of cards || []) {
    const { card, utilizationPercent, openBill, cycleEnd } = summary;
    const usage = Number(utilizationPercent) || 0;

    if (usage >= 95) {
      alerts.push({
        id: `card-critical-${card.id}`,
        severity: 'critical',
        kind: 'card_high_usage',
        title: 'Cartão quase no limite',
        message: `${card.name} usou ${usage.toFixed(0)}% do limite. Fatura: ${fmtMoney(openBill)}.`,
        link: '/cards',
        meta: { cardId: card.id, percent: usage },
      });
    } else if (usage >= 80) {
      alerts.push({
        id: `card-warning-${card.id}`,
        severity: 'warning',
        kind: 'card_high_usage',
        title: 'Uso elevado de cartão',
        message: `${card.name} usou ${usage.toFixed(0)}% do limite.`,
        link: '/cards',
        meta: { cardId: card.id, percent: usage },
      });
    }

    // Fatura fechando em até 2 dias
    if (cycleEnd) {
      const closeDate = parseLocalDate(cycleEnd);
      if (closeDate) {
        const daysToClose = daysBetween(t0, closeDate);
        if (daysToClose >= 0 && daysToClose <= 2 && openBill > 0) {
          alerts.push({
            id: `card-closing-${card.id}`,
            severity: 'info',
            kind: 'card_closing',
            title: daysToClose === 0
              ? `Fatura do ${card.name} fecha hoje`
              : `Fatura fecha em ${daysToClose} ${daysToClose === 1 ? 'dia' : 'dias'}`,
            message: `${card.name} — ${fmtMoney(openBill)} em aberto.`,
            link: '/cards',
            meta: { cardId: card.id, daysToClose },
          });
        }
      }
    }
  }
  return alerts;
}

/**
 * Saúde financeira do mês: despesas > receitas e saldo negativo.
 */
function detectBudgetAlerts(dashboardData) {
  const alerts = [];
  if (!dashboardData) return alerts;

  const income = Number(dashboardData.periodSummary?.income) || 0;
  const expense = Number(dashboardData.periodSummary?.expense) || 0;
  const balance = Number(dashboardData.balance?.balance) || 0;

  // Despesas excedem receitas (mas só alerta se já há receita registrada)
  if (income > 0 && expense > income) {
    const pct = ((expense / income) * 100).toFixed(0);
    alerts.push({
      id: 'budget-over',
      severity: 'warning',
      kind: 'over_budget',
      title: 'Despesas acima das receitas',
      message: `Você gastou ${pct}% do que recebeu este mês.`,
      link: '/',
      meta: { ratio: expense / income },
    });
  }

  // Saldo negativo
  if (balance < 0) {
    alerts.push({
      id: 'budget-negative',
      severity: 'critical',
      kind: 'negative_balance',
      title: 'Saldo negativo',
      message: `Saldo atual: ${fmtMoney(balance)}.`,
      link: '/',
      meta: { balance },
    });
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────
// Função principal: agrupa tudo
// ─────────────────────────────────────────────────────────────────────────

/**
 * Calcula todos os alertas. Recebe contexto opcional pra evitar
 * fetches duplicados (ex: dashboard já carregou os dados).
 *
 * @param {Object} options
 * @param {string} options.month - 'YYYY-MM' (padrão: mês atual)
 * @returns {Promise<Array>} lista de alertas ordenados por severidade
 */
export async function detectAllAlerts({ month } = {}) {
  const t0 = today();

  // Determina o mês: padrão = atual
  const ref = month || (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const [year, mo] = ref.split('-').map(Number);
  const startDate = `${ref}-01`;
  const lastDay = new Date(year, mo, 0).getDate();
  const endDate = `${ref}-${String(lastDay).padStart(2, '0')}`;

  // Busca em paralelo o que precisamos
  const [txRes, cardsRes, dashData] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, type, amount, description, date, paid, credit_card_id')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('type', 'expense')
      .eq('paid', false)
      .limit(500),
    cardService.list().catch(() => []),
    dashboardService.summary('month', ref).catch(() => null),
  ]);

  const transactions = txRes.data || [];

  // Detecta cada categoria
  const dueAlerts = detectDueDateAlerts(transactions, t0);
  const cardAlerts = detectCardAlerts(cardsRes, t0);
  const budgetAlerts = detectBudgetAlerts(dashData);

  // Junta tudo e ordena por severidade (critical primeiro)
  const all = [...dueAlerts, ...cardAlerts, ...budgetAlerts];
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  all.sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    // Mesma severidade: mais antigo primeiro (pra vencidas, dia mais antigo no topo)
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return 0;
  });

  return all;
}

// ─────────────────────────────────────────────────────────────────────────
// Persistência local: alertas dispensados (não notificar 2x)
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cofre:dismissed-alerts';
const NOTIFIED_KEY = 'cofre:notified-alerts';

export function getDismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function dismissAlert(alertId) {
  const set = getDismissed();
  set.add(alertId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* storage indisponível */ }
}

export function clearDismissed() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignora */ }
}

export function getNotified() {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function markNotified(alertId) {
  const set = getNotified();
  set.add(alertId);
  // Limita a 200 entries pra não inflar localStorage
  const arr = [...set];
  if (arr.length > 200) arr.splice(0, arr.length - 200);
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr));
  } catch { /* ignora */ }
}

// ─────────────────────────────────────────────────────────────────────────
// Snooze: adiar um alerta por N dias (persiste timestamp de re-exibição)
// ─────────────────────────────────────────────────────────────────────────

const SNOOZE_KEY = 'cofre:snoozed-alerts';

/** Retorna { [alertId]: epochMsParaReexibir }. Limpa entradas já expiradas. */
export function getSnoozed() {
  try {
    const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}');
    const now = Date.now();
    const valid = {};
    for (const [id, until] of Object.entries(raw)) {
      if (Number(until) > now) valid[id] = until;
    }
    return valid;
  } catch {
    return {};
  }
}

/** Adia um alerta por `days` dias. */
export function snoozeAlert(alertId, days = 3) {
  const map = getSnoozed();
  map[alertId] = Date.now() + days * 24 * 60 * 60 * 1000;
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
  } catch { /* storage indisponível */ }
}

// ─────────────────────────────────────────────────────────────────────────
// Ações diretas a partir de um alerta (marcar pago)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Marca a despesa associada a um alerta como paga.
 * Reaproveita o transactionService — não toca em supabase direto além do detector.
 */
export async function payAlertExpense(txId) {
  return transactionService.togglePaid(txId, true);
}

// ─────────────────────────────────────────────────────────────────────────
// Notificações nativas do navegador
// ─────────────────────────────────────────────────────────────────────────

const NOTIF_PREF_KEY = 'cofre:notifications-enabled';

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export function getNotificationsEnabled() {
  if (getNotificationPermission() !== 'granted') return false;
  return localStorage.getItem(NOTIF_PREF_KEY) === '1';
}

export function setNotificationsEnabled(enabled) {
  try {
    localStorage.setItem(NOTIF_PREF_KEY, enabled ? '1' : '0');
  } catch { /* ignora */ }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') {
    setNotificationsEnabled(true);
    return 'granted';
  }
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  if (result === 'granted') setNotificationsEnabled(true);
  return result;
}

/**
 * Dispara uma notificação nativa (se permitido e habilitado).
 * Silenciosa se algo não estiver pronto — nunca quebra a aplicação.
 */
export function showNativeNotification(alert) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!getNotificationsEnabled()) return;

    const notif = new Notification(alert.title, {
      body: alert.message,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: alert.id, // substitui notificação anterior com mesmo id
      requireInteraction: alert.severity === 'critical',
    });

    notif.onclick = () => {
      window.focus();
      if (alert.link) {
        window.location.hash = alert.link;
        // SPA: usa window.location pra dar push state
        try {
          if (window.location.pathname !== alert.link) {
            window.history.pushState({}, '', alert.link);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        } catch { /* ignora */ }
      }
      notif.close();
    };
  } catch (err) {
    // Não interrompe a aplicação se notification falhar
    console.warn('Falha ao mostrar notificação:', err);
  }
}
