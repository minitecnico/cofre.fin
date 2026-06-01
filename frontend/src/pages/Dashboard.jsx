import { useState, useMemo, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, AlertCircle, Sparkles,
  Search, X, SlidersHorizontal, Clock, Check, CreditCard as CardIcon,
  Tag, Calendar as CalIcon,
} from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { dashboardService, categoryService, cardService } from '../services';
import StatCard from '../components/StatCard';
import { MonthlyChart, CategoryChart } from '../components/Charts';
import TransactionList from '../components/TransactionList';
import { useTransactions } from '../hooks/useTransactions';
import { formatCurrency, parseAmount } from '../utils/format';
import InstallBanner from '../components/InstallBanner';
import MonthSelector from '../components/MonthSelector';
import { useMonth } from '../context/MonthContext';

const PERIOD_OPTIONS = [
  { id: 'all', label: 'Todo o mês' },
  { id: 'today', label: 'Hoje' },
  { id: 'next7', label: 'Próx. 7 dias' },
  { id: 'next30', label: 'Próx. 30 dias' },
  { id: 'overdue', label: 'Vencidas' },
];

const STATUS_OPTIONS = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendentes', icon: Clock },
  { id: 'paid', label: 'Pagas', icon: Check },
];

/**
 * Helper: data de hoje sem hora (timezone local).
 */
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Parsear string YYYY-MM-DD como data local (sem timezone shift).
 */
function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function Dashboard() {
  const { data, loading, refresh } = useDashboard('month');
  const { items: rawItems, refresh: refreshList, remove: removeTx, togglePaid: togglePaidTx } = useTransactions({ limit: 200 });
  const { label: monthLabel } = useMonth();
  const [forecast, setForecast] = useState(null);
  const reduce = useReducedMotion();

  // Entrada suave em cascata para as seções principais do dashboard.
  // Cada filho aparece com leve fade + slide; respeita prefers-reduced-motion.
  const sectionVariants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 18 },
    show:   { opacity: 1, y: 0, transition: { type: 'spring', damping: 26, stiffness: 240 } },
  };

  // ─────────────────────────────────────────────────────────────────
  // Estados dos filtros
  // ─────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' ou category_id
  const [cardFilter, setCardFilter] = useState('all'); // 'all' | 'cash' | card_id
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Categorias e cartões (pra montar dropdowns) — buscamos uma vez
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    categoryService.list().then(setCategories).catch(() => setCategories([]));
    cardService.list().then((data) => setCards(data.map((d) => d.card))).catch(() => setCards([]));
  }, []);

  async function loadForecast() {
    const data = await dashboardService.forecast(3);
    setForecast(data);
  }

  function refreshAll() {
    refresh();
    refreshList();
    if (forecast) loadForecast();
  }

  // Categorias ordenadas por uso (mais usadas primeiro) na lista atual
  const categoriesByUsage = useMemo(() => {
    const counts = {};
    rawItems.forEach((t) => {
      const id = t.category?.id;
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    return [...categories].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  }, [rawItems, categories]);

  // ─────────────────────────────────────────────────────────────────
  // Aplicação dos filtros + ORDENAÇÃO HIERÁRQUICA POR VENCIMENTO
  // ─────────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let items = [...rawItems];

    // 1) Busca textual
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      items = items.filter((t) => {
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category?.name || '').toLowerCase();
        return desc.includes(q) || cat.includes(q);
      });
    }

    // 2) Status
    if (statusFilter === 'pending') {
      items = items.filter((t) => t.type === 'expense' && !t.paid);
    } else if (statusFilter === 'paid') {
      items = items.filter((t) => t.type === 'expense' && t.paid);
    }

    // 3) Período
    if (periodFilter !== 'all') {
      const t0 = today();
      items = items.filter((t) => {
        const d = parseLocalDate(t.date);
        if (!d) return false;
        const diff = Math.floor((d - t0) / (1000 * 60 * 60 * 24));

        switch (periodFilter) {
          case 'today':
            return diff === 0;
          case 'next7':
            return diff >= 0 && diff <= 7;
          case 'next30':
            return diff >= 0 && diff <= 30;
          case 'overdue':
            // Vencidas = despesa pendente com data passada
            return t.type === 'expense' && !t.paid && diff < 0;
          default:
            return true;
        }
      });
    }

    // 4) Categoria
    if (categoryFilter !== 'all') {
      items = items.filter((t) => t.category?.id === categoryFilter);
    }

    // 5) Cartão
    if (cardFilter !== 'all') {
      if (cardFilter === 'cash') {
        items = items.filter((t) => !t.credit_card_id);
      } else {
        items = items.filter((t) => t.credit_card_id === cardFilter);
      }
    }

    // 6) Faixa de valor
    const minV = parseAmount(minAmount);
    const maxV = parseAmount(maxAmount);
    if (minV > 0) items = items.filter((t) => Number(t.amount) >= minV);
    if (maxV > 0) items = items.filter((t) => Number(t.amount) <= maxV);

    // ─────────────────────────────────────────────────────
    // ORDENAÇÃO HIERÁRQUICA POR VENCIMENTO (o pedido principal)
    // 1º despesas pendentes (mais próximas de vencer no topo)
    // 2º receitas (mais recentes 1º)
    // 3º despesas pagas (mais recentes 1º — caem pro fundo)
    // ─────────────────────────────────────────────────────
    items.sort((a, b) => {
      const aBucket = a.type === 'expense'
        ? (a.paid ? 2 : 0) // pendente=0, paga=2
        : 1;               // receita=1
      const bBucket = b.type === 'expense'
        ? (b.paid ? 2 : 0)
        : 1;

      if (aBucket !== bBucket) return aBucket - bBucket;

      const aDate = new Date(a.date);
      const bDate = new Date(b.date);

      if (aBucket === 0) {
        // Pendentes: vencem primeiro = sobem
        return aDate - bDate;
      }
      // Receitas e pagas: mais recentes primeiro
      return bDate - aDate;
    });

    return items;
  }, [rawItems, searchTerm, statusFilter, periodFilter, categoryFilter, cardFilter, minAmount, maxAmount]);

  // Conta pendentes (pra badge)
  const pendingCount = useMemo(
    () => rawItems.filter((t) => t.type === 'expense' && !t.paid).length,
    [rawItems]
  );

  // Detecta filtros ativos (pra mostrar botão "Limpar")
  const hasActiveFilters =
    searchTerm.trim() ||
    statusFilter !== 'all' ||
    periodFilter !== 'all' ||
    categoryFilter !== 'all' ||
    cardFilter !== 'all' ||
    minAmount ||
    maxAmount;

  function clearAllFilters() {
    setSearchTerm('');
    setStatusFilter('all');
    setPeriodFilter('all');
    setCategoryFilter('all');
    setCardFilter('all');
    setMinAmount('');
    setMaxAmount('');
  }

  if (loading && !data) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="h-20 md:h-32 bg-ink-100 animate-pulse rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 md:h-40 bg-ink-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasAlerts = data.alerts.length > 0;

  // Cores inteligentes: o mês está "no vermelho" quando se gasta mais do que
  // se ganha. Saldo e Despesas reagem — atenção (vermelho) vs tranquilidade (verde).
  const income = data.periodSummary.income;
  const expense = data.periodSummary.expense;
  const overspending = expense > income;
  const balanceStatus = data.balance.balance < 0 ? 'danger' : 'safe';
  const expenseStatus = overspending ? 'danger' : 'safe';

  return (
    <div className="space-y-4 md:space-y-6">
      <div data-tour="month">
        <MonthSelector />
      </div>
      <InstallBanner />

      {/* Stat cards (cada card faz sua própria entrada com spring) */}
      <div data-tour="stats" className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-5">
        <StatCard
          label="Saldo do mês"
          sublabel={monthLabel}
          value={data.balance.balance}
          variant="balance"
          status={balanceStatus}
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
          status={expenseStatus}
          icon={TrendingDown}
          trend={data.comparison?.expenseChange}
        />
      </div>

      {/* Alertas — chips discretos */}
      {hasAlerts && (
        <div className="flex flex-wrap items-center gap-2">
          {data.alerts.map((a, i) => {
            const Icon = a.type === 'danger' ? AlertCircle : AlertTriangle;
            return (
              <div
                key={i}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  a.type === 'danger'
                    ? 'bg-red-50 text-negative border border-negative/30'
                    : 'bg-yellow-50 text-yellow-900 border border-warn/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{a.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Gráficos */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 items-stretch"
        variants={sectionVariants}
        initial="hidden"
        animate="show"
      >
        <MonthlyChart data={data.monthlyHistory} />
        <CategoryChart data={data.byCategory} />
      </motion.div>

      {/* Forecast */}
      <motion.div
        className="rounded-2xl shadow-soft-md bg-gradient-dark text-ink-50 p-4 md:p-5"
        variants={sectionVariants}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.08 }}
      >
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              <h3 className="font-display text-base md:text-lg font-bold tracking-tight">Saldo projetado</h3>
            </div>
            <p className="text-[11px] md:text-xs text-ink-300 mt-0.5">
              Média dos últimos 3 meses
            </p>
          </div>
          {!forecast && (
            <button onClick={loadForecast} className="btn-accent !min-h-[40px] !py-2 !px-4 text-sm self-center flex-shrink-0 whitespace-nowrap">
              Calcular
            </button>
          )}
        </div>

        {forecast && (
          <div className="grid grid-cols-3 gap-2 md:gap-3 mt-3">
            {forecast.forecast.map((f) => {
              const [, m] = f.month.split('-');
              const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
              return (
                <div key={f.month} className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-2.5 md:p-3">
                  <p className="text-[10px] uppercase tracking-widest text-accent font-bold">
                    {months[parseInt(m, 10) - 1]}
                  </p>
                  <p className={`font-display font-bold text-sm md:text-lg mt-1 break-all tabular-nums ${f.projected < 0 ? 'text-negative' : 'text-ink-50'}`}>
                    {formatCurrency(f.projected, { compact: true })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ────────────────────────────────────────────────────── */}
      {/*                    LISTA + FILTROS                       */}
      {/* ────────────────────────────────────────────────────── */}
      <div className="space-y-3 md:space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-xl md:text-2xl font-bold tracking-tight">
            Transações de {monthLabel}
            <span className="ml-2 text-sm font-mono font-medium text-ink-500">
              ({filteredItems.length}{filteredItems.length !== rawItems.length && ` de ${rawItems.length}`})
            </span>
          </h3>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-xs font-bold uppercase tracking-widest text-negative hover:text-red-700 underline underline-offset-4 decoration-2 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Chips de filtros ATIVOS — feedback visual instantâneo, com X pra remover */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 animate-fade-in">
            {searchTerm.trim() && (
              <ActiveFilterChip
                label={`"${searchTerm.trim()}"`}
                icon={Search}
                onRemove={() => setSearchTerm('')}
              />
            )}
            {statusFilter !== 'all' && (
              <ActiveFilterChip
                label={STATUS_OPTIONS.find((s) => s.id === statusFilter)?.label || statusFilter}
                icon={statusFilter === 'pending' ? Clock : Check}
                onRemove={() => setStatusFilter('all')}
              />
            )}
            {periodFilter !== 'all' && (
              <ActiveFilterChip
                label={PERIOD_OPTIONS.find((p) => p.id === periodFilter)?.label || periodFilter}
                icon={CalIcon}
                onRemove={() => setPeriodFilter('all')}
              />
            )}
            {categoryFilter !== 'all' && (
              <ActiveFilterChip
                label={categories.find((c) => c.id === categoryFilter)?.name || 'Categoria'}
                icon={Tag}
                onRemove={() => setCategoryFilter('all')}
              />
            )}
            {cardFilter !== 'all' && (
              <ActiveFilterChip
                label={
                  cardFilter === 'cash'
                    ? 'Conta / dinheiro'
                    : cards.find((c) => c.id === cardFilter)?.name || 'Cartão'
                }
                icon={CardIcon}
                onRemove={() => setCardFilter('all')}
              />
            )}
            {(minAmount || maxAmount) && (
              <ActiveFilterChip
                label={
                  minAmount && maxAmount
                    ? `R$ ${minAmount} – ${maxAmount}`
                    : minAmount
                      ? `≥ R$ ${minAmount}`
                      : `≤ R$ ${maxAmount}`
                }
                onRemove={() => { setMinAmount(''); setMaxAmount(''); }}
              />
            )}
          </div>
        )}

        {/* Bloco de filtros */}
        <div className="card-flat p-4 md:p-5 space-y-3">
          {/* Busca + chip de status sempre visíveis */}
          <div className="flex flex-col sm:flex-row gap-3">
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

            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[42px] rounded-xl font-semibold text-sm transition-all duration-200 ${
                showAdvanced
                  ? 'bg-gradient-dark text-white shadow-soft'
                  : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Filtros</span>
              {hasActiveFilters && !showAdvanced && (
                <span className="w-2 h-2 rounded-full bg-accent" />
              )}
            </button>
          </div>

          {/* Status — sempre visível (chips horizontais) */}
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_OPTIONS.map(({ id, label, icon: Icon }) => {
              const active = statusFilter === id;
              const showBadge = id === 'pending' && pendingCount > 0;
              return (
                <button
                  key={id}
                  onClick={() => setStatusFilter(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                    active
                      ? 'bg-gradient-dark text-white shadow-soft'
                      : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {label}
                  {showBadge && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      active ? 'bg-accent text-ink-900' : 'bg-negative text-white'
                    }`}>
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filtros avançados (expansível) */}
          {showAdvanced && (
            <div className="pt-3 border-t border-ink-100 space-y-4 animate-fade-in">
              {/* Período */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500 mb-2 flex items-center gap-1">
                  <CalIcon className="w-3 h-3" /> Período
                </p>
                <div className="flex flex-wrap gap-2">
                  {PERIOD_OPTIONS.map(({ id, label }) => {
                    const active = periodFilter === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setPeriodFilter(id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                          active
                            ? 'bg-gradient-dark text-white shadow-soft'
                            : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Categoria + Cartão lado a lado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-ink-500 mb-1.5 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Categoria
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="input-field !min-h-[40px] !py-2"
                  >
                    <option value="all">Todas as categorias</option>
                    {categoriesByUsage.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-ink-500 mb-1.5 flex items-center gap-1">
                    <CardIcon className="w-3 h-3" /> Forma de pagamento
                  </label>
                  <select
                    value={cardFilter}
                    onChange={(e) => setCardFilter(e.target.value)}
                    className="input-field !min-h-[40px] !py-2"
                  >
                    <option value="all">Todas</option>
                    <option value="cash">Conta / dinheiro</option>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>💳 {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Faixa de valor */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500 mb-1.5">
                  Faixa de valor
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-500 font-mono pointer-events-none">De R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      placeholder="0,00"
                      className="input-field !min-h-[40px] !py-2 pl-14 font-mono text-right"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-500 font-mono pointer-events-none">Até R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      placeholder="0,00"
                      className="input-field !min-h-[40px] !py-2 pl-14 font-mono text-right"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
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
            hasActiveFilters
              ? 'Nenhuma transação corresponde aos filtros aplicados.'
              : `Nenhuma transação em ${monthLabel}. Use o botão "+" para adicionar.`
          }
        />
      </div>
    </div>
  );
}

/**
 * Chip de filtro ativo: mostra o valor do filtro com botão X para remover.
 * Usado no topo da lista pra dar feedback visual instantâneo.
 */
function ActiveFilterChip({ label, icon: Icon, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-accent/30 text-ink-900 border border-ink-900/20 shadow-soft">
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />}
      <span className="max-w-[200px] truncate">{label}</span>
      <button
        onClick={onRemove}
        className="w-4 h-4 rounded-full bg-ink-900/15 hover:bg-ink-900 hover:text-white flex items-center justify-center flex-shrink-0 transition-all duration-200"
        aria-label="Remover filtro"
      >
        <X className="w-3 h-3" strokeWidth={3} />
      </button>
    </span>
  );
}
