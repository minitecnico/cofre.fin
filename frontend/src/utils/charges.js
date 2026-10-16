import { todayISO } from './format';

/**
 * Regras de apresentação das cobranças, compartilhadas entre a página de
 * Cobranças (visão do credor) e o extrato público (/extrato/:code, visão do
 * devedor). Mesma função nos dois lados = os números sempre batem.
 */

/** "Notebook (2/6)" → "Notebook". */
export function baseDescription(description) {
  return String(description || '').replace(/\s*\(\d+\/\d+\)\s*$/, '');
}

export function isOverdue(charge, today = todayISO()) {
  return !charge.paid && !!charge.due_date && charge.due_date < today;
}

/**
 * Agrupa as cobranças em blocos: cada avulsa é um bloco; parcelas do mesmo
 * installment_group_id viram UM bloco agrupado (ordenado pelo nº da parcela).
 *
 * Pagas afundam: blocos totalmente quitados vão pro fim, abertos ficam no topo,
 * mantendo a ordem relativa original (sort estável). Assim o que ainda falta
 * receber está sempre em cima.
 */
export function groupCharges(charges) {
  const groups = [];
  const byGroup = new Map();
  for (const c of charges) {
    if (c.installment_group_id) {
      let g = byGroup.get(c.installment_group_id);
      if (!g) {
        g = { type: 'installment', groupId: c.installment_group_id, items: [] };
        byGroup.set(c.installment_group_id, g);
        groups.push(g);
      }
      g.items.push(c);
    } else {
      groups.push({ type: 'single', items: [c] });
    }
  }
  for (const g of groups) {
    if (g.type === 'installment') g.items.sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
  }
  const isDone = (g) => g.items.every((c) => c.paid);
  return groups
    .map((g, i) => [g, i])
    .sort((a, b) => (isDone(a[0]) - isDone(b[0])) || (a[1] - b[1]))
    .map(([g]) => g);
}

/**
 * "Carteira" de um conjunto de cobranças: quanto é a dívida, quanto já foi
 * pago, quanto falta, e a contagem de parcelas/dívidas pagas × pendentes.
 */
export function summarizeCharges(charges) {
  const today = todayISO();
  let total = 0, paid = 0, overdue = 0, paidCount = 0, overdueCount = 0;
  let nextDue = null;
  for (const c of charges) {
    const amount = Number(c.amount) || 0;
    total += amount;
    if (c.paid) {
      paid += amount;
      paidCount += 1;
    } else {
      if (isOverdue(c, today)) { overdue += amount; overdueCount += 1; }
      if (c.due_date && (!nextDue || c.due_date < nextDue)) nextDue = c.due_date;
    }
  }
  // Arredonda em centavos: soma de floats deixa resíduo (0.1 + 0.2).
  const round = (v) => Math.round(v * 100) / 100;
  return {
    total: round(total),
    paid: round(paid),
    open: round(total - paid),
    overdue: round(overdue),
    count: charges.length,
    paidCount,
    openCount: charges.length - paidCount,
    overdueCount,
    nextDue,
    progress: total > 0 ? Math.round((paid / total) * 100) : 0,
  };
}
