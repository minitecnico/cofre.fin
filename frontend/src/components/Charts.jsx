import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '../utils/format';

// Hex dos tokens do tailwind.config — o Recharts não lê classes.
const TRACK = '#f4f4f5'; // ink-100
const FALLBACK = '#a1a1aa'; // ink-400

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
    <div className="card-flat p-4 md:p-5">
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
