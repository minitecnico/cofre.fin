import { useState } from 'react';
import {
  ResponsiveContainer, Tooltip, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts';
import { formatCurrency } from '../utils/format';
import { useMonthlySummary } from '../hooks/useMonthlySummary';

// Hex dos tokens do tailwind.config — o Recharts não lê classes.
const TRACK = '#f4f4f5'; // ink-100
const FALLBACK = '#a1a1aa'; // ink-400
const AXIS = '#a1a1aa'; // ink-400

/**
 * Mês a mês: ordem fixa e uma cor por série. Paleta validada (skill dataviz):
 * daltonismo ΔE 9,6 entre verde e vermelho e contraste ≥ 3:1 no card — por
 * isso o verde é o emerald-600, um passo mais escuro que o `positive`.
 */
const SERIES = [
  { key: 'income', label: 'Receitas', color: '#059669' },
  { key: 'expense', label: 'Despesas', color: '#ef4444' },
  { key: 'balance', label: 'Saldo', color: '#3b82f6' },
];
const PERIODS = [
  { months: 3, label: 'Trimestre' },
  { months: 6, label: 'Semestre' },
  { months: 12, label: 'Ano' },
];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PERIOD_KEY = 'cofre_grafico_periodo';

/** Tooltip claro e suave (toque/hover) — complementa os rótulos fixos. */
function SoftTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white shadow-soft-lg border border-ink-100 px-3 py-2">
      {payload.map((x, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: x.payload.color || FALLBACK }} />
          <span className="text-ink-500">{x.name}</span>
          <span className="ml-auto font-mono font-semibold text-ink-900">{formatCurrency(x.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut de gastos por categoria do mês + lista com valor, % e barra. */
export function CategoryChart({ data = [] }) {
  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="card-flat p-4 md:p-5 h-full">
      <div className="mb-3 md:mb-4">
        <h3 className="font-display text-base md:text-lg font-bold tracking-tight">Gastos por categoria</h3>
        <p className="text-[11px] md:text-xs text-ink-500">Distribuição do mês</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 items-center">
        {/* Donut fino com total no centro */}
        <div className="relative">
          <ResponsiveContainer width="100%" height={150} className="md:!h-[170px]">
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                nameKey="name"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color || FALLBACK} />
                ))}
              </Pie>
              <Tooltip content={<SoftTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] text-ink-500">Total</span>
            <span className="font-mono font-bold text-ink-900 text-sm md:text-base leading-tight">
              {formatCurrency(total, { compact: true })}
            </span>
          </div>
        </div>

        {/* Lista: nome, valor, % e barra de proporção */}
        <div className="space-y-1.5 md:space-y-2 max-h-[170px] overflow-y-auto pr-1">
          {data.slice(0, 8).map((c) => {
            const pct = total > 0 ? (c.total / total) * 100 : 0;
            return (
              <div key={c.categoryId} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || FALLBACK }} />
                  <span className="flex-1 truncate text-ink-700">{c.name}</span>
                  <span className="font-mono text-ink-900 font-semibold whitespace-nowrap text-[11px]">
                    {formatCurrency(c.total, { compact: true })}
                  </span>
                  <span className="text-[10px] text-ink-500 w-9 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
                </div>
                <div className="mt-1 ml-[18px] h-1 rounded-full overflow-hidden" style={{ backgroundColor: TRACK }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color || FALLBACK }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Receitas, despesas e saldo de cada mês (barras agrupadas, um eixo só),
 * terminando no mês selecionado. Trimestre / Semestre / Ano trocam quantos
 * meses entram; a escolha fica lembrada neste aparelho.
 */
export function MonthlyChart({ refreshKey }) {
  const [months, setMonths] = useState(() => {
    try { return Number(localStorage.getItem(PERIOD_KEY)) || 6; } catch { return 6; }
  });
  const { data, error } = useMonthlySummary(months, refreshKey);

  function choose(m) {
    setMonths(m);
    try { localStorage.setItem(PERIOD_KEY, String(m)); } catch { /* só não lembra */ }
  }

  const rows = (data || []).map((d) => ({ ...d, label: MONTHS[Number(d.month.slice(5, 7)) - 1] }));
  const totals = Object.fromEntries(SERIES.map((s) => [s.key, rows.reduce((acc, r) => acc + r[s.key], 0)]));

  return (
    <div className="card-flat p-4 md:p-5 h-full flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base md:text-lg font-bold tracking-tight">Mês a mês</h3>
          <p className="text-[11px] md:text-xs text-ink-500">Receitas, despesas e saldo</p>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-ink-100" role="group" aria-label="Período do gráfico">
          {PERIODS.map((p) => (
            <button
              key={p.months}
              onClick={() => choose(p.months)}
              aria-pressed={months === p.months}
              className={`px-3 min-h-[36px] rounded-lg text-xs font-bold transition-colors ${
                months === p.months ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legenda: nome + total do período — a identidade nunca fica só na cor */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 mb-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
            <b className="text-ink-900 tabular-nums">{data ? formatCurrency(totals[s.key], { compact: true }) : '—'}</b>
          </span>
        ))}
      </div>

      {error ? (
        <p className="flex-1 flex items-center justify-center text-sm text-ink-500 text-center py-10">
          Gráfico indisponível — falta rodar a migration_monthly_summary.sql.
        </p>
      ) : !data ? (
        <div className="h-[220px] bg-ink-100 animate-pulse rounded-xl" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap={months === 12 ? '16%' : '26%'}>
            <CartesianGrid vertical={false} stroke={TRACK} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tickFormatter={axisMoney} tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} width={56} />
            {rows.some((r) => r.balance < 0) && <ReferenceLine y={0} stroke={AXIS} />}
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<MonthTooltip />} />
            {/* Sem animação: ela recomeçava do zero a cada resize (girar o celular). */}
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function MonthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const month = payload[0].payload.month; // 'YYYY-MM'
  return (
    <div className="rounded-xl bg-white shadow-soft-lg border border-ink-100 px-3 py-2 min-w-[160px]">
      <p className="text-[11px] font-semibold text-ink-900 mb-1">
        {MONTHS_LONG[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
      </p>
      {payload.map((x) => (
        <div key={x.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: x.color }} />
          <span className="text-ink-500">{x.name}</span>
          <span className="ml-auto font-mono font-semibold text-ink-900">{formatCurrency(x.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Eixo curto: 'R$ 2,3 mil' a partir de mil, 'R$ 500' abaixo. Espaço não
 * separável: o Recharts quebra o rótulo do eixo em linhas nos espaços comuns.
 */
function axisMoney(v) {
  const text = Math.abs(v) >= 1000 ? formatCurrency(v, { compact: true }) : `R$ ${Math.round(v)}`;
  return text.replace(/ /g, ' ');
}
