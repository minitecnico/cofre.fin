import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, AlertTriangle, StickyNote } from 'lucide-react';
import { formatCurrency, formatDate, todayISO } from '../utils/format';

/**
 * Extrato de um empréstimo: resumo, taxa, parcelas em aberto / pagas e
 * observações. Usado no detalhe do app (dono) e na página pública
 * /emprestimo/:code — mesma tela nos dois lados, os números sempre batem.
 *
 * @param {{ parcels: Array<{number:number,total:number,date:string,amount:number|string,paid:boolean}>,
 *           rate: number|null,   // taxa mensal em decimal (0.015 = 1,5% a.m.)
 *           info: {financiado:number, juros:number}|null,
 *           notes: string|null }} props
 */
export default function LoanStatement({ parcels, rate, info, notes }) {
  const [tab, setTab] = useState('open');
  const today = todayISO();

  const s = useMemo(() => {
    const open = parcels.filter((p) => !p.paid);
    const paid = parcels.filter((p) => p.paid);
    const sum = (list) => list.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const total = parcels[0]?.total || parcels.length;
    return {
      open,
      paid: [...paid].reverse(), // última paga no topo
      openSum: sum(open),
      paidSum: sum(paid),
      overdue: open.filter((p) => p.date < today),
      next: open[0] || null,
      total,
      percent: total ? Math.round((paid.length / total) * 100) : 0,
    };
  }, [parcels, today]);

  const pct = (v) => `${(v * 100).toFixed(2).replace('.', ',')}%`;
  const yearRate = rate > 0 ? Math.pow(1 + rate, 12) - 1 : 0;
  const list = tab === 'open' ? s.open : s.paid;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="rounded-2xl bg-ink-950 text-white p-5 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-accent/20 blur-2xl pointer-events-none" />
        <p className="relative text-[10px] uppercase tracking-widest font-bold text-accent">Falta pagar</p>
        <p className="relative font-display text-3xl md:text-4xl font-bold tabular-nums mt-1">{formatCurrency(s.openSum)}</p>
        <p className="relative text-xs opacity-70 mt-1">
          {s.open.length} de {s.total} parcelas em aberto · já pago {formatCurrency(s.paidSum)}
        </p>
        <div className="relative mt-4 w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full" style={{ width: `${s.percent}%` }} />
        </div>
        <p className="relative text-[10px] opacity-70 mt-1.5">{s.percent}% concluído</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Próxima parcela" value={s.next ? formatCurrency(s.next.amount) : 'Quitado'}
          hint={s.next ? `${s.next.number}/${s.total} · ${formatDate(s.next.date, 'numeric')}` : 'Todas pagas'} />
        <Stat label="Taxa de juros" value={rate > 0 ? `${pct(rate)} a.m.` : rate === 0 ? 'Sem juros' : '—'}
          hint={rate > 0 ? `≈ ${pct(yearRate)} ao ano` : rate === 0 ? '' : 'Não informada'} />
        {info?.financiado > 0 && <Stat label="Valor financiado" value={formatCurrency(info.financiado)} />}
        {info?.juros > 0 && <Stat label="Total de juros" value={formatCurrency(info.juros)} tone="negative" />}
      </div>

      {s.overdue.length > 0 && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-negative/30 text-sm text-negative">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <b>{s.overdue.length} {s.overdue.length === 1 ? 'parcela atrasada' : 'parcelas atrasadas'}</b>
            {' '}· {formatCurrency(s.overdue.reduce((a, p) => a + Number(p.amount), 0))}
          </span>
        </div>
      )}

      {notes?.trim() && (
        <div className="px-4 py-3 rounded-xl bg-surface-soft border border-hairline-light">
          <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500 flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" /> Observações
          </p>
          <p className="text-sm text-ink-800 mt-1.5 whitespace-pre-wrap break-words">{notes}</p>
        </div>
      )}

      {/* Parcelas */}
      <div>
        <div className="grid grid-cols-2 gap-1 p-1 bg-surface-soft rounded-xl mb-3">
          {[['open', `Em aberto (${s.open.length})`], ['paid', `Pagas (${s.paid.length})`]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`min-h-[40px] rounded-lg text-sm font-semibold transition-colors ${
                tab === id ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-ink-500 text-center py-6">
            {tab === 'open' ? 'Nenhuma parcela em aberto. 🎉' : 'Nenhuma parcela paga ainda.'}
          </p>
        ) : (
          <ul className="rounded-2xl border border-hairline-light bg-white divide-y divide-hairline-light overflow-hidden">
            {list.map((p) => {
              const late = !p.paid && p.date < today;
              return (
                <li key={p.number} className="flex items-center gap-3 px-4 py-3">
                  {p.paid
                    ? <CheckCircle2 className="w-5 h-5 text-positive flex-shrink-0" />
                    : <Circle className={`w-5 h-5 flex-shrink-0 ${late ? 'text-negative' : 'text-ink-300'}`} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900 tabular-nums">Parcela {p.number}/{p.total}</p>
                    <p className={`text-xs tabular-nums ${late ? 'text-negative font-semibold' : 'text-ink-500'}`}>
                      {late ? 'Venceu em ' : p.paid ? '' : 'Vence em '}{formatDate(p.date, 'numeric')}
                    </p>
                  </div>
                  <p className={`font-display font-bold tabular-nums ${p.paid ? 'text-ink-400' : 'text-ink-900'}`}>
                    {formatCurrency(p.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-2xl border border-hairline-light bg-white p-4 min-w-0">
      <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">{label}</p>
      <p className={`font-display text-lg font-bold tabular-nums mt-1 break-words ${tone === 'negative' ? 'text-negative' : ''}`}>{value}</p>
      {hint && <p className="text-[11px] text-ink-500 mt-0.5">{hint}</p>}
    </div>
  );
}
