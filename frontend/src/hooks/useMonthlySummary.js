import { useEffect, useState } from 'react';
import { dashboardService } from '../services';
import { useMonth } from '../context/MonthContext';

/**
 * Receita, despesa e saldo dos últimos `months` meses, terminando no mês
 * selecionado (MonthContext). `refreshKey` muda quando o dashboard recarrega
 * (ex.: lançamento novo) — aí o gráfico busca de novo.
 */
export function useMonthlySummary(months, refreshKey) {
  const { month } = useMonth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    dashboardService.monthly(month, months)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((err) => { if (alive) setError(err); });
    return () => { alive = false; };
  }, [month, months, refreshKey]);

  return { data, error };
}
