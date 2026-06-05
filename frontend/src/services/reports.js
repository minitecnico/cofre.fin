import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { transactionService, dashboardService } from './index';
import { formatCurrency, formatDate } from '../utils/format';

/**
 * Service de Relatórios.
 *
 * Responsabilidades:
 *   1. buildReportData(month)  → agrega os números do mês (KPIs, categorias, lista)
 *   2. generatePdf(report)     → monta um PDF (jsPDF + autoTable) e devolve Blob
 *   3. buildWhatsappText(report) → resumo curto em texto pra mandar no WhatsApp
 *   4. shareReport({...})      → envia via Web Share API (PDF anexo) com fallback wa.me
 *
 * Tudo client-side — não há backend. A foto/segurança continua nas RLS do Postgres.
 */

// Paleta usada no PDF (espelha tailwind.config: accent/ink/semânticos)
const COLOR = {
  ink900: [24, 24, 27],
  ink600: [82, 82, 91],
  ink400: [161, 161, 170],
  ink100: [244, 244, 245],
  accent: [155, 201, 46], // accent.dark — legível em fundo claro
  positive: [16, 185, 129],
  negative: [239, 68, 68],
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** 'YYYY-MM' → 'Junho 2026' */
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Limites de data do mês ('YYYY-MM' → start/end 'YYYY-MM-DD') */
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Coleta e agrega os dados do mês
// ─────────────────────────────────────────────────────────────────────────

/**
 * Monta o objeto de relatório de um mês.
 * Reaproveita dashboardService (KPIs/categorias) + transactionService (lista crua).
 *
 * @param {string} month 'YYYY-MM'
 * @returns {Promise<Object>} dados estruturados do relatório
 */
export async function buildReportData(month) {
  const { startDate, endDate } = monthRange(month);

  const [summary, txRes] = await Promise.all([
    dashboardService.summary('month', month),
    transactionService.list({ startDate, endDate }),
  ]);

  const transactions = txRes.transactions || [];

  // Totais do mês (a partir da lista, fonte única de verdade pras tabelas)
  let income = 0;
  let expense = 0;
  let unpaidCount = 0;
  let unpaidTotal = 0;

  // Agrupa por categoria, separando receita/despesa
  const byCatExpense = new Map();
  const byCatIncome = new Map();

  for (const tx of transactions) {
    const amount = Number(tx.amount) || 0;
    const catName = tx.category?.name || 'Sem categoria';
    if (tx.type === 'income') {
      income += amount;
      addToMap(byCatIncome, catName, amount);
    } else {
      expense += amount;
      addToMap(byCatExpense, catName, amount);
      if (!tx.paid) {
        unpaidCount += 1;
        unpaidTotal += amount;
      }
    }
  }

  const balance = income - expense;

  return {
    month,
    label: monthLabel(month),
    kpis: {
      income,
      expense,
      balance,
      totalBalance: summary?.balance?.balance ?? null, // saldo geral (todos os meses)
      txCount: transactions.length,
      unpaidCount,
      unpaidTotal,
    },
    comparison: summary?.comparison || null,
    expenseByCategory: mapToSortedArray(byCatExpense, expense),
    incomeByCategory: mapToSortedArray(byCatIncome, income),
    transactions: transactions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function addToMap(map, key, amount) {
  const cur = map.get(key) || { total: 0, count: 0 };
  cur.total += amount;
  cur.count += 1;
  map.set(key, cur);
}

function mapToSortedArray(map, grandTotal) {
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      count: v.count,
      percent: grandTotal > 0 ? (v.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Gera o PDF
// ─────────────────────────────────────────────────────────────────────────

/**
 * Gera o PDF do relatório e devolve { blob, filename }.
 * @param {Object} report saída de buildReportData
 */
export function generatePdf(report) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40; // margem
  let y = M;

  // ── Cabeçalho ──────────────────────────────────────────────
  doc.setFillColor(...COLOR.ink900);
  doc.rect(0, 0, pageW, 90, 'F');
  doc.setTextColor(...COLOR.accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Cofre', M, 42);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('Relatório Financeiro', M, 64);
  doc.setTextColor(...COLOR.ink400);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(report.label, pageW - M, 42, { align: 'right' });
  doc.text(`Gerado em ${formatDate(todayIso(), 'long')}`, pageW - M, 60, { align: 'right' });

  y = 120;

  // ── KPIs (4 cards) ─────────────────────────────────────────
  const k = report.kpis;
  const cards = [
    { label: 'Receitas', value: formatCurrency(k.income), color: COLOR.positive },
    { label: 'Despesas', value: formatCurrency(k.expense), color: COLOR.negative },
    { label: 'Saldo do mês', value: formatCurrency(k.balance), color: k.balance >= 0 ? COLOR.positive : COLOR.negative },
    { label: 'Lançamentos', value: String(k.txCount), color: COLOR.ink900 },
  ];
  const gap = 12;
  const cardW = (pageW - 2 * M - 3 * gap) / 4;
  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    doc.setFillColor(...COLOR.ink100);
    doc.roundedRect(x, y, cardW, 56, 6, 6, 'F');
    doc.setTextColor(...COLOR.ink600);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(c.label.toUpperCase(), x + 10, y + 18);
    doc.setTextColor(...c.color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(c.value, x + 10, y + 40);
  });
  y += 56 + 24;

  // Linha de contexto: saldo total + pendências + comparação
  doc.setTextColor(...COLOR.ink600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const ctxLines = [];
  if (k.totalBalance != null) {
    ctxLines.push(`Saldo total acumulado: ${formatCurrency(k.totalBalance)}`);
  }
  if (k.unpaidCount > 0) {
    ctxLines.push(`Despesas pendentes: ${k.unpaidCount} (${formatCurrency(k.unpaidTotal)})`);
  }
  if (report.comparison?.expenseChange != null) {
    const ch = report.comparison.expenseChange;
    ctxLines.push(`Despesas vs mês anterior: ${ch >= 0 ? '+' : ''}${ch.toFixed(0)}%`);
  }
  ctxLines.forEach((line) => {
    doc.text(line, M, y);
    y += 16;
  });
  y += 8;

  // ── Tabela: Despesas por categoria ─────────────────────────
  if (report.expenseByCategory.length > 0) {
    y = sectionTitle(doc, 'Despesas por categoria', M, y);
    autoTable(doc, {
      startY: y,
      head: [['Categoria', 'Qtd', 'Valor', '% do total']],
      body: report.expenseByCategory.map((c) => [
        c.name,
        String(c.count),
        formatCurrency(c.total),
        `${c.percent.toFixed(1)}%`,
      ]),
      ...tableStyle(COLOR.negative),
    });
    y = doc.lastAutoTable.finalY + 24;
  }

  // ── Tabela: Receitas por categoria ─────────────────────────
  if (report.incomeByCategory.length > 0) {
    y = sectionTitle(doc, 'Receitas por categoria', M, y);
    autoTable(doc, {
      startY: y,
      head: [['Categoria', 'Qtd', 'Valor', '% do total']],
      body: report.incomeByCategory.map((c) => [
        c.name,
        String(c.count),
        formatCurrency(c.total),
        `${c.percent.toFixed(1)}%`,
      ]),
      ...tableStyle(COLOR.positive),
    });
    y = doc.lastAutoTable.finalY + 24;
  }

  // ── Tabela: Lançamentos detalhados ─────────────────────────
  if (report.transactions.length > 0) {
    y = sectionTitle(doc, 'Lançamentos do mês', M, y);
    autoTable(doc, {
      startY: y,
      head: [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status']],
      body: report.transactions.map((tx) => [
        formatDate(tx.date, 'short'),
        tx.description || '—',
        tx.category?.name || '—',
        tx.type === 'income' ? 'Receita' : 'Despesa',
        formatCurrency(tx.amount),
        tx.type === 'income' ? 'Recebida' : tx.paid ? 'Paga' : 'Pendente',
      ]),
      ...tableStyle(COLOR.ink900),
      columnStyles: { 1: { cellWidth: 130 } },
    });
  }

  // ── Rodapé (numeração) ─────────────────────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.ink400);
    doc.text(
      `Cofre · Relatório ${report.label} · pág. ${i}/${total}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' }
    );
  }

  const blob = doc.output('blob');
  const filename = `relatorio-cofre-${report.month}.pdf`;
  return { blob, filename };
}

function sectionTitle(doc, text, x, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COLOR.ink900);
  doc.text(text, x, y);
  return y + 10;
}

function tableStyle(headColor) {
  return {
    theme: 'striped',
    margin: { left: 40, right: 40 },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: COLOR.ink600 },
    headStyles: { fillColor: headColor, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: COLOR.ink100 },
  };
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Resumo em texto pro WhatsApp
// ─────────────────────────────────────────────────────────────────────────

/**
 * Monta um resumo curto em texto (markdown leve do WhatsApp: *negrito*).
 */
export function buildWhatsappText(report) {
  const k = report.kpis;
  const lines = [
    `*Relatório Financeiro — ${report.label}*`,
    '',
    `💰 Receitas: ${formatCurrency(k.income)}`,
    `💸 Despesas: ${formatCurrency(k.expense)}`,
    `📊 Saldo do mês: ${formatCurrency(k.balance)}`,
  ];
  if (k.totalBalance != null) {
    lines.push(`🏦 Saldo total: ${formatCurrency(k.totalBalance)}`);
  }
  if (k.unpaidCount > 0) {
    lines.push(`⏳ Pendentes: ${k.unpaidCount} (${formatCurrency(k.unpaidTotal)})`);
  }
  // Top 3 despesas por categoria
  const top = report.expenseByCategory.slice(0, 3);
  if (top.length > 0) {
    lines.push('', '*Maiores gastos:*');
    top.forEach((c) => {
      lines.push(`• ${c.name}: ${formatCurrency(c.total)} (${c.percent.toFixed(0)}%)`);
    });
  }
  lines.push('', '_Gerado pelo app Cofre._');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Envio via WhatsApp
// ─────────────────────────────────────────────────────────────────────────

/** Sanitiza telefone pra padrão wa.me (só dígitos, com DDI). */
function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  // Se veio sem DDI (não começa com 55) e tem 10-11 dígitos, assume Brasil
  if (digits.length >= 10 && digits.length <= 11) digits = `55${digits}`;
  return digits;
}

/**
 * Tenta compartilhar o PDF via Web Share API (menu nativo → WhatsApp com anexo).
 * Retorna 'shared' se conseguiu. Lança/retorna 'unsupported' se o device não suporta
 * compartilhar arquivos (aí o chamador usa o fallback wa.me só-texto).
 */
export async function shareReportFile({ blob, filename, text }) {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unsupported';
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], text, title: 'Relatório Cofre' });
    return 'shared';
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled'; // usuário fechou o menu
    return 'unsupported';
  }
}

/**
 * Abre o WhatsApp (web/app) com o texto do resumo pré-preenchido.
 * Não anexa o PDF (limitação do link wa.me) — usado como fallback.
 * @param {string} text resumo
 * @param {string} [phone] telefone destino (opcional)
 */
export function openWhatsappText(text, phone) {
  const num = normalizePhone(phone);
  const base = num ? `https://wa.me/${num}` : 'https://wa.me/';
  const url = `${base}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

/** Baixa o PDF localmente (pra anexar manualmente ou guardar). */
export function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
