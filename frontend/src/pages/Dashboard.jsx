import { useState, useMemo } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Search, X, Clock, Check, ReceiptText, ChevronRight,
} from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import StatCard from '../components/StatCard';
import { CategoryChart } from '../components/Charts';
import TransactionList from '../components/TransactionList';
import { useTransactions } from '../hooks/useTransactions';
import InstallBanner from '../components/InstallBanner';
import MonthSelector from '../components/MonthSelector';
import Modal from '../components/Modal';
import MonthSummary from '../components/MonthSummary';
import { useMonth } from '../context/MonthContext';

const STATUS_OPTIONS = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendentes', icon: Clock },
  { id: 'paid', label: 'Pagas', icon: Check },
];

export default function Dashboard() {
  const { data, loading, refresh } = useDashboard('month');
  const {
    items: rawItems, loading: itemsLoading, refresh: refreshList, remove: removeTx, togglePaid: togglePaidTx,
  } = useTransactions({ limit: 200 });
  const { label: monthLabel } = useMonth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [summaryOpen, setSummaryOpen] = useState(false);

  function refreshAll() {
    refresh();
    refreshList();
  }

  // Busca + status, e ordem por vencimento: despesas pendentes (as que vencem
  // antes no topo) → receitas → despesas pagas (mais recentes primeiro).
  const filteredItems = useMemo(() => {
    let items = [...rawItems];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      items = items.filter((t) =>
        (t.description || '').toLowerCase().includes(q)
        || (t.category?.name || '').toLowerCase().includes(q));
    }

    if (statusFilter === 'pending') items = items.filter((t) => t.type === 'expense' && !t.paid);
    else if (statusFilter === 'paid') items = items.filter((t) => t.type === 'expense' && t.paid);

    const bucket = (t) => (t.type === 'expense' ? (t.paid ? 2 : 0) : 1);
    items.sort((a, b) => {
      if (bucket(a) !== bucket(b)) return bucket(a) - bucket(b);
      return bucket(a) === 0 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });

    return items;
  }, [rawItems, searchTerm, statusFilter]);

  const pendingCount = useMemo(
    () => rawItems.filter((t) => t.type === 'expense' && !t.paid).length,
    [rawItems]
  );

  if (loading && !data) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="h-14 bg-ink-100 animate-pulse rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 md:h-40 bg-ink-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  // O mês fica "no vermelho" quando se gasta mais do que se ganha.
  const income = data.periodSummary.income;
  const expense = data.periodSummary.expense;
  const hasFilters = searchTerm.trim() || statusFilter !== 'all';

  return (
    <div className="space-y-4 md:space-y-6">
      <div data-tour="month">
        <MonthSelector />
      </div>
      <InstallBanner />

      <div data-tour="stats" className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-5">
        <StatCard
          label="Saldo do mês"
          sublabel={monthLabel}
          value={data.balance.balance}
          variant="balance"
          status={data.balance.balance < 0 ? 'danger' : 'safe'}
          icon={Wallet}
          trend={data.comparison?.balanceChange}
        />
        <StatCard
          label="Receitas"
          sublabel={monthLabel}
          value={income}
          variant="income"
          icon={TrendingUp}
          trend={data.comparison?.incomeChange}
        />
        <StatCard
          label="Despesas"
          sublabel={monthLabel}
          value={expense}
          variant="expense"
          status={expense > income ? 'danger' : 'safe'}
          icon={TrendingDown}
          trend={data.comparison?.expenseChange}
        />
      </div>

      {/* Resumo do mês pra mandar pra alguém */}
      <button
        onClick={() => setSummaryOpen(true)}
        className="w-full card-flat p-4 flex items-center gap-3 text-left hover:shadow-soft-md transition-shadow"
      >
        <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
          <ReceiptText className="w-5 h-5 text-ink-900" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-sm md:text-base text-ink-900">Resumo de {monthLabel}</span>
          <span className="block text-xs text-ink-500">Receitas, despesas, contas em aberto e saldo — pronto pra enviar</span>
        </span>
        <ChevronRight className="w-5 h-5 text-ink-400 flex-shrink-0" />
      </button>

      {data.byCategory.length > 0 && <CategoryChart data={data.byCategory} />}

      {/* Transações do mês */}
      <div className="space-y-3">
        <h3 className="font-display text-xl md:text-2xl font-bold tracking-tight">
          Transações
          <span className="ml-2 text-sm font-mono font-medium text-ink-500">
            ({filteredItems.length}{filteredItems.length !== rawItems.length && ` de ${rawItems.length}`})
          </span>
        </h3>

        <div className="card-flat p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar descrição ou categoria…"
              className="input-field !min-h-[42px] !py-2 pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 rounded-lg transition-colors"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {STATUS_OPTIONS.map(({ id, label, icon: Icon }) => {
              const active = statusFilter === id;
              return (
                <button
                  key={id}
                  onClick={() => setStatusFilter(id)}
                  className={`inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full text-xs font-bold transition-colors ${
                    active ? 'bg-gradient-dark text-white shadow-soft' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {label}
                  {id === 'pending' && pendingCount > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-accent text-ink-900' : 'bg-negative text-white'}`}>
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <TransactionList
          items={filteredItems}
          loading={false}
          onChange={refreshAll}
          onDelete={async (id) => {
            await removeTx(id);
            refresh();
          }}
          onTogglePaid={togglePaidTx}
          emptyMessage={
            hasFilters
              ? 'Nenhuma transação corresponde à busca.'
              : `Nenhuma transação em ${monthLabel}. Use o botão "+" para adicionar.`
          }
        />
      </div>

      <Modal isOpen={summaryOpen} onClose={() => setSummaryOpen(false)} title="Resumo do mês">
        <MonthSummary items={rawItems} loading={itemsLoading} monthLabel={monthLabel} />
      </Modal>
    </div>
  );
}
