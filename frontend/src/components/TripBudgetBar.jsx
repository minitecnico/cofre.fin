import { formatCurrency } from '../utils/format';

/** Gasto x orçamento da viagem. Sem orçamento não mostra nada. */
export default function TripBudgetBar({ spent, budget }) {
  if (!budget) return null;
  const pct = Math.min(100, (spent / budget) * 100);
  const over = spent > budget;
  return (
    <div className="space-y-1.5">
      <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-negative' : pct >= 85 ? 'bg-warn' : 'bg-accent-dark'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs ${over ? 'text-negative font-semibold' : 'text-ink-500'}`}>
        {over
          ? `Passou ${formatCurrency(spent - budget)} do orçamento de ${formatCurrency(budget)}`
          : `Restam ${formatCurrency(budget - spent)} de ${formatCurrency(budget)}`}
      </p>
    </div>
  );
}
