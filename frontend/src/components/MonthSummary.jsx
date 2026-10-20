import { useMemo, useState } from 'react';
import { MessageCircle, Copy, Check, Share2 } from 'lucide-react';
import MonthSelector from './MonthSelector';
import { formatCurrency } from '../utils/format';
import { waLink } from '../services/cobrancasReport';

/**
 * Resumo do mês pronto pra mandar pra alguém: receitas, despesas (em aberto e
 * pagas) e saldo, listados — e o mesmo conteúdo em texto pro WhatsApp.
 *
 * Os itens vêm do dashboard (já filtrados pelo mês do MonthContext); trocar o
 * mês aqui troca o do app inteiro. Saldo = receitas − despesas (regra mestra:
 * despesa no cartão também conta).
 */
export default function MonthSummary({ items, loading, monthLabel }) {
  const [copied, setCopied] = useState(false);
  const s = useMemo(() => summarize(items), [items]);
  const text = useMemo(() => buildText(s, monthLabel), [s, monthLabel]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* sem permissão */ }
  }

  async function share() {
    try { await navigator.share({ title: `Resumo de ${monthLabel}`, text }); } catch { /* cancelado */ }
  }

  return (
    <div className="space-y-5">
      <MonthSelector />

      {loading ? (
        <div className="space-y-2">
          <div className="h-28 bg-ink-100 animate-pulse rounded-2xl" />
          <div className="h-12 bg-ink-100 animate-pulse rounded-full" />
        </div>
      ) : (
        <>
          {/* Totais */}
          <div className="rounded-2xl border border-ink-200 p-4 space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between gap-3">
              <span className="text-ink-500">Receitas</span>
              <span className="font-semibold text-positive">{formatCurrency(s.income)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-500">Despesas</span>
              <span className="font-semibold text-negative">− {formatCurrency(s.expense)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-ink-100">
              <span className="font-bold text-ink-900">Saldo</span>
              <span className={`font-display font-bold text-2xl ${s.balance < 0 ? 'text-negative' : 'text-ink-900'}`}>
                {formatCurrency(s.balance)}
              </span>
            </div>
          </div>

          {/* Enviar */}
          <div className="flex gap-2">
            <a href={waLink('', text)} target="_blank" rel="noopener noreferrer" className="btn-accent flex-1">
              <MessageCircle className="w-5 h-5" /> Enviar no WhatsApp
            </a>
            <button onClick={copy} className="btn-ghost w-12 px-0 flex-shrink-0" title="Copiar texto" aria-label="Copiar texto">
              {copied ? <Check className="w-4 h-4 text-positive" /> : <Copy className="w-4 h-4" />}
            </button>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button onClick={share} className="btn-ghost w-12 px-0 flex-shrink-0" title="Compartilhar" aria-label="Compartilhar">
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Listas */}
          {items.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-4">Nenhum lançamento em {monthLabel}.</p>
          ) : (
            <div className="space-y-5">
              <Section title="Receitas" total={s.income} list={s.incomes} />
              <Section title="Em aberto" total={s.openTotal} list={s.open} tone="text-negative" />
              <Section title="Pagas" total={s.paidTotal} list={s.paid} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, total, list, tone = 'text-ink-900' }) {
  if (list.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 pb-1.5 border-b border-ink-100">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
          {title} · {list.length}
        </p>
        <p className={`text-sm font-bold tabular-nums ${tone}`}>{formatCurrency(total)}</p>
      </div>
      <ul className="divide-y divide-ink-50">
        {list.map((t) => (
          <li key={t.id} className="flex items-baseline gap-3 py-2 text-sm">
            <span className="w-11 flex-shrink-0 text-xs text-ink-400 tabular-nums">{ddmm(t.date)}</span>
            <span className="min-w-0 flex-1 truncate text-ink-800">{t.description}</span>
            <span className="flex-shrink-0 font-semibold text-ink-900 tabular-nums">{formatCurrency(t.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Separa e soma as transações do mês. */
function summarize(items) {
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const sum = (list) => Math.round(list.reduce((acc, t) => acc + Number(t.amount), 0) * 100) / 100;
  const incomes = items.filter((t) => t.type === 'income').sort(byDate);
  const expenses = items.filter((t) => t.type === 'expense');
  const open = expenses.filter((t) => !t.paid).sort(byDate);
  const paid = expenses.filter((t) => t.paid).sort(byDate);
  const income = sum(incomes);
  const expense = sum(expenses);
  return {
    incomes, open, paid, income, expense,
    openTotal: sum(open),
    paidTotal: sum(paid),
    balance: Math.round((income - expense) * 100) / 100,
  };
}

/** Texto pro WhatsApp (*negrito* é a marcação do próprio WhatsApp). */
function buildText(s, monthLabel) {
  const line = (t) => `• ${ddmm(t.date)} ${t.description} — ${formatCurrency(t.amount)}`;
  const lines = [
    `*Resumo de ${monthLabel}*`,
    '',
    `Receitas: ${formatCurrency(s.income)}`,
    `Despesas: ${formatCurrency(s.expense)}`,
    `*Saldo: ${formatCurrency(s.balance)}*`,
  ];
  if (s.incomes.length) lines.push('', `*Receitas — ${formatCurrency(s.income)}*`, ...s.incomes.map(line));
  if (s.open.length) lines.push('', `*Em aberto — ${formatCurrency(s.openTotal)}*`, ...s.open.map(line));
  if (s.paid.length) lines.push('', `*Pagas — ${formatCurrency(s.paidTotal)}*`, ...s.paid.map(line));
  return lines.join('\n');
}

/** 'YYYY-MM-DD' → 'DD/MM' (direto da string, sem fuso). */
function ddmm(date) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}
