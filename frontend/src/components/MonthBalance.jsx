import { formatCurrency } from '../utils/format';
import { useMonthlySummary } from '../hooks/useMonthlySummary';

/**
 * A conta do mês, sempre à vista: Receitas − Despesas = Saldo (regra mestra:
 * despesa no cartão também conta). Números do servidor (get_monthly_summary),
 * os mesmos do Dashboard. `refreshKey` muda quando a lista muda.
 *
 * Desktop (lg+): três quadros com os sinais entre eles. Abaixo disso, um
 * extrato em linhas — cabe em qualquer largura sem quebrar valor.
 */
export default function MonthBalance({ refreshKey }) {
  const { data, error } = useMonthlySummary(1, refreshKey);
  if (error) return null; // sem a migration: a página segue sem o resumo
  const m = data?.[0];
  if (!m) return <div className="h-32 bg-ink-100 animate-pulse rounded-2xl" />;
  const negative = m.balance < 0;

  return (
    <>
      <div className="lg:hidden card-flat p-4 space-y-2 text-sm tabular-nums">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ink-500">Receitas</span>
          <span className="font-semibold text-positive">{formatCurrency(m.income)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ink-500">Despesas</span>
          <span className="font-semibold text-negative">− {formatCurrency(m.expense)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-ink-100">
          <span className="font-bold text-ink-900">Saldo do mês</span>
          <span className={`font-display font-bold text-2xl ${negative ? 'text-negative' : 'text-ink-900'}`}>
            {formatCurrency(m.balance)}
          </span>
        </div>
      </div>

      <div className="hidden lg:grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3">
        <Tile label="Receitas" value={formatCurrency(m.income)} tone="text-positive" hint="Entradas do mês" />
        <Operator>−</Operator>
        <Tile label="Despesas" value={formatCurrency(m.expense)} tone="text-negative" hint="Saídas do mês, inclusive cartão" />
        <Operator>=</Operator>
        <div className="h-full rounded-2xl shadow-soft p-5 bg-ink-950 text-white border border-hairline-strong">
          <p className="text-[11px] uppercase font-semibold tracking-widest text-accent">Saldo do mês</p>
          <p className={`stat-number text-2xl xl:text-3xl mt-2 whitespace-nowrap ${negative ? 'text-red-400' : 'text-white'}`}>{formatCurrency(m.balance)}</p>
          <p className="text-xs text-ink-400 mt-1.5">{negative ? 'Faltou no mês' : 'Sobrou no mês'}</p>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, tone, hint }) {
  return (
    <div className="h-full card-flat p-5">
      <p className="text-[11px] uppercase font-semibold tracking-widest text-ink-500">{label}</p>
      <p className={`stat-number text-2xl xl:text-3xl mt-2 whitespace-nowrap ${tone}`}>{value}</p>
      <p className="text-xs text-ink-500 mt-1.5">{hint}</p>
    </div>
  );
}

function Operator({ children }) {
  return (
    <span className="w-9 h-9 rounded-full bg-ink-100 text-ink-500 font-display font-bold text-lg flex items-center justify-center" aria-hidden="true">
      {children}
    </span>
  );
}
