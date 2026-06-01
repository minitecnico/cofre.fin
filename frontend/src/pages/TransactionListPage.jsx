import { useState, useMemo } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Plus, Search, X, Filter } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTransactions } from '../hooks/useTransactions';
import TransactionList from '../components/TransactionList';
import Modal from '../components/Modal';
import TransactionForm from '../components/TransactionForm';
import BatchTransactionForm from '../components/BatchTransactionForm';
import MonthSelector from '../components/MonthSelector';
import { useDisclosure } from '../hooks/useDisclosure';
import { formatCurrency, parseLoanInfo } from '../utils/format';
import { useMonth } from '../context/MonthContext';

export default function TransactionListPage({ type = 'income' }) {
  const isIncome = type === 'income';
  const { label } = useMonth();
  const { isOpen, open, close } = useDisclosure();
  const [searchTerm, setSearchTerm] = useState('');
  const [mode, setMode] = useState('single'); // 'single' | 'batch'

  // Filtros via URL (deep linking) — vindos da página de Recorrências/Empréstimos:
  //   ?recurringId=UUID       → só transações geradas pelo modelo X
  //   ?installmentGroup=UUID  → só parcelas de uma compra/empréstimo X
  // Quando esses filtros estão ativos, ignoramos o filtro mensal — o usuário
  // quer ver o histórico COMPLETO daquele item, não só do mês corrente.
  const [searchParams, setSearchParams] = useSearchParams();
  const recurringId = searchParams.get('recurringId');
  const installmentGroup = searchParams.get('installmentGroup');
  const hasDeepFilter = !!(recurringId || installmentGroup);

  const { items, total, loading, refresh, remove, togglePaid } = useTransactions({
    type,
    limit: 200,
    ...(recurringId ? { recurringId } : {}),
    ...(installmentGroup ? { installmentGroupId: installmentGroup } : {}),
    // Quando filtra por recurring/installment, mostra histórico inteiro
    ...(hasDeepFilter ? { startDate: null, endDate: null } : {}),
  });

  function clearDeepFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('recurringId');
    next.delete('installmentGroup');
    setSearchParams(next, { replace: true });
  }

  // Busca client-side: descrição + categoria
  // Aplica busca + ORDENAÇÃO HIERÁRQUICA POR VENCIMENTO:
  //   1º Despesas pendentes (mais próximas de vencer no topo)
  //   2º Receitas (mais recentes 1º)
  //   3º Despesas pagas (mais recentes 1º — caem pro fundo)
  // Quando o usuário marca uma despesa como paga, ela MIGRA pro fundo
  // automaticamente (re-renderização instantânea).
  const filteredItems = useMemo(() => {
    let result = [...items];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter((t) => {
        const desc = (t.description || '').toLowerCase();
        const catName = (t.category?.name || '').toLowerCase();
        return desc.includes(q) || catName.includes(q);
      });
    }

    // Hierarquia: pendente=0 (sobe), receita=1, paga=2 (desce)
    result.sort((a, b) => {
      const aBucket = a.type === 'expense' ? (a.paid ? 2 : 0) : 1;
      const bBucket = b.type === 'expense' ? (b.paid ? 2 : 0) : 1;
      if (aBucket !== bBucket) return aBucket - bBucket;

      const aDate = new Date(a.date);
      const bDate = new Date(b.date);

      if (aBucket === 0) {
        // Pendentes: vencem primeiro = sobem (data crescente)
        return aDate - bDate;
      }
      // Receitas e pagas: mais recentes primeiro
      return bDate - aDate;
    });

    return result;
  }, [items, searchTerm]);

  const totalAmount = filteredItems.reduce((s, t) => s + Number(t.amount), 0);

  const pendingCount = !isIncome ? filteredItems.filter((t) => !t.paid).length : 0;
  const pendingTotal = !isIncome
    ? filteredItems.filter((t) => !t.paid).reduce((s, t) => s + Number(t.amount), 0)
    : 0;

  // Quando filtrando por installmentGroup (parcelas de um financiamento/empréstimo),
  // calculamos as métricas específicas: valor financiado, em aberto, juros e
  // valor real pago. Metadados vêm dos `notes` da 1ª parcela (gravados no LoanForm);
  // se não houver, faz fallback com base na soma das parcelas.
  const loanMetrics = useMemo(() => {
    if (!installmentGroup) return null;
    const info = items.map((t) => parseLoanInfo(t.notes)).find(Boolean);
    const somaTodas = items.reduce((s, t) => s + Number(t.amount), 0);
    const somaPagas = items
      .filter((t) => t.paid)
      .reduce((s, t) => s + Number(t.amount), 0);
    return {
      financiado: info?.financiado ?? somaTodas,
      juros: info?.juros ?? 0,
      taxa: info?.taxa ?? 0,
      parcelasEmAberto: items.filter((t) => !t.paid).reduce((s, t) => s + Number(t.amount), 0),
      countEmAberto: items.filter((t) => !t.paid).length,
      valorRealPago: somaPagas,
      countPagas: items.filter((t) => t.paid).length,
      totalParcelas: items.length,
    };
  }, [items, installmentGroup]);

  const Icon = isIncome ? ArrowUpCircle : ArrowDownCircle;
  const accentClass = isIncome ? 'text-positive' : 'text-negative';
  const bgAccent = isIncome ? 'bg-accent text-ink-900' : 'bg-ink-900 text-white';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Banner de filtro ativo (vindo de /recurring ou empréstimos) */}
      {hasDeepFilter && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-accent/15 border border-accent rounded-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <Filter className="w-4 h-4 text-ink-900 flex-shrink-0" strokeWidth={2.5} />
            <p className="text-sm text-ink-900 truncate">
              <strong>Filtro ativo:</strong>{' '}
              {recurringId
                ? 'transações de uma recorrência'
                : 'parcelas de um empréstimo / compra parcelada'}
              {' · histórico completo (todos os meses)'}
            </p>
          </div>
          <button
            onClick={clearDeepFilter}
            className="btn-pill-sm flex-shrink-0 bg-white hover:bg-ink-100"
          >
            <X className="w-3.5 h-3.5" /> Limpar
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">
            {isIncome ? 'Entradas' : 'Saídas'} · {label}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight flex items-center gap-2 md:gap-3">
            <Icon className={`w-7 h-7 md:w-10 md:h-10 ${accentClass} flex-shrink-0`} />
            <span className="truncate">{isIncome ? 'Receitas' : 'Despesas'}</span>
          </h1>
        </div>

        <button
          onClick={open}
          className={`w-full sm:w-auto px-4 md:px-5 py-2.5 md:py-3 min-h-[44px] font-semibold border-2 border-ink-900 shadow-flat-sm hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all ${bgAccent} self-stretch sm:self-end flex-shrink-0`}
        >
          <span className="flex items-center justify-center gap-2 text-sm md:text-base">
            <Plus className="w-5 h-5" />
            <span className="whitespace-nowrap">Nova {isIncome ? 'receita' : 'despesa'}</span>
          </span>
        </button>
      </div>

      {/* Seletor de mês — escondido quando há deep filter (histórico completo) */}
      {!hasDeepFilter && <MonthSelector />}

      {/* Resumo:
          - quando filtrando por installmentGroup (parcelas de financiamento):
            grid 2x2 (mobile) → 4 cards lado a lado (lg) com métricas do contrato
          - caso normal: cards atuais (Total gasto + Ainda a pagar) */}
      {installmentGroup && loanMetrics ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* 1 · Valor financiado */}
          <div className="feature-card p-4 md:p-5">
            <p className="text-[10px] md:text-xs uppercase font-semibold tracking-widest text-ink-500">
              Valor financiado
            </p>
            <p className="stat-number text-2xl md:text-3xl mt-2 break-all text-ink-900">
              {formatCurrency(loanMetrics.financiado)}
            </p>
            <p className="text-[11px] md:text-xs text-ink-500 mt-1.5">
              {loanMetrics.totalParcelas}x · contrato
            </p>
          </div>

          {/* 2 · Parcelas em aberto */}
          <div className="feature-card p-4 md:p-5">
            <p className="text-[10px] md:text-xs uppercase font-semibold tracking-widest text-ink-500">
              Parcelas em aberto
            </p>
            <p
              className={`stat-number text-2xl md:text-3xl mt-2 break-all ${
                loanMetrics.parcelasEmAberto > 0 ? 'text-negative' : 'text-positive'
              }`}
            >
              {formatCurrency(loanMetrics.parcelasEmAberto)}
            </p>
            <p className="text-[11px] md:text-xs text-ink-500 mt-1.5">
              {loanMetrics.countEmAberto === 0
                ? '✓ Tudo pago'
                : `${loanMetrics.countEmAberto} ${loanMetrics.countEmAberto === 1 ? 'parcela' : 'parcelas'}`}
            </p>
          </div>

          {/* 3 · Total de juros (global do contrato) */}
          <div className="feature-card p-4 md:p-5">
            <p className="text-[10px] md:text-xs uppercase font-semibold tracking-widest text-ink-500">
              Total de juros
            </p>
            <p
              className={`stat-number text-2xl md:text-3xl mt-2 break-all ${
                loanMetrics.juros > 0 ? 'text-negative' : 'text-ink-400'
              }`}
            >
              {loanMetrics.juros > 0 ? '+' : ''}{formatCurrency(loanMetrics.juros)}
            </p>
            <p className="text-[11px] md:text-xs text-ink-500 mt-1.5">
              {loanMetrics.taxa > 0
                ? `${(loanMetrics.taxa * 100).toFixed(2).replace('.', ',')}% a.m.`
                : 'Sem juros declarados'}
            </p>
          </div>

          {/* 4 · Valor real pago — destaque dark, é o "fato" do contrato */}
          <div className="rounded-2xl shadow-soft p-4 md:p-5 bg-ink-950 text-white border border-hairline-strong relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-accent/15 blur-2xl pointer-events-none" />
            <p className="relative text-[10px] md:text-xs uppercase font-semibold tracking-widest text-accent">
              Valor real pago
            </p>
            <p className="relative stat-number text-2xl md:text-3xl mt-2 break-all">
              {formatCurrency(loanMetrics.valorRealPago)}
            </p>
            <p className="relative text-[11px] md:text-xs opacity-70 mt-1.5">
              {loanMetrics.countPagas}/{loanMetrics.totalParcelas} pagas
              {loanMetrics.financiado > 0 && (
                <> · {((loanMetrics.valorRealPago / loanMetrics.financiado) * 100).toFixed(0)}% do financiado</>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-3 md:gap-5 grid-cols-1 ${
            isIncome ? '' : 'md:grid-cols-2'
          }`}
        >
          <div
            className={`rounded-2xl shadow-soft p-4 md:p-6 ${
              isIncome
                ? 'bg-accent text-ink-950 border border-accent-dark/30'
                : 'bg-ink-950 text-white border border-hairline-strong'
            }`}
          >
            <p
              className={`text-[10px] md:text-xs uppercase font-semibold tracking-widest ${
                isIncome ? 'text-ink-700' : 'text-ink-400'
              }`}
            >
              Total {isIncome ? 'recebido' : 'gasto'} no mês
              {searchTerm && <span className="ml-1 normal-case">· filtrado</span>}
            </p>
            <p className="stat-number text-3xl md:text-4xl mt-2 md:mt-3 break-all">
              {formatCurrency(totalAmount)}
            </p>
            <p className={`text-xs md:text-sm mt-2 ${isIncome ? 'text-ink-700' : 'text-ink-400'}`}>
              {filteredItems.length} {filteredItems.length === 1 ? 'transação' : 'transações'}
              {searchTerm && total !== filteredItems.length && (
                <span> de {total}</span>
              )}
            </p>
          </div>

          {!isIncome && (
            <div className="feature-card p-4 md:p-6">
              <p className="text-[10px] md:text-xs uppercase font-semibold tracking-widest text-ink-500">
                Ainda a pagar
              </p>
              <p
                className={`stat-number text-3xl md:text-4xl mt-2 md:mt-3 break-all ${
                  pendingTotal > 0 ? 'text-negative' : 'text-positive'
                }`}
              >
                {formatCurrency(pendingTotal)}
              </p>
              <p className="text-xs md:text-sm mt-2 text-ink-500">
                {pendingCount === 0
                  ? '✓ Tudo pago'
                  : `${pendingCount} ${pendingCount === 1 ? 'pendente' : 'pendentes'}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por descrição ou categoria…"
          className="input-field pl-10 pr-10"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center hover:bg-ink-100 transition-colors"
            aria-label="Limpar busca"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lista */}
      <TransactionList
        items={filteredItems}
        loading={loading}
        onChange={refresh}
        onDelete={remove}
        onTogglePaid={togglePaid}
        emptyMessage={
          searchTerm
            ? `Nenhuma ${isIncome ? 'receita' : 'despesa'} encontrada para "${searchTerm}".`
            : `Nenhuma ${isIncome ? 'receita' : 'despesa'} cadastrada em ${label}.`
        }
      />

      {/* Modal nova transação */}
      <Modal
        isOpen={isOpen}
        onClose={() => { close(); setMode('single'); }}
        title={
          mode === 'batch'
            ? `Lançamento em massa — ${isIncome ? 'Receitas' : 'Despesas'}`
            : `Nova ${isIncome ? 'receita' : 'despesa'}`
        }
        size={mode === 'batch' ? 'lg' : 'md'}
      >
        {mode === 'single' ? (
          <TransactionForm
            defaultType={type}
            onSaved={() => {
              close();
              setMode('single');
              refresh();
            }}
            onCancel={() => { close(); setMode('single'); }}
            onSwitchToBatch={() => setMode('batch')}
          />
        ) : (
          <BatchTransactionForm
            type={type}
            onSaved={() => {
              close();
              setMode('single');
              refresh();
            }}
            onCancel={() => { close(); setMode('single'); }}
          />
        )}
      </Modal>
    </div>
  );
}
