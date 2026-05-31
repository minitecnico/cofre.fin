import { useEffect, useState, useMemo } from 'react';
import { Repeat, Plus, Pause, Play, Trash2, Pencil, ArrowUpCircle, ArrowDownCircle, CreditCard as CardIcon, Landmark, CheckSquare, X, Check, Search, Calendar, ListChecks, Filter } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { recurringService, categoryService, cardService, loanService, transactionService } from '../services';
import { formatCurrency, parseAmount } from '../utils/format';
import { calcularParcelaEmprestimo } from '../utils/financial';
import Modal from '../components/Modal';
import { useDisclosure } from '../hooks/useDisclosure';

/**
 * Página de gerenciamento de transações recorrentes.
 * --------------------------------------------------------------
 * Lista todas as recorrências (ativas e pausadas), permite:
 *   - Criar nova
 *   - Editar (não muda transações passadas)
 *   - Pausar/retomar
 *   - Excluir (transações já criadas viram avulsas)
 */

function RecurringForm({ initial, onSaved, onCancel }) {
  const isEdit = !!initial;
  const [type, setType] = useState(initial?.type || 'expense');
  const [amount, setAmount] = useState(initial?.amount?.toString().replace('.', ',') || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [dayOfMonth, setDayOfMonth] = useState(
    initial?.day_of_month || new Date().getDate()
  );
  // Duração em meses. Vazio = sem fim (recorrência indefinida).
  // Em edição, deriva da diferença entre start_month e end_month do modelo.
  const [durationMonths, setDurationMonths] = useState(() =>
    initial?.end_month ? String(monthsBetween(initial.start_month, initial.end_month)) : ''
  );
  const [categoryId, setCategoryId] = useState(initial?.category?.id || '');
  const [creditCardId, setCreditCardId] = useState(initial?.credit_card?.id || '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.credit_card ? 'card' : 'account');

  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Em modo edit: se marcado, propaga as mudanças para a transação JÁ gerada no
  // mês atual (caso exista). Comportamento default ("só meses futuros") é o do
  // CLAUDE.md; este checkbox é o opt-in.
  const [applyToCurrentMonth, setApplyToCurrentMonth] = useState(false);

  useEffect(() => {
    categoryService.list(type).then(setCategories).catch(() => setCategories([]));
  }, [type]);

  useEffect(() => {
    if (type === 'expense') {
      cardService.list().then(setCards).catch(() => setCards([]));
    }
  }, [type]);

  useEffect(() => {
    if (categories.length > 0 && !categories.find((c) => c.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        type,
        amount: parseAmount(amount),
        description: description.trim(),
        category_id: categoryId,
        credit_card_id: type === 'expense' && paymentMethod === 'card' ? creditCardId : null,
        day_of_month: parseInt(dayOfMonth, 10),
      };
      if (!payload.amount || payload.amount <= 0) throw new Error('Informe um valor válido');
      if (!payload.description) throw new Error('Informe uma descrição');
      if (!payload.category_id) throw new Error('Selecione uma categoria');
      if (payload.day_of_month < 1 || payload.day_of_month > 31) {
        throw new Error('Dia do mês deve ser entre 1 e 31');
      }

      // Duração: número de meses a gerar. Vazio/0 = indefinida (end_month null).
      const dur = parseInt(durationMonths, 10);

      if (isEdit) {
        // Mantém o mês de início original; recalcula o fim a partir dele.
        payload.end_month = dur && dur > 0 ? addMonthsISO(initial.start_month, dur - 1) : null;
        await recurringService.update(initial.id, payload);

        // Opcional: propaga as mudanças à transação JÁ gerada no mês atual
        if (applyToCurrentMonth) {
          const today = new Date();
          const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
          const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
          const monthEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          const { transactions: txs } = await transactionService.list({
            recurringId: initial.id,
            startDate: monthStart,
            endDate: monthEnd,
            limit: 50,
          });
          // Atualiza cada transação preservando a data original (só dados editáveis)
          await Promise.all(txs.map((tx) =>
            transactionService.update(tx.id, {
              type: payload.type,
              amount: payload.amount,
              description: payload.description,
              date: tx.date,
              category_id: payload.category_id,
              credit_card_id: payload.credit_card_id,
            })
          ));
        }
      } else {
        const today = new Date();
        const startMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
        payload.end_month = dur && dur > 0 ? addMonthsISO(startMonth, dur - 1) : null;
        await recurringService.create({ ...payload, start_month: startMonth, kind: 'recurring' });
      }
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Pré-visualização do mês final, conforme a duração escolhida.
  const durationEnd = (() => {
    const n = parseInt(durationMonths, 10);
    if (!n || n <= 0) return null;
    const start = isEdit
      ? initial.start_month
      : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const endISO = addMonthsISO(start, n - 1);
    const [ey, em] = endISO.split('-').map(Number);
    return new Date(ey, em - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  })();

  return (
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
      {!isEdit && (
        <div className="grid grid-cols-2 gap-1 p-1 bg-surface-soft rounded-full">
          <button
            type="button"
            onClick={() => setType('income')}
            className={`py-2.5 min-h-[44px] rounded-full font-semibold text-sm transition-all duration-200 ${
              type === 'income'
                ? 'bg-accent text-ink-950 shadow-soft'
                : 'bg-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            <ArrowUpCircle className="inline w-4 h-4 mr-1.5 -mt-0.5" strokeWidth={2.25} />
            Receita
          </button>
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`py-2.5 min-h-[44px] rounded-full font-semibold text-sm transition-all duration-200 ${
              type === 'expense'
                ? 'bg-ink-950 text-white shadow-soft'
                : 'bg-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            <ArrowDownCircle className="inline w-4 h-4 mr-1.5 -mt-0.5" strokeWidth={2.25} />
            Despesa
          </button>
        </div>
      )}

      <div>
        <label className="label">Valor</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-ink-500">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="input-field pl-12 text-xl md:text-2xl font-mono font-semibold"
            autoFocus
          />
        </div>
      </div>

      <div>
        <label className="label">Descrição</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={type === 'income' ? 'Ex: Salário' : 'Ex: Aluguel'}
          className="input-field"
          maxLength={100}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Dia do mês</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="input-field"
            required
          />
          <p className="text-[10px] text-ink-500 mt-1">
            Se o mês não tiver esse dia (ex: 31 em fev), usa o último dia do mês.
          </p>
        </div>
        <div>
          <label className="label">Duração</label>
          <div className="relative">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              placeholder="Sem fim"
              className="input-field pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 pointer-events-none">
              meses
            </span>
          </div>
          {/* Presets rápidos de duração comuns */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[3, 6, 12, 24].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDurationMonths(String(n))}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  parseInt(durationMonths, 10) === n
                    ? 'bg-ink-950 text-white'
                    : 'bg-surface-soft text-ink-600 hover:bg-ink-200'
                }`}
              >
                {n}m
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDurationMonths('')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                !durationMonths
                  ? 'bg-ink-950 text-white'
                  : 'bg-surface-soft text-ink-600 hover:bg-ink-200'
              }`}
            >
              Sem fim
            </button>
          </div>
          <p className="text-[10px] text-ink-500 mt-1.5">
            {durationEnd
              ? `Repete por ${parseInt(durationMonths, 10)} ${parseInt(durationMonths, 10) === 1 ? 'mês' : 'meses'} — até ${durationEnd}.`
              : 'Vazio = repete para sempre.'}
          </p>
        </div>
      </div>

      <div>
        <label className="label">Categoria</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="input-field"
        >
          {categories.length === 0 && <option value="">— Carregando —</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {type === 'expense' && (
        <div>
          <label className="label">Forma de pagamento</label>
          <div className="grid grid-cols-2 gap-1 p-1 bg-surface-soft rounded-full">
            <button
              type="button"
              onClick={() => setPaymentMethod('account')}
              className={`px-3 py-2.5 min-h-[44px] rounded-full text-sm font-semibold transition-all duration-200 ${
                paymentMethod === 'account'
                  ? 'bg-ink-950 text-white shadow-soft'
                  : 'bg-transparent text-ink-600 hover:text-ink-900'
              }`}
            >
              Conta / dinheiro
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`px-3 py-2.5 min-h-[44px] rounded-full text-sm font-semibold transition-all duration-200 ${
                paymentMethod === 'card'
                  ? 'bg-ink-950 text-white shadow-soft'
                  : 'bg-transparent text-ink-600 hover:text-ink-900'
              }`}
            >
              Cartão de crédito
            </button>
          </div>
          {paymentMethod === 'card' && (
            <select
              value={creditCardId}
              onChange={(e) => setCreditCardId(e.target.value)}
              className="input-field mt-3"
            >
              <option value="">Selecione um cartão</option>
              {cards.map(({ card }) => (
                <option key={card.id} value={card.id}>{card.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {isEdit && (
        <div className="px-4 py-3 bg-surface-soft border border-hairline-light rounded-xl space-y-2.5">
          <p className="text-xs text-ink-700 leading-relaxed">
            <strong className="text-ink-900">Heads up:</strong>{' '}
            por padrão, mudanças só afetam meses <strong>ainda não gerados</strong>.
            Histórico fica intacto.
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToCurrentMonth}
              onChange={(e) => setApplyToCurrentMonth(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-ink-950 cursor-pointer flex-shrink-0"
            />
            <span className="text-xs text-ink-700 leading-snug">
              Também aplicar à transação <strong>deste mês</strong> (se já foi gerada).
            </span>
          </label>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-negative/30 text-negative text-sm rounded-xl">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={submitting} className="btn-accent flex-1 disabled:opacity-60">
          {submitting ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar recorrência'}
        </button>
      </div>
    </form>
  );
}

export default function RecurringPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const { isOpen, open, close } = useDisclosure();

  // Aba ativa: 'recurring' | 'loan'
  // Deep linking via ?tab=... — permite marcar URL, voltar pelo histórico
  // do navegador e compartilhar links direto pra uma aba específica.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs = ['recurring', 'loan'];
  const activeTab = validTabs.includes(tabParam) ? tabParam : 'recurring';
  const setActiveTab = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'recurring') next.delete('tab'); // default não polui URL
    else next.set('tab', id);
    setSearchParams(next, { replace: false });
  };

  // Modal específico de empréstimo (atalho para criar despesa parcelada longa)
  const [loanModalOpen, setLoanModalOpen] = useState(false);

  // ─────────────────────────────────────────────────────────────────────
  // SELEÇÃO MÚLTIPLA — para agir em lote (excluir/pausar/retomar várias)
  // ─────────────────────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState(null);

  // Busca textual (descrição ou categoria)
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de confirmação de exclusão individual (substitui confirm() nativo)
  const [deletingItem, setDeletingItem] = useState(null);

  // Empréstimos vigentes (carregados sob demanda quando a aba é aberta)
  const [loans, setLoans] = useState([]);
  const [loansLoading, setLoansLoading] = useState(false);

  // Filtros (chips) — receita/despesa/com cartão
  // null = todos; valores possíveis: 'income' | 'expense' | 'card' | 'no-card'
  const [chipFilter, setChipFilter] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await recurringService.list();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  async function loadLoans() {
    setLoansLoading(true);
    try {
      const data = await loanService.list();
      setLoans(data);
    } catch {
      setLoans([]);
    } finally {
      setLoansLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Carrega empréstimos quando entra na aba loan
  useEffect(() => {
    if (activeTab === 'loan') loadLoans();
  }, [activeTab]);

  async function handleToggleActive(item) {
    await recurringService.toggleActive(item.id, !item.active);
    load();
  }

  async function confirmDelete() {
    if (!deletingItem) return;
    const item = deletingItem;
    setDeletingItem(null);
    try {
      await recurringService.remove(item.id);
      setBulkFeedback({
        type: 'success',
        text: `✓ "${item.description}" excluída.`,
      });
    } catch {
      setBulkFeedback({ type: 'error', text: 'Erro ao excluir. Tente novamente.' });
    }
    load();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Handlers de seleção múltipla
  // ─────────────────────────────────────────────────────────────────────

  function toggleSelection(itemId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function selectAll(itemList) {
    setSelectedIds(new Set(itemList.map((it) => it.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  // Auto-clear feedback após 4s
  useEffect(() => {
    if (!bulkFeedback) return;
    const t = setTimeout(() => setBulkFeedback(null), 4500);
    return () => clearTimeout(t);
  }, [bulkFeedback]);

  // Sai do modo seleção ao trocar de aba (UX consistente)
  useEffect(() => {
    if (selectionMode) exitSelectionMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function handleBulkDelete() {
    setConfirmingBulkDelete(false);
    setBulkProcessing(true);
    const ids = [...selectedIds];
    try {
      const count = await recurringService.removeMany(ids);
      setBulkFeedback({
        type: 'success',
        text: `✓ ${count} ${count === 1 ? 'excluída' : 'excluídas'} com sucesso.`,
      });
    } catch (err) {
      setBulkFeedback({
        type: 'error',
        text: `Erro ao excluir: ${err.message || 'tente novamente'}.`,
      });
    } finally {
      setBulkProcessing(false);
      exitSelectionMode();
      load();
    }
  }

  async function handleBulkToggleActive(active) {
    setBulkProcessing(true);
    const ids = [...selectedIds];
    try {
      const count = await recurringService.setActiveMany(ids, active);
      const verb = active ? (count === 1 ? 'retomada' : 'retomadas') : (count === 1 ? 'pausada' : 'pausadas');
      setBulkFeedback({
        type: 'success',
        text: `✓ ${count} ${verb} com sucesso.`,
      });
    } catch (err) {
      setBulkFeedback({
        type: 'error',
        text: `Erro ao ${active ? 'retomar' : 'pausar'}: ${err.message || 'tente novamente'}.`,
      });
    } finally {
      setBulkProcessing(false);
      exitSelectionMode();
      load();
    }
  }

  // Filtra itens conforme a aba ativa
  const itemsForTab = useMemo(() => {
    // Todos os modelos vivem na aba "Recorrências" (a aba Assinaturas foi removida;
    // modelos legados com kind 'subscription' aparecem aqui também). Empréstimos
    // não vivem nesta tabela — têm aba própria alimentada por loanService.
    if (activeTab === 'recurring') return items;
    return [];
  }, [items, activeTab]);

  // Aplica busca textual + chip de filtro sobre os itens da aba
  const filteredItems = useMemo(() => {
    let list = itemsForTab;

    // Filtro por chip
    if (chipFilter === 'income') list = list.filter((i) => i.type === 'income');
    else if (chipFilter === 'expense') list = list.filter((i) => i.type === 'expense');
    else if (chipFilter === 'card') list = list.filter((i) => !!i.credit_card_id);
    else if (chipFilter === 'no-card') list = list.filter((i) => !i.credit_card_id);

    // Busca textual
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => {
        const desc = (i.description || '').toLowerCase();
        const cat = (i.category?.name || '').toLowerCase();
        return desc.includes(q) || cat.includes(q);
      });
    }
    return list;
  }, [itemsForTab, searchQuery, chipFilter]);

  // Limpa busca e chip ao trocar de aba
  useEffect(() => { setSearchQuery(''); setChipFilter(null); }, [activeTab]);

  const activeItems = filteredItems.filter((i) => i.active);
  const pausedItems = filteredItems.filter((i) => !i.active);

  // Contadores para badges das abas
  const counts = useMemo(() => ({
    recurring: items.length,
    loan: loans.length,
  }), [items, loans]);

  // Totais mensais de receita e despesa para a aba "Recorrências"
  const recurringMonthlyIncome = useMemo(() => {
    return items
      .filter((i) => i.active && i.type === 'income')
      .reduce((s, i) => s + Number(i.amount), 0);
  }, [items]);

  const recurringMonthlyExpense = useMemo(() => {
    return items
      .filter((i) => i.active && i.type === 'expense')
      .reduce((s, i) => s + Number(i.amount), 0);
  }, [items]);

  // Total mensal automático = despesas recorrentes ativas — comprometimento real
  const automaticMonthlyOutflow = recurringMonthlyExpense;
  const automaticNetMonthly = recurringMonthlyIncome - automaticMonthlyOutflow;

  const tabConfig = TAB_CONFIG[activeTab];
  const TabIcon = tabConfig.icon;

  return (
    <div className="space-y-5 md:space-y-7">
      {/* Header editorial: kicker pequeno + headline display tight */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 md:gap-4">
        <div>
          <p className="text-[10px] md:text-xs uppercase tracking-[0.18em] text-ink-500 font-bold">
            Automação
          </p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mt-1.5 leading-[1] tracking-display-tight flex items-center gap-3">
            <span className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <Repeat className="w-5 h-5 md:w-6 md:h-6 text-ink-950" strokeWidth={2.5} />
            </span>
            <span>Recorrências</span>
          </h1>
        </div>
      </header>

      {/* Sub-nav em pills (estilo Revolut) */}
      <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
        {[
          { id: 'recurring', label: 'Recorrências', icon: Repeat, count: counts.recurring },
          { id: 'loan', label: 'Empréstimos', icon: Landmark, count: counts.loan },
        ].map(({ id, label, icon: Icon, count }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                active
                  ? 'bg-ink-950 text-white'
                  : 'bg-surface-soft text-ink-700 hover:bg-ink-200'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2.25} />
              <span>{label}</span>
              {count != null && count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                  active ? 'bg-accent text-ink-950' : 'bg-white text-ink-700'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Hero band da aba ativa — storytelling dark / accent / surface */}
      <section className={`rounded-3xl p-6 md:p-8 ${tabConfig.bannerBg} ${tabConfig.bannerText} overflow-hidden relative`}>
        {/* Detalhe decorativo accent (sutil, marca da identidade verde-limão) */}
        {activeTab === 'recurring' && (
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-accent/15 blur-2xl pointer-events-none" />
        )}
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${tabConfig.iconBg}`}>
              <TabIcon className={`w-6 h-6 md:w-7 md:h-7 ${tabConfig.iconColor}`} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-xl md:text-2xl font-bold leading-[1.1] tracking-display">
                {tabConfig.title}
              </p>
              <p className="text-sm md:text-base mt-2 opacity-80 leading-relaxed max-w-xl">
                {tabConfig.description}
              </p>
              {activeTab === 'recurring' && (recurringMonthlyIncome > 0 || automaticMonthlyOutflow > 0) && (
                <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold">Receita mensal</p>
                    <p className="font-display text-xl md:text-2xl font-bold tabular-nums text-accent">
                      + {formatCurrency(recurringMonthlyIncome)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold" title="Despesas recorrentes ativas">
                      Despesa autom.
                    </p>
                    <p className="font-display text-xl md:text-2xl font-bold tabular-nums opacity-90">
                      − {formatCurrency(automaticMonthlyOutflow)}
                    </p>
                  </div>
                  {recurringMonthlyIncome > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold">Líquido mensal</p>
                      <p
                        className={`font-display text-xl md:text-2xl font-bold tabular-nums ${
                          automaticNetMonthly >= 0 ? 'text-accent' : 'text-red-400'
                        }`}
                      >
                        {automaticNetMonthly >= 0 ? '+' : '−'} {formatCurrency(Math.abs(automaticNetMonthly))}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              if (activeTab === 'loan') {
                setLoanModalOpen(true);
              } else {
                setEditing(null);
                open();
              }
            }}
            className={`flex-shrink-0 self-start sm:self-end inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] rounded-full font-bold text-sm transition-all duration-200 active:scale-[0.98] ${tabConfig.buttonClass}`}
          >
            <Plus className="w-4 h-4" strokeWidth={2.75} />
            <span>{tabConfig.cta}</span>
          </button>
        </div>
      </section>

      {/* Conteúdo da aba */}
      {activeTab === 'loan' ? (
        <LoanTabContent
          loans={loans}
          loading={loansLoading}
          onCreate={() => setLoanModalOpen(true)}
        />
      ) : loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-ink-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : itemsForTab.length === 0 ? (
        <div className="feature-card p-10 md:p-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-soft flex items-center justify-center">
            <TabIcon className="w-7 h-7 text-ink-500" strokeWidth={1.75} />
          </div>
          <p className="font-display text-xl md:text-2xl font-bold mb-2 tracking-display">
            {tabConfig.emptyTitle}
          </p>
          <p className="text-sm text-ink-500 mb-6 max-w-md mx-auto leading-relaxed">
            {tabConfig.emptyDescription}
          </p>
          <button onClick={() => { setEditing(null); open(); }} className="btn-accent">
            <Plus className="w-5 h-5" /> {tabConfig.cta}
          </button>
        </div>
      ) : (
        <>
          {/* Toolbar: seleção múltipla + busca */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" strokeWidth={2.25} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome ou categoria…"
                className="w-full pl-11 pr-4 py-2.5 min-h-[44px] bg-surface-soft border border-transparent rounded-full text-sm focus:outline-none focus:bg-white focus:border-hairline-light focus:shadow-glow-accent transition-all duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full hover:bg-ink-200 flex items-center justify-center text-ink-500"
                  aria-label="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {!selectionMode ? (
              <button
                onClick={() => setSelectionMode(true)}
                className="btn-pill-sm flex-shrink-0"
              >
                <CheckSquare className="w-4 h-4" />
                Selecionar
              </button>
            ) : (
              // Responsivo:
              //  - Mobile: botões dividem 50/50 (flex-1), badge ocupa linha cheia
              //    centralizado (w-full + justify-center).
              //  - Desktop (sm+): nowrap, tamanhos naturais, badge ao lado.
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:flex-shrink-0">
                <button
                  onClick={exitSelectionMode}
                  className="btn-pill-sm flex-1 sm:flex-none justify-center whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Cancelar
                </button>
                <button
                  onClick={() => selectAll(filteredItems)}
                  className="btn-pill-sm flex-1 sm:flex-none justify-center bg-ink-950 text-white hover:bg-ink-800 whitespace-nowrap"
                >
                  Todas ({filteredItems.length})
                </button>
                {selectedIds.size > 0 && (
                  <div className="w-full sm:w-auto flex justify-center sm:justify-start">
                    <span className="badge-accent whitespace-nowrap">
                      {selectedIds.size} selecionada{selectedIds.size === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chips de filtro — fora do modo seleção */}
          {!selectionMode && (
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: null, label: 'Todos' },
                ...(activeTab === 'recurring' ? [
                  { id: 'income', label: 'Receitas' },
                  { id: 'expense', label: 'Despesas' },
                ] : []),
                { id: 'card', label: 'Com cartão' },
                { id: 'no-card', label: 'Sem cartão' },
              ].map(({ id, label }) => {
                const isActive = chipFilter === id;
                return (
                  <button
                    key={id ?? 'all'}
                    onClick={() => setChipFilter(id)}
                    className={`px-3 py-1.5 min-h-[32px] rounded-full text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-ink-950 text-white'
                        : 'bg-surface-soft text-ink-700 hover:bg-ink-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div className="feature-card p-10 text-center">
              <p className="text-sm text-ink-500">
                Nada encontrado para <strong className="text-ink-900">"{searchQuery}"</strong>.
              </p>
            </div>
          ) : (
            <>
              {activeItems.length > 0 && (
                <div>
                  <div className="flex items-baseline justify-between mb-3 md:mb-4">
                    <h3 className="font-display text-xl md:text-2xl font-bold tracking-display">
                      Ativas
                    </h3>
                    <span className="badge-tag">{activeItems.length}</span>
                  </div>
                  <div className="feature-card divide-y divide-hairline-light overflow-hidden">
                    {activeItems.map((item) => (
                      <RecurringRow
                        key={item.id}
                        item={item}
                        onEdit={(it) => { setEditing(it); open(); }}
                        onToggleActive={handleToggleActive}
                        onDelete={(it) => setDeletingItem(it)}
                        selectionMode={selectionMode}
                        selected={selectedIds.has(item.id)}
                        onToggleSelection={() => toggleSelection(item.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {pausedItems.length > 0 && (
                <div>
                  <div className="flex items-baseline justify-between mb-3 md:mb-4">
                    <h3 className="font-display text-xl md:text-2xl font-bold text-ink-500 tracking-display">
                      Pausadas
                    </h3>
                    <span className="badge-tag">{pausedItems.length}</span>
                  </div>
                  <div className={`feature-card divide-y divide-hairline-light overflow-hidden ${selectionMode ? '' : 'opacity-60'}`}>
                    {pausedItems.map((item) => (
                      <RecurringRow
                        key={item.id}
                        item={item}
                        onEdit={(it) => { setEditing(it); open(); }}
                        onToggleActive={handleToggleActive}
                        onDelete={(it) => setDeletingItem(it)}
                        selectionMode={selectionMode}
                        selected={selectedIds.has(item.id)}
                        onToggleSelection={() => toggleSelection(item.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Espaço extra no final pra não esconder atrás da barra flutuante:
              h-24 cobre tanto mobile (BulkActionBar em bottom-20) quanto desktop
              (agora em bottom-24, acima do FAB). */}
          {selectionMode && selectedIds.size > 0 && (
            <div className="h-24" aria-hidden="true" />
          )}
        </>
      )}

      {/* Feedback flutuante (toast) — pill com link opcional */}
      {bulkFeedback && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full shadow-soft-xl animate-fade-in bg-ink-950 text-white max-w-md mx-2">
          <div className="flex items-center gap-3 text-sm font-medium">
            <span>{bulkFeedback.text}</span>
            {bulkFeedback.link && (
              <Link
                to={bulkFeedback.link}
                onClick={() => setBulkFeedback(null)}
                className="px-3 py-1 rounded-full bg-accent text-ink-950 text-xs font-bold hover:bg-accent-light transition-colors"
              >
                {bulkFeedback.linkLabel || 'Ver'}
              </Link>
            )}
            <button
              onClick={() => setBulkFeedback(null)}
              className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-ink-400 hover:text-white"
              aria-label="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Barra de ações flutuante quando há itens selecionados */}
      {selectionMode && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          processing={bulkProcessing}
          onPause={() => handleBulkToggleActive(false)}
          onResume={() => handleBulkToggleActive(true)}
          onDelete={() => setConfirmingBulkDelete(true)}
        />
      )}

      {/* Modal: criar/editar recorrência */}
      <Modal
        isOpen={isOpen}
        onClose={close}
        title={editing ? 'Editar recorrência' : 'Nova recorrência'}
      >
        <RecurringForm
          initial={editing}
          onSaved={() => { close(); load(); }}
          onCancel={close}
        />
      </Modal>

      {/* Modal: empréstimo (atalho para despesa parcelada longa) */}
      <Modal
        isOpen={loanModalOpen}
        onClose={() => setLoanModalOpen(false)}
        title="Novo empréstimo / financiamento"
      >
        <LoanForm
          onSaved={({ groupId, count } = {}) => {
            setLoanModalOpen(false);
            loadLoans(); // recarrega lista de empréstimos vigentes
            setBulkFeedback({
              type: 'success',
              text: `✓ ${count} parcelas criadas`,
              link: groupId ? `/expenses?installmentGroup=${groupId}` : null,
              linkLabel: 'Ver parcelas',
            });
          }}
          onCancel={() => setLoanModalOpen(false)}
        />
      </Modal>

      {/* Modal: confirmar exclusão em lote */}
      <Modal
        isOpen={confirmingBulkDelete}
        onClose={() => setConfirmingBulkDelete(false)}
        title={`Excluir ${selectedIds.size} ${selectedIds.size === 1 ? 'item' : 'itens'}`}
      >
        <div className="space-y-5">
          <div className="px-4 py-4 bg-red-50 border border-negative/20 rounded-2xl space-y-2">
            <p className="text-sm text-ink-900">
              Tem certeza que deseja excluir <strong>{selectedIds.size}</strong>
              {' '}{selectedIds.size === 1 ? 'recorrência' : 'recorrências'}?
            </p>
            <p className="text-xs text-ink-700">
              ✓ <strong>Histórico preservado:</strong> as transações já criadas em meses anteriores continuam existindo (só perdem o vínculo com o modelo).
            </p>
            <p className="text-xs text-ink-700">
              ⚠ <strong>Não há como desfazer.</strong> Nenhuma transação nova será gerada nos próximos meses para esses itens.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button onClick={() => setConfirmingBulkDelete(false)} className="btn-ghost">
              Cancelar
            </button>
            <button onClick={handleBulkDelete} className="btn-danger-solid flex-1">
              Sim, excluir {selectedIds.size} {selectedIds.size === 1 ? 'item' : 'itens'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: confirmar exclusão individual */}
      <Modal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        title="Excluir recorrência"
      >
        <div className="space-y-5">
          <div className="px-4 py-4 bg-red-50 border border-negative/20 rounded-2xl space-y-2">
            <p className="text-sm text-ink-900">
              Excluir <strong>"{deletingItem?.description}"</strong>?
            </p>
            <p className="text-xs text-ink-700">
              ✓ As transações já criadas em meses anteriores serão preservadas
              (perdem o vínculo com o modelo, mas continuam existindo).
            </p>
            <p className="text-xs text-ink-700">
              ⚠ Nenhuma transação nova será gerada nos próximos meses.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button onClick={() => setDeletingItem(null)} className="btn-ghost">
              Cancelar
            </button>
            <button onClick={confirmDelete} className="btn-danger-solid flex-1">
              Sim, excluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Barra de ações flutuante (modo seleção)
// ─────────────────────────────────────────────────────────────────────────

function BulkActionBar({ count, processing, onPause, onResume, onDelete }) {
  // Posição:
  //  - Mobile: bottom-20 (acima da BottomNav)
  //  - Desktop: bottom-24 — acima do FAB (que fica em bottom 24px + h-16 = ~88px),
  //    pra evitar sobreposição com o botão "+" do Layout.
  return (
    <div className="fixed left-2 right-2 md:left-auto md:right-4 md:max-w-md bottom-20 md:bottom-24 z-40 animate-fade-in">
      <div className="rounded-3xl shadow-soft-xl bg-ink-950 text-white p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-accent text-ink-950 flex items-center justify-center font-display font-bold text-sm flex-shrink-0">
              {count}
            </div>
            <p className="font-semibold text-sm truncate">
              {count === 1 ? 'item selecionado' : 'itens selecionados'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onResume}
            disabled={processing}
            className="px-2 py-2.5 min-h-[44px] bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-full flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            <span>Retomar</span>
          </button>
          <button
            onClick={onPause}
            disabled={processing}
            className="px-2 py-2.5 min-h-[44px] bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-full flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Pause className="w-4 h-4" />
            <span>Pausar</span>
          </button>
          <button
            onClick={onDelete}
            disabled={processing}
            className="px-2 py-2.5 min-h-[44px] bg-negative hover:bg-red-600 text-white text-xs font-semibold rounded-full flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>Excluir</span>
          </button>
        </div>

        {processing && (
          <p className="text-[10px] text-center text-ink-400 mt-2">Processando…</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Configuração visual de cada aba
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Configuração visual de cada aba — aplica a linguagem do DESIGN.md:
// canvas dark p/ storytelling, accent verde-limão como "stamp" da marca,
// e variações de neutros pra hierarquia. Identidade de cores preservada.
// ─────────────────────────────────────────────────────────────────────────
const TAB_CONFIG = {
  recurring: {
    icon: Repeat,
    iconBg: 'bg-accent',
    iconColor: 'text-ink-950',
    bannerBg: 'bg-ink-950',
    bannerText: 'text-white',
    title: 'Recorrências mensais',
    description: 'Contas que se repetem todo mês — aluguel, conta de luz, salário. Geradas automaticamente no dia que você definir.',
    cta: 'Nova recorrência',
    buttonClass: 'bg-accent text-ink-950 hover:bg-accent-light',
    emptyTitle: 'Nenhuma recorrência',
    emptyDescription: 'Crie modelos para receitas e despesas que se repetem — salário, aluguel, etc.',
  },
  loan: {
    icon: Landmark,
    iconBg: 'bg-white/15 backdrop-blur',
    iconColor: 'text-white',
    bannerBg: 'bg-gradient-to-br from-ink-900 via-ink-800 to-ink-950',
    bannerText: 'text-white',
    title: 'Empréstimos e financiamentos',
    description: 'Compras parceladas em muitas vezes (36x, 60x, 120x...). Cria todas as parcelas de uma vez no calendário.',
    cta: 'Novo empréstimo',
    buttonClass: 'bg-accent text-ink-950 hover:bg-accent-light',
    emptyTitle: '',
    emptyDescription: '',
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Painel informativo da aba Empréstimos
// ─────────────────────────────────────────────────────────────────────────

function LoanTabContent({ loans, loading, onCreate }) {
  return (
    <div className="space-y-5">
      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-28 bg-ink-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : loans.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between mb-3 md:mb-4">
            <h3 className="font-display text-xl md:text-2xl font-bold tracking-display">
              Vigentes
            </h3>
            <span className="badge-tag">{loans.length}</span>
          </div>
          <div className="space-y-3">
            {loans.map((loan) => <LoanCard key={loan.groupId} loan={loan} />)}
          </div>
        </>
      ) : null}

      <LoanInfoPanel onCreate={onCreate} compact={loans.length > 0} />
    </div>
  );
}

function LoanCard({ loan }) {
  const monthsLeftYears = Math.round((loan.remainingCount / 12) * 10) / 10;
  return (
    <div className="feature-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-display text-base md:text-lg font-bold truncate">
            {loan.description}
          </p>
          <p className="text-xs text-ink-500 mt-1">
            {loan.category?.name && (
              <span className="font-semibold" style={{ color: loan.category.color || '#71717a' }}>
                {loan.category.name}
              </span>
            )}
            {loan.creditCard?.name && (
              <>
                {loan.category?.name && <span className="mx-1.5 text-ink-300">·</span>}
                <span className="font-semibold" style={{ color: loan.creditCard.color || '#71717a' }}>
                  {loan.creditCard.name}
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          to={`/expenses?installmentGroup=${loan.groupId}`}
          className="btn-pill-sm flex-shrink-0 whitespace-nowrap"
        >
          Ver parcelas
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-ink-500 font-semibold uppercase tracking-wider text-[10px]">Parcela</p>
          <p className="font-display text-base md:text-lg font-bold tabular-nums mt-0.5">
            {formatCurrency(loan.installmentValue)}
          </p>
        </div>
        <div>
          <p className="text-ink-500 font-semibold uppercase tracking-wider text-[10px]">Pagas</p>
          <p className="font-display text-base md:text-lg font-bold tabular-nums mt-0.5">
            {loan.paidCount}<span className="text-ink-400 font-normal">/{loan.installmentTotal}</span>
          </p>
        </div>
        <div>
          <p className="text-ink-500 font-semibold uppercase tracking-wider text-[10px]">Restam</p>
          <p className="font-display text-base md:text-lg font-bold tabular-nums mt-0.5">
            {formatCurrency(loan.unpaid)}
          </p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mt-4 w-full h-1.5 bg-surface-soft rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${loan.progressPercent}%` }}
        />
      </div>
      <p className="text-[10px] text-ink-500 mt-1.5">
        {loan.progressPercent}% concluído · ainda {loan.remainingCount} parcelas (~{monthsLeftYears} {monthsLeftYears < 2 ? 'ano' : 'anos'})
      </p>
    </div>
  );
}

function LoanInfoPanel({ onCreate, compact = false }) {
  const steps = [
    'Você cadastra uma despesa parcelada com a quantidade total de parcelas (36x, 48x, 60x, 72x, 84x, 96x, 120x, 180x ou 240x).',
    'O sistema cria todas as parcelas de uma vez, uma por mês, marcadas com badge 3/60.',
    'Cada mês você vê a parcela do mês como uma despesa normal. Marca como paga quando pagar — o limite do cartão volta automaticamente.',
    'Diferente das recorrências, empréstimos têm fim definido — terminam quando a última parcela é paga.',
  ];

  // Versão compacta quando já há empréstimos vigentes (não precisa do tutorial gigante)
  if (compact) {
    return (
      <button onClick={onCreate} className="btn-accent w-full min-h-[56px]">
        <Plus className="w-5 h-5" strokeWidth={2.5} />
        Cadastrar novo empréstimo
      </button>
    );
  }

  return (
    <div className="space-y-5">
      <div className="feature-card p-6 md:p-8">
        <h3 className="font-display text-xl md:text-2xl font-bold tracking-display mb-5">
          Como funciona um empréstimo no Cofre?
        </h3>
        <ol className="space-y-4">
          {steps.map((text, i) => (
            <li key={i} className="flex gap-4">
              <span className="w-7 h-7 rounded-full bg-accent text-ink-950 font-bold text-sm flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-sm md:text-base text-ink-700 leading-relaxed pt-0.5">{text}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 px-4 py-3 rounded-2xl bg-surface-soft border border-hairline-light">
          <p className="text-xs md:text-sm text-ink-700 leading-relaxed">
            <strong className="text-ink-900">Para empréstimos com juros:</strong>{' '}
            calcule o valor TOTAL que vai pagar (parcela × meses) e use isso como valor da despesa.
            Ex.: 60 parcelas de R$ 800 = empréstimo de R$ 48.000.
          </p>
        </div>
      </div>

      <button onClick={onCreate} className="btn-accent w-full min-h-[56px]">
        <Plus className="w-5 h-5" strokeWidth={2.5} />
        Cadastrar novo empréstimo
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Form específico de Empréstimo (atalho para createInstallments)
// ─────────────────────────────────────────────────────────────────────────

function LoanForm({ onSaved, onCancel }) {
  const [description, setDescription] = useState('');
  // Valor cheio do bem ANTES de qualquer desconto (preço de tabela)
  const [bemAmount, setBemAmount] = useState('');
  // Desconto negociado (ex: à vista) — opcional, default 0
  const [descontoAmount, setDescontoAmount] = useState('');
  const [installmentCount, setInstallmentCount] = useState(36);
  // Taxa mensal em % (string com vírgula brasileira). Vazio = sem juros.
  const [taxaMensal, setTaxaMensal] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState('');
  const [creditCardId, setCreditCardId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('account');

  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    categoryService.list('expense').then(setCategories).catch(() => setCategories([]));
    cardService.list().then(setCards).catch(() => setCards([]));
  }, []);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  // Preview inteligente — atualiza em tempo real conforme o usuário digita
  const bemNum = parseAmount(bemAmount);
  const descontoNum = parseAmount(descontoAmount);
  // Valor de fato financiado = bem - desconto (não pode ficar negativo)
  const financiadoNum = Math.max(0, bemNum - descontoNum);
  const taxaDecimal = (parseAmount(taxaMensal) || 0) / 100; // 1,5% → 0.015
  const installmentValue = useMemo(
    () => calcularParcelaEmprestimo(financiadoNum, installmentCount, taxaDecimal),
    [financiadoNum, installmentCount, taxaDecimal]
  );
  // Preço real pago = parcela × meses (com juros vira > valor financiado)
  const precoRealPago = installmentValue * installmentCount;
  // Total de juros = preço real pago - valor financiado
  const totalJuros = Math.max(0, precoRealPago - financiadoNum);
  const yearsApprox = Math.round((installmentCount / 12) * 10) / 10;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!description.trim()) throw new Error('Informe uma descrição (ex: Financiamento do carro)');
      if (!bemNum || bemNum <= 0) throw new Error('Informe o valor do bem');
      if (descontoNum > bemNum) throw new Error('Desconto não pode ser maior que o valor do bem');
      if (financiadoNum <= 0) throw new Error('O valor financiado precisa ser maior que zero');
      if (!categoryId) throw new Error('Selecione uma categoria');
      if (paymentMethod === 'card' && !creditCardId) throw new Error('Selecione um cartão');

      // Total a CADASTRAR = soma das parcelas (com juros, se houver). Isso
      // garante que o saldo do app reflita o quanto vai sair do bolso.
      const totalParaCadastrar = precoRealPago > 0 ? precoRealPago : financiadoNum;

      // Importa o transactionService aqui pra evitar dependência circular
      const { transactionService } = await import('../services');
      const result = await transactionService.createInstallments({
        type: 'expense',
        totalAmount: totalParaCadastrar,
        installmentCount: parseInt(installmentCount, 10),
        startDate,
        description: description.trim(),
        category_id: categoryId,
        credit_card_id: paymentMethod === 'card' ? creditCardId : null,
      });

      // Grava metadados do financiamento na PRIMEIRA parcela — usado pelo
      // TransactionListPage pra exibir os cards "Valor financiado / Juros / etc"
      // quando o usuário filtra por installmentGroup. Strip "R$ " do
      // formatCurrency pra ficar legível.
      const firstTxId = result.transactions?.[0]?.id;
      if (firstTxId) {
        const strip = (s) => s.replace(/R\$\s*/, '');
        const taxaStr = (taxaDecimal * 100).toFixed(2).replace('.', ',');
        const loanNote =
          `[Financiamento] Bem R$ ${strip(formatCurrency(bemNum))}` +
          ` · Desconto R$ ${strip(formatCurrency(descontoNum))}` +
          ` · Financiado R$ ${strip(formatCurrency(financiadoNum))}` +
          ` · Taxa ${taxaStr}% a.m.` +
          ` · Juros R$ ${strip(formatCurrency(totalJuros))}`;
        await transactionService.update(firstTxId, { notes: loanNote });
      }

      onSaved?.({ groupId: result.groupId, count: parseInt(installmentCount, 10) });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="px-4 py-3 bg-surface-soft border border-hairline-light rounded-2xl text-xs md:text-sm text-ink-700 leading-relaxed">
        <Landmark className="w-4 h-4 inline mr-1.5 -mt-0.5 text-ink-900" strokeWidth={2.25} />
        <strong className="text-ink-900">Empréstimo / financiamento.</strong>{' '}
        Vai criar {installmentCount} parcelas mensais a partir da data informada.
      </div>

      <div>
        <label className="label">Descrição</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex.: Financiamento Honda Civic"
          className="input-field"
          maxLength={120}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Total do bem</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={bemAmount}
              onChange={(e) => setBemAmount(e.target.value)}
              placeholder="60.000,00"
              className="input-field pl-11 font-mono"
            />
          </div>
          <p className="text-[11px] text-ink-500 mt-1.5">Preço de tabela (à vista, sem desconto).</p>
        </div>

        <div>
          <label className="label flex items-center gap-1.5">
            Desconto
            <span className="text-[10px] font-normal text-ink-400 normal-case tracking-normal">
              (opcional)
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={descontoAmount}
              onChange={(e) => setDescontoAmount(e.target.value)}
              placeholder="0,00"
              className="input-field pl-11 font-mono"
            />
          </div>
          <p className="text-[11px] text-ink-500 mt-1.5">Negociado com o vendedor / instituição.</p>
        </div>
      </div>

      <div>
        <label className="label">Total de parcelas</label>
        <select
          value={installmentCount}
          onChange={(e) => setInstallmentCount(parseInt(e.target.value, 10))}
          className="input-field"
        >
          {[36, 48, 60, 72, 84, 96, 120, 180, 240].map((n) => (
            <option key={n} value={n}>
              {n}x · {Math.round((n / 12) * 10) / 10} {n / 12 < 2 ? 'ano' : 'anos'}
            </option>
          ))}
        </select>
      </div>

      {/* Taxa de juros — opcional. Quando preenchida, recalcula tudo automaticamente
          (parcela via Tabela Price + total a pagar + juros totais). */}
      <div>
        <label className="label flex items-center gap-1.5">
          Taxa de juros mensal
          <span className="text-[10px] font-normal text-ink-400 normal-case tracking-normal">
            (opcional · deixe vazio se não tiver juros)
          </span>
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={taxaMensal}
            onChange={(e) => setTaxaMensal(e.target.value)}
            placeholder="Ex.: 1,5"
            className="input-field pr-20 font-mono text-right"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">% a.m.</span>
        </div>
        <p className="text-[11px] text-ink-500 mt-1.5 leading-snug">
          Cálculo pela <strong>Tabela Price</strong> (parcelas fixas). Típico: financiamento de
          veículo ~1,2–2% a.m., crédito consignado ~1,5–2,5% a.m., financiamento imobiliário
          ~0,7–1% a.m.
        </p>
      </div>

      {/* Card hero: parcela mensal — dark canvas com accent */}
      {installmentValue > 0 && (
        <div className="rounded-2xl bg-ink-950 text-white p-5 md:p-6 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-accent/20 blur-2xl pointer-events-none" />

          <p className="relative text-[10px] uppercase tracking-widest font-bold text-accent">
            Parcela mensal
            {taxaDecimal > 0 && (
              <span className="ml-2 opacity-80 normal-case">
                a {(taxaDecimal * 100).toFixed(2).replace('.', ',')}% a.m.
              </span>
            )}
          </p>
          <p className="relative font-display text-3xl md:text-5xl font-bold mt-2 tabular-nums tracking-display-tight">
            {formatCurrency(installmentValue)}
          </p>
          <p className="relative text-xs md:text-sm opacity-70 mt-2">
            {installmentCount}x · {yearsApprox} {yearsApprox < 2 ? 'ano' : 'anos'}
          </p>
        </div>
      )}

      {/* Grid 2x2 de cards informativos — atualizam em tempo real */}
      {bemNum > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {/* Total do bem */}
          <div className="feature-card p-4">
            <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">
              Total do bem
            </p>
            <p className="font-display text-lg md:text-xl font-bold tabular-nums mt-1 break-all">
              {formatCurrency(bemNum)}
            </p>
            <p className="text-[10px] text-ink-400 mt-0.5">Preço cheio (à vista)</p>
          </div>

          {/* Total de desconto */}
          <div className={`feature-card p-4 ${descontoNum > 0 ? 'border-accent/40 bg-accent/5' : ''}`}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">
              Desconto
            </p>
            <p
              className={`font-display text-lg md:text-xl font-bold tabular-nums mt-1 break-all ${
                descontoNum > 0 ? 'text-positive' : 'text-ink-400'
              }`}
            >
              {descontoNum > 0 ? '−' : ''}{formatCurrency(descontoNum)}
            </p>
            <p className="text-[10px] text-ink-400 mt-0.5">
              {descontoNum > 0 && bemNum > 0
                ? `${((descontoNum / bemNum) * 100).toFixed(1).replace('.', ',')}% de abatimento`
                : 'Sem desconto'}
            </p>
          </div>

          {/* Preço real pago — destaque dark, é o número-chave */}
          <div className="rounded-2xl bg-ink-950 text-white p-4 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-accent/15 blur-2xl pointer-events-none" />
            <p className="relative text-[10px] uppercase tracking-widest font-bold text-accent">
              Preço real pago
            </p>
            <p className="relative font-display text-lg md:text-xl font-bold tabular-nums mt-1 break-all">
              {formatCurrency(precoRealPago)}
            </p>
            <p className="relative text-[10px] opacity-70 mt-0.5">
              Soma das {installmentCount} parcelas
            </p>
          </div>

          {/* Total de juros */}
          <div className={`feature-card p-4 ${totalJuros > 0 ? 'border-negative/40 bg-red-50' : ''}`}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">
              Total de juros
            </p>
            <p
              className={`font-display text-lg md:text-xl font-bold tabular-nums mt-1 break-all ${
                totalJuros > 0 ? 'text-negative' : 'text-ink-400'
              }`}
            >
              {totalJuros > 0 ? '+' : ''}{formatCurrency(totalJuros)}
            </p>
            <p className="text-[10px] text-ink-400 mt-0.5">
              {totalJuros > 0 && financiadoNum > 0
                ? `${((totalJuros / financiadoNum) * 100).toFixed(1).replace('.', ',')}% sobre o financiado`
                : taxaDecimal === 0
                  ? 'Sem juros'
                  : '—'}
            </p>
          </div>
        </div>
      )}

      <div>
        <label className="label">Data da 1ª parcela</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="input-field"
        />
      </div>

      <div>
        <label className="label">Categoria</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="input-field"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Forma de pagamento</label>
        <div className="grid grid-cols-2 gap-1 p-1 bg-surface-soft rounded-full">
          <button
            type="button"
            onClick={() => { setPaymentMethod('account'); setCreditCardId(''); }}
            className={`px-3 py-2.5 min-h-[44px] rounded-full text-sm font-semibold transition-all duration-200 ${
              paymentMethod === 'account'
                ? 'bg-ink-950 text-white shadow-soft'
                : 'bg-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            Conta
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('card')}
            className={`px-3 py-2.5 min-h-[44px] rounded-full text-sm font-semibold transition-all duration-200 ${
              paymentMethod === 'card'
                ? 'bg-ink-950 text-white shadow-soft'
                : 'bg-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            Cartão
          </button>
        </div>
      </div>

      {paymentMethod === 'card' && (
        <div>
          <label className="label">Cartão</label>
          <select
            value={creditCardId}
            onChange={(e) => setCreditCardId(e.target.value)}
            className="input-field"
          >
            <option value="">Selecione um cartão</option>
            {cards.map(({ card }) => (
              <option key={card.id} value={card.id}>{card.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-negative/30 text-negative text-sm rounded-xl">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={submitting} className="btn-accent flex-1 disabled:opacity-60">
          {submitting ? 'Criando…' : `Criar ${installmentCount} parcelas`}
        </button>
      </div>
    </form>
  );
}

/**
 * Calcula a próxima data de ocorrência baseada no day_of_month.
 * Se hoje ainda não passou do dia neste mês, retorna data deste mês.
 * Caso contrário, retorna a do próximo mês (com fallback para último dia
 * em meses curtos — ex: dia 31 em fevereiro vira 28/29).
 */
function nextOccurrence(dayOfMonth) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const y = today.getFullYear();
  const m = today.getMonth();

  // Tenta este mês primeiro
  const lastDayThis = new Date(y, m + 1, 0).getDate();
  const dayThis = Math.min(dayOfMonth, lastDayThis);
  const candidateThis = new Date(y, m, dayThis);

  if (candidateThis >= today) return candidateThis;

  // Próximo mês
  const lastDayNext = new Date(y, m + 2, 0).getDate();
  const dayNext = Math.min(dayOfMonth, lastDayNext);
  return new Date(y, m + 1, dayNext);
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / (1000 * 60 * 60 * 24));
}

/**
 * Soma `n` meses a uma data ISO 'YYYY-MM-DD' (usamos o dia 01) e devolve
 * o primeiro dia do mês resultante como 'YYYY-MM-01'. Base p/ end_month.
 */
function addMonthsISO(startISO, n) {
  const [y, m] = startISO.slice(0, 7).split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/**
 * Quantidade de meses (inclusive) entre dois meses ISO. Inverso de addMonthsISO:
 * monthsBetween(start, addMonthsISO(start, n - 1)) === n.
 */
function monthsBetween(startISO, endISO) {
  const [sy, sm] = startISO.slice(0, 7).split('-').map(Number);
  const [ey, em] = endISO.slice(0, 7).split('-').map(Number);
  return (ey * 12 + (em - 1)) - (sy * 12 + (sm - 1)) + 1;
}

function RecurringRow({
  item, onEdit, onToggleActive, onDelete,
  selectionMode, selected, onToggleSelection,
}) {
  const isIncome = item.type === 'income';
  const cat = item.category || {};
  const card = item.credit_card;

  // Duração: se houver end_month, mostra quantos meses repete e até quando.
  const durationLabel = (() => {
    if (!item.end_month) return null;
    const n = monthsBetween(item.start_month, item.end_month);
    const [ey, em] = item.end_month.slice(0, 7).split('-').map(Number);
    const endTxt = new Date(ey, em - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    return { n, endTxt };
  })();

  // Próxima ocorrência (só pra modelos ativos)
  const nextDate = item.active ? nextOccurrence(item.day_of_month) : null;
  const daysLeft = nextDate ? daysUntil(nextDate) : null;
  const nextLabel = (() => {
    if (!nextDate) return null;
    if (daysLeft === 0) return 'hoje';
    if (daysLeft === 1) return 'amanhã';
    if (daysLeft <= 7) return `em ${daysLeft} dias`;
    return nextDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  })();
  const isImminent = daysLeft !== null && daysLeft <= 3;

  // Em modo seleção, click em qualquer parte da linha alterna a seleção
  function handleRowClick() {
    if (selectionMode) onToggleSelection();
  }

  return (
    <div
      className={`flex items-stretch transition-colors ${
        selected ? 'bg-accent/15' : 'hover:bg-surface-soft'
      } ${selectionMode ? 'cursor-pointer' : ''}`}
      onClick={handleRowClick}
    >
      {/* Faixa de cor da categoria — fino, hairline-style */}
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: cat.color || '#a1a1aa' }} />

      {/* Checkbox no modo seleção */}
      {selectionMode && (
        <div className="flex items-center justify-center pl-4 flex-shrink-0">
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
              selected
                ? 'bg-ink-950 border-ink-950'
                : 'bg-white border-ink-300'
            }`}
            aria-hidden="true"
          >
            {selected && <Check className="w-3 h-3 text-accent" strokeWidth={4} />}
          </div>
        </div>
      )}

      {/* Avatar circular da categoria — substitui o ícone setinha */}
      <div className="flex items-center pl-4 pr-3 md:pl-5 md:pr-4 flex-shrink-0">
        <div
          className="w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${cat.color || '#a1a1aa'}1f` }}
        >
          {isIncome ? (
            <ArrowUpCircle className="w-5 h-5 text-positive" strokeWidth={2.25} />
          ) : (
            <ArrowDownCircle className="w-5 h-5 text-ink-700" strokeWidth={2.25} />
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 py-3 md:py-4 pr-3 md:pr-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-ink-900 text-sm md:text-base truncate">
              {item.description}
            </h4>
            {!item.active && (
              <span className="badge-tag bg-ink-200 text-ink-700">Pausada</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-500 flex-wrap mt-1">
            {cat.name ? (
              <span className="font-semibold" style={{ color: cat.color || '#71717a' }}>{cat.name}</span>
            ) : (
              <span className="font-semibold italic text-ink-400">Sem categoria</span>
            )}
            <span className="text-ink-300">·</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" strokeWidth={2.25} />
              Todo dia {item.day_of_month}
            </span>
            {durationLabel && (
              <>
                <span className="text-ink-300">·</span>
                <span
                  className="inline-flex items-center gap-1 font-semibold text-ink-600"
                  title={`Repete por ${durationLabel.n} ${durationLabel.n === 1 ? 'mês' : 'meses'}`}
                >
                  <Repeat className="w-3 h-3" strokeWidth={2.25} />
                  {durationLabel.n}× · até {durationLabel.endTxt}
                </span>
              </>
            )}
            {nextLabel && (
              <>
                <span className="text-ink-300">·</span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    isImminent ? 'text-warn' : 'text-ink-600'
                  }`}
                  title={`Próxima: ${nextDate.toLocaleDateString('pt-BR')}`}
                >
                  próxima {nextLabel}
                </span>
              </>
            )}
            {card && (
              <>
                <span className="text-ink-300">·</span>
                <span className="inline-flex items-center gap-1">
                  <CardIcon className="w-3 h-3" strokeWidth={2.25} />
                  <span style={{ color: card.color || undefined }}>{card.name}</span>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4">
          <div className={`stat-number text-base md:text-lg font-bold whitespace-nowrap ${isIncome ? 'text-positive' : 'text-ink-900'}`}>
            {isIncome ? '+' : '−'} {formatCurrency(item.amount)}
          </div>

          {/* Ações individuais (escondidas no modo seleção) — todas em pill circular */}
          {!selectionMode && (
            <div className="flex items-center gap-1">
              <Link
                to={`${isIncome ? '/incomes' : '/expenses'}?recurringId=${item.id}`}
                onClick={(e) => e.stopPropagation()}
                className="w-9 h-9 flex items-center justify-center rounded-full text-ink-600 hover:text-ink-900 hover:bg-surface-soft transition-colors"
                aria-label="Ver transações geradas"
                title="Ver transações geradas por este modelo"
              >
                <ListChecks className="w-4 h-4" />
              </Link>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleActive(item); }}
                className="w-9 h-9 flex items-center justify-center rounded-full text-ink-600 hover:text-ink-900 hover:bg-surface-soft transition-colors"
                aria-label={item.active ? 'Pausar' : 'Retomar'}
                title={item.active ? 'Pausar (não gera mais)' : 'Retomar'}
              >
                {item.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                className="w-9 h-9 flex items-center justify-center rounded-full text-ink-600 hover:text-ink-900 hover:bg-surface-soft transition-colors"
                aria-label="Editar"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                className="w-9 h-9 flex items-center justify-center rounded-full text-negative hover:bg-red-50 transition-colors"
                aria-label="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
