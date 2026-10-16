import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const MonthContext = createContext(null);

/**
 * Provider do mês selecionado.
 * --------------------------------------------------------------
 * Mantém em memória qual mês o usuário está visualizando ('YYYY-MM').
 * Default: mês atual.
 *
 * Persiste a escolha no localStorage para que ao recarregar a página
 * o usuário volte ao mês onde estava (boa UX).
 */

const STORAGE_KEY = 'cofre:selected-month';

function currentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function loadInitial() {
  // Sempre começa no mês atual ao abrir o app — mais previsível.
  // (Se quiser persistir entre sessões, basta trocar pra ler do localStorage.)
  return currentMonthString();
}

export function MonthProvider({ children }) {
  const [month, setMonthState] = useState(loadInitial);

  const setMonth = useCallback((newMonth) => {
    setMonthState(newMonth);
    try {
      localStorage.setItem(STORAGE_KEY, newMonth);
    } catch {
      /* storage indisponível — ignora */
    }
  }, []);

  const goToPrevious = useCallback(() => {
    const [y, m] = month.split('-').map(Number);
    const date = new Date(y, m - 2, 1); // m-2 porque getMonth é 0-indexed e queremos -1 mês
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }, [month, setMonth]);

  const goToNext = useCallback(() => {
    const [y, m] = month.split('-').map(Number);
    const date = new Date(y, m, 1); // m porque queremos +1 mês (já compensado)
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }, [month, setMonth]);

  const goToCurrent = useCallback(() => {
    setMonth(currentMonthString());
  }, [setMonth]);

  // Helpers derivados — calculados uma vez por mudança de mês
  const helpers = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number);
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];
    const startDate = `${month}-01`; // YYYY-MM-01
    // Último dia do mês
    const lastDay = new Date(year, monthNum, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    return {
      year,
      monthNumber: monthNum,
      label: `${monthNames[monthNum - 1]} ${year}`,
      shortLabel: `${monthNames[monthNum - 1].slice(0, 3)}/${year}`,
      startDate, // string YYYY-MM-DD para passar pra API
      endDate,
      isCurrentMonth: month === currentMonthString(),
    };
  }, [month]);

  const value = useMemo(
    () => ({
      month, // 'YYYY-MM'
      setMonth,
      goToPrevious,
      goToNext,
      goToCurrent,
      ...helpers,
    }),
    [month, setMonth, goToPrevious, goToNext, goToCurrent, helpers]
  );

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth() {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonth deve estar dentro de MonthProvider');
  return ctx;
}
