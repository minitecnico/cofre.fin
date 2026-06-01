import { useEffect, useState } from 'react';
import { CreditCard as CardIcon, Plus, Calendar, AlertTriangle, Trash2, Pencil, CheckCircle2, Wallet, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { cardService } from '../services';
import { formatCurrency, formatPercent, formatDate } from '../utils/format';
import Modal from '../components/Modal';
import { useDisclosure } from '../hooks/useDisclosure';

const BRAND_OPTIONS = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'elo', label: 'Elo' },
  { value: 'amex', label: 'American Express' },
  { value: 'hipercard', label: 'Hipercard' },
  { value: 'other', label: 'Outro' },
];

const PRESET_COLORS = ['#820ad1', '#ff7a00', '#1e293b', '#dc2626', '#16a34a', '#0ea5e9', '#f59e0b'];

function CardForm({ initial, onSaved, onCancel }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name || '',
    brand: initial?.brand || 'mastercard',
    lastDigits: initial?.last_digits || '',
    limit: initial?.card_limit || '',
    closingDay: initial?.closing_day || 25,
    dueDay: initial?.due_day || 5,
    color: initial?.color || PRESET_COLORS[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        limit: parseFloat(form.limit) || 0,
        closingDay: parseInt(form.closingDay, 10),
        dueDay: parseInt(form.dueDay, 10),
      };
      if (isEdit) await cardService.update(initial.id, payload);
      else await cardService.create(payload);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nome do cartão</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="input-field"
          placeholder="Ex: Nubank Roxinho"
          required
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Bandeira</label>
          <select
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            className="input-field"
          >
            {BRAND_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Últimos 4 dígitos</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={form.lastDigits}
            onChange={(e) => setForm({ ...form, lastDigits: e.target.value.replace(/\D/g, '') })}
            className="input-field font-mono"
            placeholder="1234"
          />
        </div>
      </div>

      <div>
        <label className="label">Limite total</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-ink-500">R$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={form.limit}
            onChange={(e) => setForm({ ...form, limit: e.target.value })}
            className="input-field pl-12"
            placeholder="5000.00"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fechamento</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={form.closingDay}
            onChange={(e) => setForm({ ...form, closingDay: e.target.value })}
            className="input-field"
            required
          />
        </div>
        <div>
          <label className="label">Vencimento</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={form.dueDay}
            onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
            className="input-field"
            required
          />
        </div>
      </div>

      <div>
        <label className="label">Cor</label>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={`w-11 h-11 rounded-xl transition-all duration-200 shadow-soft ${
                form.color === c ? 'ring-2 ring-ink-900 ring-offset-2 scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border-2 border-negative text-negative text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={submitting} className="btn-accent flex-1 disabled:opacity-60">
          {submitting ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Adicionar cartão'}
        </button>
      </div>
    </form>
  );
}

/**
 * CardItem — face minimalista do cartão.
 *
 * Mostra só o essencial: nome, número, fatura aberta em destaque, disponível
 * discreto e uma barra de uso fininha. O card inteiro é clicável e abre o
 * detalhe (faturas + compras + pagamento) num modal — sem rolar a página.
 * Editar/excluir ficam discretos no topo; param a propagação do clique.
 */
function CardItem({ summary, onEdit, onDelete, onOpen }) {
  const {
    card,
    available,
    openBill,
    cardLimit,
    utilizationPercent,
    unpaidCount,
    purchaseCount,
  } = summary;
  const isHighUsage = utilizationPercent > 80;
  const hasOpenBill = openBill > 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className="group relative w-full text-left rounded-2xl shadow-soft-md transition-all duration-300 cursor-pointer overflow-hidden hover:shadow-soft-lg hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/60"
    >
      {/* Fundo gradiente baseado na cor do cartão */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${card.color} 0%, ${card.color}dd 60%, ${card.color}99 100%)`,
        }}
      />
      {/* Brilho decorativo */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />

      {/* Conteúdo */}
      <div className="relative p-4 md:p-5 text-white">
        {/* Header: bandeira + nome + número | ações discretas */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest opacity-80 font-bold">
              {card.brand}
            </p>
            <h3 className="font-display text-lg md:text-xl font-bold mt-0.5 truncate tracking-tight">
              {card.name}
            </h3>
            <p className="font-mono text-[11px] tracking-[0.2em] opacity-70 mt-1">
              •••• {card.last_digits || '----'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onEdit(card); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onEdit(card); } }}
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-all duration-200 cursor-pointer"
              title="Editar cartão"
              aria-label="Editar cartão"
            >
              <Pencil className="w-3.5 h-3.5" />
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onDelete(summary); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onDelete(summary); } }}
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-negative backdrop-blur-sm flex items-center justify-center transition-all duration-200 cursor-pointer"
              title="Excluir cartão"
              aria-label="Excluir cartão"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Fatura aberta em destaque + disponível discreto */}
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest opacity-70 font-bold mb-0.5">
              {hasOpenBill ? 'Fatura aberta' : 'Fatura'}
            </p>
            {hasOpenBill ? (
              <p className="font-display font-bold text-2xl md:text-3xl break-all leading-none">
                {formatCurrency(openBill)}
              </p>
            ) : (
              <p className="font-display font-bold text-xl md:text-2xl leading-none inline-flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 flex-shrink-0" />
                {purchaseCount > 0 ? 'Zerada' : 'Sem compras'}
              </p>
            )}
            {hasOpenBill && unpaidCount > 0 && (
              <p className="text-[10px] opacity-70 mt-1">
                {unpaidCount} {unpaidCount === 1 ? 'compra pendente' : 'compras pendentes'}
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] uppercase tracking-widest opacity-70 font-bold mb-0.5">Disponível</p>
            <p className="font-display font-bold text-sm md:text-base break-all">
              {formatCurrency(available)}
            </p>
            <p className="text-[10px] opacity-60 mt-0.5">de {formatCurrency(cardLimit)}</p>
          </div>
        </div>

        {/* Barra de uso fininha + % + alerta discreto */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${isHighUsage ? 'bg-warn' : 'bg-accent'}`}
              style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
            />
          </div>
          <span className="font-mono text-[11px] font-bold opacity-80">{formatPercent(utilizationPercent)}</span>
          {isHighUsage && (
            <AlertTriangle className="w-3.5 h-3.5 text-warn flex-shrink-0" aria-label="Limite quase no topo" />
          )}
        </div>

        {/* Affordance: clique abre as faturas */}
        <div className="mt-3 flex items-center justify-end gap-1 text-[11px] font-bold opacity-70 group-hover:opacity-100 transition-opacity">
          <span>Ver faturas e compras</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </button>
  );
}

// Helper local: formata 'YYYY-MM-DD' → 'mai/2026' (curto)
function formatBillMonthShort(dateStr) {
  if (!dateStr) return '';
  const [y, m] = dateStr.slice(0, 10).split('-').map(Number);
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[m - 1]}/${y}`;
}

/**
 * CardBillsView — mostra as faturas do cartão com navegação ◀ ▶
 *
 * Lista faturas que têm transações (incluindo as futuras com parcelas pendentes).
 * Cada fatura mostra:
 *   - Status (paga ✓ / aberta / futura)
 *   - Total, fechamento, vencimento
 *   - Lista de transações daquela fatura
 *   - Botão "Pagar fatura" se ainda tiver compras pendentes
 */
function CardBillsView({ cardId, onPayBill, payingBillKey }) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBillMonth, setSelectedBillMonth] = useState(null);
  const [billTxs, setBillTxs] = useState([]);
  const [txsLoading, setTxsLoading] = useState(false);

  // Carrega lista de faturas
  useEffect(() => {
    let alive = true;
    setLoading(true);
    cardService.bills(cardId).then((data) => {
      if (!alive) return;
      setBills(data);
      // Seleciona automaticamente a fatura "atual" (a mais antiga não totalmente paga)
      if (data.length > 0) {
        const firstUnpaid = data.find((b) => !b.isFullyPaid);
        setSelectedBillMonth(firstUnpaid ? firstUnpaid.billMonth : data[data.length - 1].billMonth);
      } else {
        setSelectedBillMonth(null);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, [cardId]);

  // Carrega transações da fatura selecionada
  useEffect(() => {
    if (!selectedBillMonth) { setBillTxs([]); return; }
    setTxsLoading(true);
    cardService.billTransactions(cardId, selectedBillMonth)
      .then((data) => setBillTxs(data))
      .finally(() => setTxsLoading(false));
  }, [cardId, selectedBillMonth]);

  if (loading) return <div className="h-32 bg-ink-100 animate-pulse rounded-2xl" />;
  if (bills.length === 0) {
    return (
      <div className="card-flat p-6 md:p-8 text-center">
        <p className="text-ink-500 text-sm">Nenhuma compra registrada neste cartão.</p>
      </div>
    );
  }

  const selectedBill = bills.find((b) => b.billMonth === selectedBillMonth);
  const selectedIdx = bills.findIndex((b) => b.billMonth === selectedBillMonth);
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < bills.length - 1;

  function go(delta) {
    const newIdx = selectedIdx + delta;
    if (newIdx < 0 || newIdx >= bills.length) return;
    setSelectedBillMonth(bills[newIdx].billMonth);
  }

  return (
    <div className="space-y-3">
      {/* Carrossel de faturas (chips horizontais) */}
      <div className="card-flat p-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          {bills.map((b) => {
            const active = b.billMonth === selectedBillMonth;
            return (
              <BillChip
                key={b.billMonth}
                bill={b}
                active={active}
                onClick={() => setSelectedBillMonth(b.billMonth)}
              />
            );
          })}
        </div>
      </div>

      {/* Detalhes da fatura selecionada */}
      {selectedBill && (
        <BillDetail
          bill={selectedBill}
          transactions={billTxs}
          loading={txsLoading}
          canPrev={canPrev}
          canNext={canNext}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onPayBill={() => onPayBill(selectedBill)}
          isPaying={payingBillKey === `${cardId}::${selectedBill.billMonth}`}
        />
      )}
    </div>
  );
}

// Chip pequeno representando uma fatura (mês + status)
function BillChip({ bill, active, onClick }) {
  const monthLabel = formatBillMonth(bill.billMonth);
  let statusClass = 'bg-ink-100 text-ink-700 border-transparent';
  let icon = null;
  if (bill.isFullyPaid) {
    statusClass = 'bg-positive/15 text-positive border-positive/30';
    icon = <CheckCircle2 className="w-3 h-3" strokeWidth={3} />;
  } else if (bill.isClosed) {
    statusClass = 'bg-warn/20 text-yellow-900 border-warn/40';
    icon = <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />;
  } else {
    statusClass = 'bg-ink-100 text-ink-700 border-ink-200';
    icon = <Calendar className="w-3 h-3" strokeWidth={2.25} />;
  }

  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all duration-200 ${
        active
          ? 'bg-gradient-dark text-white border-ink-900 shadow-soft'
          : `${statusClass} hover:scale-105`
      }`}
    >
      {icon}
      <span>{monthLabel}</span>
      {bill.unpaidAmount > 0 && (
        <span className={active ? 'text-accent' : 'text-negative'}>
          · {formatCurrency(bill.unpaidAmount)}
        </span>
      )}
    </button>
  );
}

// Detalhe completo da fatura: header com totais + lista de compras
function BillDetail({ bill, transactions, loading, canPrev, canNext, onPrev, onNext, onPayBill, isPaying }) {
  const monthLabel = formatBillMonth(bill.billMonth);

  let statusBadge;
  if (bill.isFullyPaid) {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-positive text-white">
        <CheckCircle2 className="w-3 h-3" strokeWidth={3} /> Paga
      </span>
    );
  } else if (bill.isClosed) {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-warn text-ink-900">
        <AlertTriangle className="w-3 h-3" strokeWidth={2.5} /> Fechada
      </span>
    );
  } else {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-ink-200 text-ink-700">
        <Calendar className="w-3 h-3" strokeWidth={2.25} /> Aberta
      </span>
    );
  }

  return (
    <div className="card-flat p-4 md:p-5 space-y-4">
      {/* Header com navegação */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onPrev}
          disabled={!canPrev}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          aria-label="Fatura anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-ink-500 font-bold">Fatura</p>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <h3 className="font-display text-lg md:text-xl font-bold tracking-tight">
              {monthLabel}
            </h3>
            {statusBadge}
          </div>
        </div>

        <button
          onClick={onNext}
          disabled={!canNext}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          aria-label="Próxima fatura"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Resumo numérico */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="rounded-xl bg-ink-50 p-2.5">
          <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">Total</p>
          <p className="font-display font-bold text-base md:text-lg mt-0.5">
            {formatCurrency(bill.totalAmount)}
          </p>
        </div>
        <div className="rounded-xl bg-positive/10 p-2.5">
          <p className="text-[10px] uppercase tracking-widest font-bold text-positive">Pago</p>
          <p className="font-display font-bold text-base md:text-lg mt-0.5">
            {formatCurrency(bill.paidAmount)}
          </p>
        </div>
        <div className="rounded-xl bg-red-50 p-2.5 col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase tracking-widest font-bold text-negative">A pagar</p>
          <p className="font-display font-bold text-base md:text-lg mt-0.5">
            {formatCurrency(bill.unpaidAmount)}
          </p>
        </div>
      </div>

      {/* Datas */}
      <div className="flex items-center justify-between text-[11px] text-ink-500 font-medium">
        <span>📅 Fecha em {formatDate(bill.closesOn, 'long')}</span>
        <span>💰 Vence em {formatDate(bill.dueOn, 'long')}</span>
      </div>

      {/* Botão pagar (só se houver saldo) */}
      {bill.unpaidAmount > 0 && (
        <button
          onClick={onPayBill}
          disabled={isPaying}
          className="w-full px-4 py-3 min-h-[44px] bg-gradient-accent text-ink-900 font-bold rounded-xl shadow-soft hover:shadow-soft-md active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Wallet className="w-4 h-4" />
          {isPaying ? 'Pagando…' : `Pagar fatura (${formatCurrency(bill.unpaidAmount)})`}
        </button>
      )}

      {/* Lista de transações */}
      {loading ? (
        <div className="h-20 bg-ink-100 animate-pulse rounded-xl" />
      ) : transactions.length === 0 ? (
        <p className="text-center text-sm text-ink-500 py-4">Sem compras nesta fatura.</p>
      ) : (
        <div className="bg-white rounded-xl border border-ink-200 divide-y divide-ink-100 overflow-hidden">
          {transactions.map((t) => {
            const isPaid = !!t.paid;
            const isInstallment = t.installment_total > 1;
            return (
              <div key={t.id} className={`flex items-center justify-between gap-3 p-3 hover:bg-ink-50 transition-colors ${isPaid ? 'opacity-60' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium text-sm truncate ${isPaid ? 'line-through' : ''}`}>
                      {t.description}
                    </p>
                    {isInstallment && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-ink-100 text-ink-700 rounded">
                        {t.installment_number}/{t.installment_total}
                      </span>
                    )}
                    {isPaid && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-positive text-white rounded">
                        <CheckCircle2 className="w-3 h-3" strokeWidth={3} /> Pago
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5 truncate">
                    <span style={{ color: t.category_color }} className="font-medium">{t.category_name}</span>
                    {' · '}{formatDate(t.date, 'long')}
                  </p>
                </div>
                <p className={`font-mono font-bold whitespace-nowrap text-sm ${isPaid ? 'text-ink-500 line-through' : 'text-negative'}`}>
                  − {formatCurrency(t.amount)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Formata 'YYYY-MM-DD' → 'Maio 2026'
function formatBillMonth(dateStr) {
  if (!dateStr) return '';
  const [y, m] = dateStr.slice(0, 10).split('-').map(Number);
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[m - 1]} ${y}`;
}

export default function CardsPage() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [detailCardId, setDetailCardId] = useState(null); // cartão aberto no modal de faturas
  const [payingBillKey, setPayingBillKey] = useState(null); // `${cardId}::${billMonth}` em pagamento
  const [billsTick, setBillsTick] = useState(0); // força refetch das faturas no modal após pagar
  const [confirmingDelete, setConfirmingDelete] = useState(null); // { card, openBill }
  const [feedback, setFeedback] = useState(null); // { type, text }
  const { isOpen, open, close } = useDisclosure();

  const detailCard = detailCardId ? cards.find((c) => c.card.id === detailCardId) : null;

  async function load() {
    setLoading(true);
    try {
      const data = await cardService.list();
      setCards(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-clear do feedback após 4s
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(t);
  }, [feedback]);

  function requestDelete(cardSummary) {
    setConfirmingDelete({
      card: cardSummary.card,
      openBill: cardSummary.openBill,
      unpaidCount: cardSummary.unpaidCount,
    });
  }

  async function confirmDelete() {
    const id = confirmingDelete.card.id;
    setConfirmingDelete(null);
    try {
      const res = await cardService.remove(id);
      if (detailCardId === id) setDetailCardId(null);
      setFeedback({
        type: 'success',
        text: res?.hardDeleted
          ? 'Cartão excluído de vez (não tinha lançamentos).'
          : 'Cartão arquivado. Histórico de lançamentos preservado.',
      });
      load();
    } catch (err) {
      setFeedback({ type: 'error', text: 'Erro ao remover: ' + err.message });
    }
  }

  // Pagar uma fatura ESPECÍFICA a partir do modal de detalhe (CardBillsView).
  // Atualiza a lista de cartões (limite/fatura) e força o refetch das faturas
  // dentro do modal via billsTick, pra refletir o pagamento sem fechar.
  async function payBillFromView(cardId, cardName, bill) {
    setPayingBillKey(`${cardId}::${bill.billMonth}`);
    try {
      const count = await cardService.payBill(cardId, bill.billMonth);
      setFeedback({
        type: 'success',
        text: `✓ Fatura ${formatBillMonthShort(bill.billMonth)} do ${cardName} paga. ${count} ${count === 1 ? 'compra' : 'compras'} marcada${count === 1 ? '' : 's'}.`,
      });
      load();
      setBillsTick((t) => t + 1);
    } catch (err) {
      setFeedback({ type: 'error', text: 'Erro ao pagar fatura: ' + err.message });
    } finally {
      setPayingBillKey(null);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 md:gap-4">
        <div>
          <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">
            Pagamentos
          </p>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight">
            Cartões
          </h1>
        </div>

        <button onClick={() => { setEditing(null); open(); }} className="btn-accent self-start flex-shrink-0">
          <Plus className="w-5 h-5" /> Novo cartão
        </button>
      </div>

      {/* Feedback de ações (sucesso/erro) */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between gap-3 animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-accent/30 text-ink-900 border border-accent'
              : 'bg-red-50 text-negative border border-negative'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-70 hover:opacity-100 flex-shrink-0"
          >
            ok
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-60 bg-ink-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="card-flat p-8 md:p-12 text-center">
          <CardIcon className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 text-ink-300" />
          <p className="font-display text-lg md:text-xl font-bold mb-2">Nenhum cartão cadastrado</p>
          <p className="text-xs md:text-sm text-ink-500 mb-4">
            Cadastre seu primeiro cartão para acompanhar limite e fatura em tempo real.
          </p>
          <button onClick={() => { setEditing(null); open(); }} className="btn-accent">
            <Plus className="w-5 h-5" /> Adicionar cartão
          </button>
        </div>
      ) : (
        <>
          <div data-tour="cards" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {cards.map((summary) => (
              <CardItem
                key={summary.card.id}
                summary={summary}
                onEdit={(c) => { setEditing(c); open(); }}
                onDelete={requestDelete}
                onOpen={setDetailCardId}
              />
            ))}
          </div>
        </>
      )}

      {/* Modal: detalhe do cartão (faturas + compras + pagamento) */}
      <Modal
        isOpen={!!detailCardId}
        onClose={() => setDetailCardId(null)}
        title={detailCard?.card.name || 'Faturas'}
        size="lg"
      >
        {detailCard && (
          <div className="space-y-4">
            {/* Mini-resumo do cartão no topo do modal */}
            <div
              className="rounded-2xl p-4 text-white relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${detailCard.card.color} 0%, ${detailCard.card.color}cc 100%)` }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest opacity-80 font-bold">{detailCard.card.brand}</p>
                  <p className="font-mono text-xs tracking-[0.2em] opacity-80 mt-0.5">•••• {detailCard.card.last_digits || '----'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] uppercase tracking-widest opacity-70 font-bold">Disponível</p>
                  <p className="font-display font-bold text-lg">{formatCurrency(detailCard.available)}</p>
                  <p className="text-[10px] opacity-70">de {formatCurrency(detailCard.cardLimit)}</p>
                </div>
              </div>
            </div>

            <CardBillsView
              key={`${detailCardId}-${billsTick}`}
              cardId={detailCardId}
              payingBillKey={payingBillKey}
              onPayBill={(bill) => payBillFromView(detailCardId, detailCard.card.name, bill)}
            />
          </div>
        )}
      </Modal>

      {/* Modal: novo / editar cartão */}
      <Modal isOpen={isOpen} onClose={close} title={editing ? 'Editar cartão' : 'Novo cartão'}>
        <CardForm
          initial={editing}
          onSaved={() => { close(); load(); }}
          onCancel={close}
        />
      </Modal>

      {/* Modal: confirmar exclusão */}
      <Modal
        isOpen={!!confirmingDelete}
        onClose={() => setConfirmingDelete(null)}
        title="Excluir cartão"
      >
        {confirmingDelete && (
          <div className="space-y-4">
            <div className="px-4 py-3 bg-red-50 border border-negative rounded-xl">
              <p className="text-sm">
                Tem certeza que deseja excluir o cartão{' '}
                <strong className="font-bold">{confirmingDelete.card.name}</strong>?
              </p>
              {confirmingDelete.openBill > 0 && (
                <p className="text-xs text-ink-700 mt-2">
                  ⚠️ Há fatura aberta de <strong>{formatCurrency(confirmingDelete.openBill)}</strong> ({confirmingDelete.unpaidCount} {confirmingDelete.unpaidCount === 1 ? 'compra' : 'compras'} pendente{confirmingDelete.unpaidCount === 1 ? '' : 's'}).
                </p>
              )}
              <p className="text-xs text-ink-700 mt-2">
                ✓ <strong>Histórico preservado:</strong> as compras antigas continuam no app, só perdem o vínculo com o cartão.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={() => setConfirmingDelete(null)}
                className="btn-ghost"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-5 py-3 min-h-[44px] bg-negative text-white font-bold rounded-xl shadow-soft-md hover:shadow-soft-lg active:scale-[0.98] transition-all duration-200"
              >
                Excluir cartão
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
