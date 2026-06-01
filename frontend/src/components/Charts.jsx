import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '../utils/format';

const monthLabel = (key) => {
  const [, m] = key.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return months[parseInt(m, 10) - 1];
};

export function MonthlyChart({ data = [] }) {
  if (data.length === 0) {
    return (
      <div className="card-flat p-6 md:p-8 text-center">
        <p className="text-ink-500 text-sm md:text-base">Sem dados suficientes para exibir o histórico mensal.</p>
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    monthLabel: monthLabel(d.month),
  }));

  return (
    <div className="card-flat p-4 md:p-5 h-full">
      <div className="mb-2 md:mb-3">
        <h3 className="font-display text-base md:text-lg font-bold tracking-tight">Últimos 6 meses</h3>
        <p className="text-[11px] md:text-xs text-ink-500">Receitas vs Despesas</p>
      </div>
      <ResponsiveContainer width="100%" height={160} className="md:!h-[200px]">
        <BarChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <XAxis
            dataKey="monthLabel"
            stroke="#161610"
            tick={{ fontSize: 11, fontWeight: 500 }}
            tickLine={false}
            axisLine={{ stroke: '#e4e4e0', strokeWidth: 1 }}
          />
          <YAxis
            stroke="#83836f"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#161610',
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontSize: 12,
              boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4)',
            }}
            formatter={(value, name) => [formatCurrency(value), name === 'income' ? 'Receitas' : 'Despesas']}
            labelStyle={{ color: '#c4f542', fontWeight: 600 }}
            cursor={{ fill: 'rgba(196, 245, 66, 0.1)' }}
          />
          <Bar dataKey="income" fill="#c4f542" radius={[5, 5, 0, 0]} maxBarSize={26} />
          <Bar dataKey="expense" fill="#161610" radius={[5, 5, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ data = [] }) {
  if (data.length === 0) {
    return (
      <div className="card-flat p-6 md:p-8 text-center">
        <p className="text-ink-500 text-sm md:text-base">Sem despesas no período.</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="card-flat p-4 md:p-5 h-full">
      <div className="mb-2 md:mb-3">
        <h3 className="font-display text-base md:text-lg font-bold tracking-tight">Gastos por categoria</h3>
        <p className="text-[11px] md:text-xs text-ink-500">Distribuição do mês atual</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 items-center">
        <ResponsiveContainer width="100%" height={150} className="md:!h-[180px]">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius={42}
              outerRadius={68}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color || '#64748b'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#161610',
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: 12,
                boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4)',
              }}
              formatter={(value) => formatCurrency(value)}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="space-y-1 md:space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
          {data.slice(0, 8).map((c) => {
            const pct = total > 0 ? (c.total / total) * 100 : 0;
            return (
              <div key={c.categoryId} className="flex items-center gap-2 text-xs">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <span className="flex-1 truncate text-ink-700">{c.name}</span>
                <span className="font-mono text-ink-900 font-semibold whitespace-nowrap text-[11px]">
                  {formatCurrency(c.total, { compact: true })}
                </span>
                <span className="text-[10px] text-ink-500 w-8 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
