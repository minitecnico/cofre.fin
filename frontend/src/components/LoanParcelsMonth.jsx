import { useCallback, useEffect, useState } from 'react';
import { Landmark, Plus, Minus, Loader2 } from 'lucide-react';
import { loanService } from '../services';
import { useMonth } from '../context/MonthContext';
import { formatCurrency, formatDate } from '../utils/format';

/**
 * Quadro em Despesas: parcelas de empréstimo do mês selecionado.
 * Empréstimo novo nasce com as parcelas FORA das despesas (não contam no
 * saldo); aqui a pessoa inclui a parcela do mês — ou tira, se mudar de ideia.
 * Não aparece se o mês não tiver parcela de empréstimo.
 */
export default function LoanParcelsMonth({ onChange }) {
  const { startDate, endDate, label } = useMonth();
  const [data, setData] = useState({ hidden: [], included: [] });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  // Sem a migration no banco a consulta falha — o quadro só não aparece.
  const load = useCallback(() => (
    loanService.monthParcels(startDate, endDate).then(setData).catch(() => setData({ hidden: [], included: [] }))
  ), [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  async function move(id, include) {
    setBusy(id);
    setError(null);
    try {
      if (include) await loanService.includeParcels([id]);
      else await loanService.excludeParcels([id]);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message || 'Não foi possível concluir. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  const { hidden, included } = data;
  if (hidden.length === 0 && included.length === 0) return null;
  const hiddenSum = hidden.reduce((a, p) => a + Number(p.amount), 0);

  const row = (p, include) => (
    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900 truncate">{p.description}</p>
        <p className="text-xs text-ink-500 tabular-nums">
          {formatDate(p.date, 'numeric')}{p.paid && ' · paga'}
        </p>
      </div>
      <p className="font-display font-bold tabular-nums text-ink-900">{formatCurrency(p.amount)}</p>
      <button
        type="button"
        onClick={() => move(p.id, include)}
        disabled={busy === p.id}
        className={`inline-flex items-center gap-1 px-3 min-h-[36px] rounded-full text-xs font-bold flex-shrink-0 disabled:opacity-60 ${
          include ? 'bg-ink-950 text-white hover:bg-ink-800' : 'border border-ink-300 text-ink-700 hover:bg-ink-50'
        }`}
      >
        {busy === p.id
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : include ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
        {include ? 'Incluir' : 'Tirar'}
      </button>
    </li>
  );

  return (
    <section className="rounded-2xl border border-hairline-light bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3 bg-surface-soft border-b border-hairline-light">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
          <Landmark className="w-4 h-4 text-ink-900" />
        </div>
        <div className="min-w-0">
          <p className="font-display font-bold text-sm">Parcelas de empréstimo em {label}</p>
          <p className="text-xs text-ink-500 mt-0.5">
            {hidden.length > 0
              ? `${formatCurrency(hiddenSum)} fora das despesas — inclua para compor o mês e o saldo.`
              : 'Todas as parcelas deste mês já estão nas despesas.'}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-hairline-light">
        {hidden.map((p) => row(p, true))}
        {included.map((p) => row(p, false))}
      </ul>
      {error && <p className="px-4 pb-3 text-sm text-negative font-medium">{error}</p>}
    </section>
  );
}
