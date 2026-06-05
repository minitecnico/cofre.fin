import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from '../utils/format';

/**
 * Relatório de cobranças (PDF) + mensagens de WhatsApp.
 *
 * Módulo separado do resto pra que o jsPDF (pesado) entre só no chunk lazy da
 * página de Cobranças.
 */

const COLOR = {
  ink900: [24, 24, 27],
  ink600: [82, 82, 91],
  ink400: [161, 161, 170],
  ink100: [244, 244, 245],
  accent: [155, 201, 46],
  positive: [16, 185, 129],
  negative: [239, 68, 68],
};

/** Telefone → dígitos com DDI Brasil (pra wa.me). '' se vazio/invalido. */
export function normalizePhone(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 11) d = `55${d}`;
  return d;
}

/** Link wa.me com texto opcional. */
export function waLink(phone, text) {
  const num = normalizePhone(phone);
  const base = num ? `https://wa.me/${num}` : 'https://wa.me/';
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/**
 * Mensagem de cobrança pra um devedor (texto WhatsApp).
 * @param {string} debtorName
 * @param {Array} charges  cobranças em aberto do devedor
 * @param {Object} [opts]
 * @param {string} [opts.pixPayload] copia-e-cola do PIX (anexa no fim)
 * @param {string} [opts.ownerName]  como o usuário assina
 */
export function buildReminderText(debtorName, charges, opts = {}) {
  const open = charges.filter((c) => !c.paid);
  const total = open.reduce((s, c) => s + Number(c.amount), 0);

  const lines = [
    `Oi, ${debtorName}! 👋`,
    '',
    open.length === 1
      ? 'Passando pra lembrar da pendência:'
      : 'Passando pra lembrar das pendências:',
  ];
  open.forEach((c) => {
    const due = c.due_date ? ` (vence ${formatDate(c.due_date, 'long')})` : '';
    lines.push(`• ${c.description}: ${formatCurrency(c.amount)}${due}`);
  });
  lines.push('', `*Total: ${formatCurrency(total)}*`);

  if (opts.pixPayload) {
    lines.push('', 'Pode pagar via PIX (copia e cola):', opts.pixPayload);
  }
  lines.push('', opts.ownerName ? `Obrigado! — ${opts.ownerName}` : 'Obrigado! 🙏');
  return lines.join('\n');
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Gera o PDF do relatório de cobranças.
 * Cada devedor com telefone vira um LINK CLICÁVEL (wa.me) no PDF.
 *
 * @param {Object} report
 * @param {Array}  report.debtors  [{ name, phone, openAmount, overdueAmount, charges:[...] }]
 * @param {number} report.totalOpen
 * @param {number} report.totalOverdue
 * @returns {{ blob: Blob, filename: string }}
 */
export function generateChargesPdf(report) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;

  // Cabeçalho
  doc.setFillColor(...COLOR.ink900);
  doc.rect(0, 0, pageW, 90, 'F');
  doc.setTextColor(...COLOR.accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Cofre', M, 42);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('Relatório de Cobranças', M, 64);
  doc.setTextColor(...COLOR.ink400);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatDate(todayIso(), 'long')}`, pageW - M, 42, { align: 'right' });

  let y = 120;

  // Totais
  doc.setTextColor(...COLOR.ink900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Total a receber: ${formatCurrency(report.totalOpen)}`, M, y);
  if (report.totalOverdue > 0) {
    doc.setTextColor(...COLOR.negative);
    doc.setFontSize(11);
    doc.text(`Vencido: ${formatCurrency(report.totalOverdue)}`, M, y + 18);
    y += 18;
  }
  y += 28;

  // Por devedor
  report.debtors.forEach((d) => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = M;
    }

    doc.setTextColor(...COLOR.ink900);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(d.name, M, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR.ink600);
    doc.text(`Em aberto: ${formatCurrency(d.openAmount)}`, pageW - M, y, { align: 'right' });

    // Link clicável de WhatsApp
    if (d.phone) {
      doc.setTextColor(37, 211, 102); // verde WhatsApp
      doc.setFont('helvetica', 'bold');
      doc.textWithLink('Cobrar no WhatsApp »', M, y + 16, { url: waLink(d.phone, d.reminderText) });
      y += 16;
    }
    y += 8;

    // Tabela de cobranças do devedor
    const body = (d.charges || []).map((c) => [
      c.description,
      c.due_date ? formatDate(c.due_date, 'long') : '—',
      c.paid ? 'Pago' : (c.due_date && c.due_date < todayIso() ? 'Vencido' : 'Pendente'),
      formatCurrency(c.amount),
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Descrição', 'Vencimento', 'Status', 'Valor']],
      body,
      theme: 'striped',
      margin: { left: M, right: M },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: COLOR.ink600 },
      headStyles: { fillColor: COLOR.ink900, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: COLOR.ink100 },
    });
    y = doc.lastAutoTable.finalY + 26;
  });

  // Rodapé
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.ink400);
    doc.text(`Cofre · Cobranças · pág. ${i}/${total}`, pageW / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' });
  }

  return { blob: doc.output('blob'), filename: `cobrancas-cofre-${todayIso()}.pdf` };
}
