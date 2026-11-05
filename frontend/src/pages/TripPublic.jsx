import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plane, Loader2, FileWarning, Users } from 'lucide-react';
import { tripService } from '../services/travel';
import { formatCurrency, formatDate, formatDateRange } from '../utils/format';
import { tripCategory } from '../constants';

/**
 * Página pública /viagem/:code — gastos de uma viagem compartilhada por link,
 * só leitura e sem login. O banco (resolve_trip_share) só devolve o que pode
 * aparecer: sem observações, orçamento, cartões nem ids.
 */
export default function TripPublic() {
  const { code } = useParams();
  const [data, setData] = useState(undefined); // undefined = carregando, null = link inválido
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    tripService.resolveShare(code).then(setData).catch(() => setFailed(true));
  }, [code]);

  const total = useMemo(() => (data?.expenses || []).reduce((sum, e) => sum + Number(e.amount), 0), [data]);
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const e of data?.expenses || []) {
      const cat = tripCategory(e.category);
      const cur = map.get(cat.value) || { ...cat, total: 0 };
      cur.total += Number(e.amount);
      map.set(cat.value, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [data]);

  if (failed || data === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center mb-4">
          <FileWarning className="w-7 h-7 text-ink-500" />
        </div>
        <p className="font-display font-bold text-xl">{failed ? 'Não foi possível abrir' : 'Link não encontrado'}</p>
        <p className="text-sm text-ink-500 mt-1 max-w-xs">
          {failed ? 'Confira sua internet e tente de novo.' : 'Este link não existe mais. Peça um novo a quem te enviou.'}
        </p>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app">
        <Loader2 className="w-8 h-8 animate-spin text-ink-500 mb-3" />
        <p className="text-ink-600 text-sm">Carregando…</p>
      </div>
    );
  }

  const dates = formatDateRange(data.start_date, data.end_date);

  return (
    <div className="min-h-screen bg-gradient-app">
      <header className="bg-gradient-dark text-white">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
            <Plane className="w-5 h-5 text-ink-900" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-base md:text-lg leading-tight">Gastos da viagem</p>
            <p className="text-xs text-ink-300">Compartilhado pelo Cofre · atualizado ao vivo</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-8 space-y-4">
        <section className="bg-white rounded-2xl shadow-soft p-5 space-y-4">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight tracking-tight break-words">{data.name}</h1>
            {data.destination && <p className="text-sm text-ink-600 mt-1">{data.destination}</p>}
            {dates && <p className="text-sm text-ink-500 mt-0.5 tabular-nums">{dates}</p>}
            {data.travelers.length > 1 && (
              <p className="text-xs text-ink-500 mt-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> {data.travelers.filter(Boolean).join(', ')}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">Custo da viagem</p>
            <p className="stat-number text-3xl md:text-4xl text-ink-900 mt-1">{formatCurrency(total)}</p>
          </div>
          {byCategory.length > 0 && (
            <ul className="space-y-2">
              {byCategory.map((c) => (
                <li key={c.value} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-ink-700 font-semibold">
                      <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.label}
                    </span>
                    <span className="tabular-nums text-ink-600">{formatCurrency(c.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(c.total / total) * 100}%`, background: c.color }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.expenses.length === 0 ? (
          <p className="bg-white rounded-2xl shadow-soft p-8 text-center text-sm text-ink-500">Nenhum gasto anotado ainda.</p>
        ) : (
          <ul className="bg-white rounded-2xl shadow-soft overflow-hidden divide-y divide-ink-100">
            {data.expenses.map((e, i) => {
              const cat = tripCategory(e.category);
              return (
                <li key={i} className="px-4 py-3 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900 truncate">{e.description}</p>
                    <p className="text-xs text-ink-500">
                      {formatDate(e.date, 'numeric')} · {cat.label}
                      {data.travelers.length > 1 && e.by && ` · por ${e.by}`}
                    </p>
                  </div>
                  <span className="stat-number text-sm text-ink-900 whitespace-nowrap">{formatCurrency(e.amount)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
