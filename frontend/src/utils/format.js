/**
 * Formata valor em Reais (BRL).
 */
export function formatCurrency(value, options = {}) {
  const { showSign = false, compact = false } = options;
  const num = Number(value) || 0;

  if (compact && Math.abs(num) >= 1000) {
    const formatted = new Intl.NumberFormat('pt-BR', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(num);
    return `R$ ${formatted}`;
  }

  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Math.abs(num));

  if (showSign && num !== 0) {
    return `${num > 0 ? '+' : '−'} ${formatted}`;
  }
  return num < 0 ? `− ${formatted}` : formatted;
}

/**
 * Formata uma data para exibição.
 * --------------------------------------------------------------
 * IMPORTANTE: trata strings 'YYYY-MM-DD' como data LOCAL, não UTC.
 *
 * Por que isso importa: se você fizer new Date('2026-08-28'), o JS interpreta
 * como UTC midnight. Em timezones a oeste (Brasil = UTC-3), isso vira o dia
 * ANTERIOR (27/08 às 21h). O usuário cadastra dia 28 e vê dia 27 — bug clássico.
 *
 * A solução é parsear a string manualmente (ano, mês, dia) e construir
 * a Date com o construtor de componentes — que sempre é interpretado como local.
 */
export function formatDate(date, pattern = 'short') {
  let d;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    // String ISO de data: parseia componentes pra evitar shift de timezone
    const [y, m, dd] = date.slice(0, 10).split('-').map(Number);
    d = new Date(y, m - 1, dd);
  } else {
    d = new Date(date);
  }

  if (pattern === 'short') {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  if (pattern === 'long') {
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString('pt-BR');
}

/**
 * Data de hoje em 'YYYY-MM-DD' no fuso LOCAL.
 * `new Date().toISOString().slice(0, 10)` usa UTC: no Brasil, depois das 21h já
 * devolve o dia seguinte (e uma cobrança que vence hoje aparece "vencida").
 */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatPercent(value) {
  return `${Math.round(value)}%`;
}

/**
 * Converte string "1.234,56" → 1234.56
 */
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  const cleaned = String(input).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/**
 * Extrai dados da amortização mais recente registrada em `notes`.
 * Formato gravado pelo TransactionForm:
 *   "[Amortização DD/MM/AAAA] Original R$ X · Desconto R$ Y · Pago R$ Z"
 *
 * Pode haver múltiplas linhas (uma por amortização); pegamos a última.
 * Tolerante a non-breaking space ( ) que o Intl.NumberFormat às vezes usa.
 *
 * @param {string|null|undefined} notes - Conteúdo do campo `transactions.notes`.
 * @returns {{original:number, discount:number, paid:number, percent:number, date:string|null}|null}
 *          ou null se não houver amortização registrada / formato inválido.
 */
/**
 * Extrai metadados de um financiamento/empréstimo gravados em `notes`.
 * Formato gravado pelo LoanForm na PRIMEIRA parcela:
 *   "[Financiamento] Bem R$ X · Desconto R$ Y · Financiado R$ Z · Taxa W% a.m. · Juros R$ A"
 *
 * @param {string|null|undefined} notes - Conteúdo de `transactions.notes`.
 * @returns {{bem:number, desconto:number, financiado:number, taxa:number, juros:number}|null}
 */
export function parseLoanInfo(notes) {
  if (!notes || typeof notes !== 'string') return null;
  const normalized = notes.replace(/ /g, ' ');
  const line = normalized.split('\n').find((l) => /\[Financiamento/i.test(l));
  if (!line) return null;

  const parsePtBr = (s) => parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const bemMatch = line.match(/Bem\s+R\$\s*([\d.]+,\d{2})/);
  const descMatch = line.match(/Desconto\s+R\$\s*([\d.]+,\d{2})/);
  const finMatch = line.match(/Financiado\s+R\$\s*([\d.]+,\d{2})/);
  const taxaMatch = line.match(/Taxa\s+([\d,.]+)\s*%/);
  const jurosMatch = line.match(/Juros\s+R\$\s*([\d.]+,\d{2})/);

  if (!finMatch) return null;
  return {
    bem: bemMatch ? parsePtBr(bemMatch[1]) : 0,
    desconto: descMatch ? parsePtBr(descMatch[1]) : 0,
    financiado: parsePtBr(finMatch[1]),
    taxa: taxaMatch ? parseFloat(taxaMatch[1].replace(',', '.')) / 100 : 0,
    juros: jurosMatch ? parsePtBr(jurosMatch[1]) : 0,
  };
}

export function parseAmortization(notes) {
  if (!notes || typeof notes !== 'string') return null;
  const normalized = notes.replace(/ /g, ' ');
  const lines = normalized.split('\n').filter((l) => /\[Amortiza/i.test(l));
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1];

  // [Amortização 26/05/2026] Original R$ 1.388,89 · Desconto R$ 438,89 · Pago R$ 950,00
  const dateMatch = last.match(/\[Amortiza[^\]]*?(\d{2}\/\d{2}\/\d{4})/);
  const m = last.match(
    /Original\s+R\$\s*([\d.]+,\d{2}).*?Desconto\s+R\$\s*([\d.]+,\d{2}).*?Pago\s+R\$\s*([\d.]+,\d{2})/
  );
  if (!m) return null;

  const parsePtBr = (s) => parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const original = parsePtBr(m[1]);
  const discount = parsePtBr(m[2]);
  const paid = parsePtBr(m[3]);
  const percent = original > 0 ? (discount / original) * 100 : 0;

  return {
    original,
    discount,
    paid,
    percent,
    date: dateMatch ? dateMatch[1] : null,
  };
}

/**
 * Gera as datas das parcelas a partir de uma data inicial.
 * --------------------------------------------------------------
 * Mantém o MESMO DIA do mês em cada parcela. Se o mês alvo não tiver esse dia
 * (ex: dia 31 em fevereiro), usa o último dia do mês.
 *
 * Ex: '2026-04-15' + 4 parcelas →
 *   ['2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15']
 *
 * Ex: '2026-01-31' + 3 parcelas →
 *   ['2026-01-31', '2026-02-28', '2026-03-31']
 */
export function generateInstallmentDates(startDateStr, count) {
  const startDate = new Date(startDateStr + 'T00:00:00');
  const targetDay = startDate.getDate();
  const dates = [];

  for (let i = 0; i < count; i++) {
    const targetMonth = startDate.getMonth() + i;
    const targetYear = startDate.getFullYear();
    const candidate = new Date(targetYear, targetMonth, 1); // dia 1 do mês alvo
    // Último dia do mês alvo
    const lastDayOfMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
    const day = Math.min(targetDay, lastDayOfMonth);
    candidate.setDate(day);

    // Format YYYY-MM-DD (timezone-safe)
    const y = candidate.getFullYear();
    const m = String(candidate.getMonth() + 1).padStart(2, '0');
    const d = String(candidate.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
  }

  return dates;
}

/**
 * Divide um valor em N parcelas, ajustando centavos pra somar exato.
 * Ex: 100,00 em 3 → [33.34, 33.33, 33.33] (a primeira pega o centavo extra)
 *
 * Internamente usa dinero.js v2 + `allocate` — trabalha em centavos e
 * distribui o resto da divisão começando pela 1ª posição (igual ao
 * comportamento que tínhamos manualmente).
 */
import { dinero, allocate, toSnapshot } from 'dinero.js';

// Currency BRL inline (evita dependência do pacote @dinero.js/currencies).
// base 10 + exponent 2 = duas casas decimais (centavos).
const BRL = { code: 'BRL', base: 10, exponent: 2 };

export function splitInstallmentAmount(total, count) {
  const cents = Math.round(total * 100);
  const totalDinero = dinero({ amount: cents, currency: BRL });
  // ratios iguais: allocate joga os centavos sobressalentes nas primeiras
  // posições — mesma ordem que a versão manual antes.
  const parts = allocate(totalDinero, Array(count).fill(1));
  return parts.map((p) => toSnapshot(p).amount / 100);
}
