import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, LabelList } from 'recharts';
import { formatCurrency } from '../utils/format';

/**
 * Paleta dos gráficos — segue a MESMA semântica do resto do app:
 * receita = verde (positive), despesa = vermelho (negative).
 * Centralizada aqui pra não espalhar hex solto.
 */
const CHART = {
  income: '#10b981', // positive
  expense: '#ef4444', // negative
  axis: '#a1a1aa', // ink-400
  track: '#f4f4f5', // ink-100
  fallback: '#a1a1aa',
};

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const monthLabel = (key) => MONTHS[parseInt(key.split('-')[1], 10) - 1];

/* ─── Primitivos reutilizáveis ─────────────────────────────────────────── */

/**
 * Wrapper polimórfico de card de gráfico: cuida de header, legenda e
 * estado vazio. O conteúdo (children) é o gráfico em si. Evita duplicar
 * a casca entre MonthlyChart e CategoryChart.
 */
function ChartCard({ title, subtitle, legend, isEmpty, empty, children }) {
  if (isEmpty) {
    return (
      <div className="card-flat p-6 md:p-8 text-center">
        <p className="text-ink-500 text-sm md:text-base">{empty}</p>
      </div>
    );
  }
  return (
    <div className="card-flat p-4 md:p-5 h-full">
      <div className="flex items-start justify-between mb-3 md:mb-4 gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base md:text-lg font-bold tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] md:text-xs text-ink-500">{subtitle}</p>}
        </div>
        {legend && <div className="flex items-center gap-3 pt-1 flex-shrink-0">{legend}</div>}
      </div>
      {children}
    </div>
  );
}

/** Tooltip claro e suave (toque/hover) — complementa os rótulos fixos. */
function SoftTooltip({ active, payload, label, rows }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white shadow-soft-lg border border-ink-100 px-3 py-2">
      {label && <p className="text-[11px] font-semibold text-ink-900 mb-1">{label}</p>}
      {rows(payload).map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
          <span className="text-ink-500">{r.name}</span>
          <span className="ml-auto font-mono font-semibold text-ink-900">{formatCurrency(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

const LegendDot = ({ color, children }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
    {children}
  </span>
);

/** Rótulo de valor fixo no topo da barra — chave pro gráfico "ter valor" sem hover. */
const barValueLabel = (color) => (props) => {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 5} fill={color} fontSize={9} fontWeight={700} textAnchor="middle">
      {formatCurrency(value, { compact: true })}
    </text>
  );
};

/* ─── Gráficos ─────────────────────────────────────────────────────────── */

export function MonthlyChart({ data = [] }) {
  const formatted = data.map((d) => ({ ...d, monthLabel: monthLabel(d.month) }));

  return (
    <ChartCard
      title="Últimos 6 meses"
      isEmpty={data.length === 0}
      empty="Sem dados suficientes para exibir o histórico mensal."
      legend={
        <>
          <LegendDot color={CHART.income}>Receitas</LegendDot>
          <LegendDot color={CHART.expense}>Despesas</LegendDot>
        </>
      }
    >
      <ResponsiveContainer width="100%" height={180} className="md:!h-[220px]">
        <BarChart data={formatted} margin={{ top: 18, right: 0, left: 0, bottom: 0 }} barGap={3}>
          <XAxis
            dataKey="monthLabel"
            stroke={CHART.axis}
            tick={{ fontSize: 11, fontWeight: 500, fill: CHART.axis }}
            tickLine={false}
            axisLine={false}
            dy={4}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)', radius: 8 }}
            content={
              <SoftTooltip
                rows={(p) =>
                  p.map((x) => ({
                    color: x.dataKey === 'income' ? CHART.income : CHART.expense,
                    name: x.dataKey === 'income' ? 'Receitas' : 'Despesas',
                    value: x.value,
                  }))
                }
              />
            }
          />
          <Bar dataKey="income" fill={CHART.income} radius={[6, 6, 6, 6]} maxBarSize={22}>
            <LabelList dataKey="income" content={barValueLabel(CHART.income)} />
          </Bar>
          <Bar dataKey="expense" fill={CHART.expense} radius={[6, 6, 6, 6]} maxBarSize={22}>
            <LabelList dataKey="expense" content={barValueLabel(CHART.expense)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CategoryChart({ data = [] }) {
  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <ChartCard
      title="Gastos por categoria"
      subtitle="Distribuição do mês atual"
      isEmpty={data.length === 0}
      empty="Sem despesas no período."
    >
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
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color || CHART.fallback} />
                ))}
              </Pie>
              <Tooltip
                content={
                  <SoftTooltip
                    rows={(p) => p.map((x) => ({ color: x.payload.color || CHART.fallback, name: x.name, value: x.value }))}
                  />
                }
              />
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
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || CHART.fallback }} />
                  <span className="flex-1 truncate text-ink-700">{c.name}</span>
                  <span className="font-mono text-ink-900 font-semibold whitespace-nowrap text-[11px]">
                    {formatCurrency(c.total, { compact: true })}
                  </span>
                  <span className="text-[10px] text-ink-500 w-9 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
                </div>
                <div className="mt-1 ml-[18px] h-1 rounded-full overflow-hidden" style={{ backgroundColor: CHART.track }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color || CHART.fallback }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
}
