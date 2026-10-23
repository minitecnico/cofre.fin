import { useEffect, useRef, useState } from 'react';
import { CreditCard as CardIcon, Plus, Calendar, AlertTriangle, Trash2, Pencil, CheckCircle2, Wallet, ChevronLeft, ChevronRight, Landmark } from 'lucide-react';
import { cardService } from '../services';
import { formatCurrency, formatDate } from '../utils/format';
import Modal from '../components/Modal';
import Select from '../components/Select';
import BankLogo from '../components/BankLogo';
import { useDisclosure } from '../hooks/useDisclosure';
import { CARD_BRANDS, CARD_PRESET_COLORS } from '../constants';
import { BANKS, findBank } from '../constants/banks';

const BANK_OPTIONS = [
  { value: '', label: 'Outro / não listado', icon: <Landmark className="w-[22px] h-[22px] p-0.5 text-ink-300 flex-shrink-0" /> },
  ...BANKS.map((b) => ({ value: b.id, label: b.name, icon: <BankLogo bankId={b.id} size={22} /> })),
];

function CardForm({ initial, onSaved, onCancel }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name || '',
    brand: initial?.brand || 'mastercard',
    lastDigits: initial?.last_digits || '',
    limit: initial?.card_limit || '',
    closingDay: initial?.closing_day || 25,
    dueDay: initial?.due_day || 5,
    color: initial?.color || CARD_PRESET_COLORS[0],
  });
  const [bankId, setBankId] = useState(() => findBank(initial?.name)?.id || '');

  // Escolher o banco já preenche o nome (se vazio ou ainda for o nome de outro
  // banco) e a cor da marca — o usuário só ajusta se quiser.
  function pickBank(id) {
    const bank = BANKS.find((b) => b.id === id);
    setBankId(id);
    if (!bank) return;
    setForm((f) => ({
      ...f,
      name: !f.name.trim() || findBank(f.name) ? bank.name : f.name,
      color: bank.color,
    }));
  }
  const colors = CARD_PRESET_COLORS.includes(form.color) ? CARD_PRESET_COLORS : [...CARD_PRESET_COLORS, form.color];
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
      <Select label="Banco emissor" icon={Landmark} value={bankId} onChange={pickBank} options={BANK_OPTIONS} placeholder="Escolha o banco" />

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
        <Select label="Bandeira" value={form.brand} onChange={(brand) => setForm({ ...form, brand })} options={CARD_BRANDS} />
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
          {colors.map((c) => (
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
        <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">
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
 * CardRow — uma linha da lista de cartões.
 *
 * Fatura atual à direita; embaixo, o limite livre. A linha inteira abre o
 * detalhe (faturas, pagar, editar, excluir).
 *
 * Mobile: [logo | nome | fatura] e o limite na linha de baixo.
 * Desktop: tudo numa linha só, com o limite em coluna própria.
 */
function CardRow({ summary, onOpen }) {
  const { card, openBill, purchaseCount, available, cardLimit, utilizationPercent } = summary;
  const isHighUsage = utilizationPercent > 80;

  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className="w-full text-left grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1fr)_9rem_minmax(0,15rem)_auto] items-center gap-x-3 md:gap-x-5 gap-y-2 px-4 py-3 hover:bg-ink-50 focus:outline-none focus-visible:bg-ink-50 transition-colors"
    >
      <BankLogo
        name={card.name}
        size={40}
        fallback={
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: card.color }}>
            <CardIcon className="w-5 h-5 text-white" />
          </span>
        }
      />

      <div className="min-w-0">
        <p className="font-semibold text-sm md:text-base text-ink-900 truncate">{card.name}</p>
        <p className="text-xs text-ink-500 truncate">
          {card.last_digits && <span className="hidden sm:inline">•••• {card.last_digits} · </span>}
          Fecha dia {card.closing_day} · vence dia {card.due_day}
        </p>
      </div>

      <div className="text-right">
        {openBill > 0 ? (
          <>
            <p className="font-display font-bold text-sm md:text-base text-ink-900 whitespace-nowrap">{formatCurrency(openBill)}</p>
            <p className="text-[11px] text-ink-500">fatura atual</p>
          </>
        ) : purchaseCount > 0 ? (
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-positive whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5" /> Fatura paga
          </p>
        ) : (
          <p className="text-xs text-ink-400 whitespace-nowrap">Sem compras</p>
        )}
      </div>

      {cardLimit > 0 ? (
        <div className="col-start-2 col-span-2 md:col-start-auto md:col-span-1 min-w-0">
          <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isHighUsage ? 'bg-warn' : 'bg-accent-dark'}`}
              style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-ink-500 mt-1 truncate">
            Livre <span className="font-semibold text-ink-900">{formatCurrency(available)}</span> de {formatCurrency(cardLimit)}
          </p>
        </div>
      ) : (
        <span className="hidden md:block" />
      )}

      <ChevronRight className="hidden md:block w-4 h-4 text-ink-400" />
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
 * CardBillsView — faturas do cartão, separadas em "Em aberto" e "Pagas".
 *
 * Fatura paga não pede ação: por padrão só aparecem as em aberto (inclusive
 * fechadas sem pagar e futuras). As pagas ficam na outra aba, pra consulta.
 * A faixa de meses só aparece quando a aba tem mais de uma fatura; ◀ ▶ do
 * detalhe navegam dentro da aba.
 */
function CardBillsView({ cardId, onPayBill, payingBillKey }) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open'); // 'open' | 'paid'
  const [selectedBillMonth, setSelectedBillMonth] = useState(null);
  const [billTxs, setBillTxs] = useState([]);
  const [txsLoading, setTxsLoading] = useState(false);
  const chipsRef = useRef(null);

  const openBills = bills.filter((b) => !b.isFullyPaid);
  const paidBills = bills.filter((b) => b.isFullyPaid);
  const list = tab === 'open' ? openBills : paidBills;

  // Troca de aba já escolhendo a fatura: em aberto → a mais antiga (próxima a
  // pagar); pagas → a mais recente.
  function pickTab(next, source = bills) {
    const items = source.filter((b) => (next === 'open' ? !b.isFullyPaid : b.isFullyPaid));
    setTab(next);
    setSelectedBillMonth(items.length ? items[next === 'open' ? 0 : items.length - 1].billMonth : null);
  }

  // Carrega lista de faturas
  useEffect(() => {
    let alive = true;
    setLoading(true);
    cardService.bills(cardId).then((data) => {
      if (!alive) return;
      setBills(data);
      pickTab('open', data);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  // Carrega transações da fatura selecionada
  useEffect(() => {
    if (!selectedBillMonth) { setBillTxs([]); return; }
    setTxsLoading(true);
    cardService.billTransactions(cardId, selectedBillMonth)
      .then((data) => setBillTxs(data))
      .finally(() => setTxsLoading(false));
  }, [cardId, selectedBillMonth]);

  // Mantém o mês escolhido visível na faixa (◀ ▶ podem levá-lo pra fora).
  // scrollLeft em vez de scrollIntoView pra não rolar o modal junto.
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector('[aria-pressed="true"]');
    if (chip) row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
  }, [selectedBillMonth, tab]);

  if (loading) return <div className="h-32 bg-ink-100 animate-pulse rounded-2xl" />;
  if (bills.length === 0) {
    return (
      <div className="card-flat p-6 md:p-8 text-center">
        <p className="text-ink-500 text-sm">Nenhuma compra registrada neste cartão.</p>
      </div>
    );
  }

  const selectedIdx = list.findIndex((b) => b.billMonth === selectedBillMonth);
  const selectedBill = list[selectedIdx];

  function go(delta) {
    const next = list[selectedIdx + delta];
    if (next) setSelectedBillMonth(next.billMonth);
  }

  return (
    <div className="space-y-3">
      {/* Abas: só faz sentido quando existe alguma paga pra esconder */}
      {paidBills.length > 0 && (
        <div className="grid grid-cols-2 gap-1 p-1 bg-ink-100 rounded-xl">
          {[['open', 'Em aberto', openBills.length], ['paid', 'Pagas', paidBills.length]].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => pickTab(key)}
              aria-pressed={tab === key}
              className={`flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg text-sm font-bold transition-colors ${
                tab === key ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {label}
              <span className="text-xs font-semibold text-ink-400">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Faixa de meses da aba (só com 2+ faturas) */}
      {list.length > 1 && (
        <div ref={chipsRef} className="relative flex items-center gap-2 overflow-x-auto py-1" style={{ scrollbarWidth: 'thin' }}>
          {list.map((b) => (
            <BillChip
              key={b.billMonth}
              bill={b}
              active={b.billMonth === selectedBillMonth}
              onClick={() => setSelectedBillMonth(b.billMonth)}
            />
          ))}
        </div>
      )}

      {selectedBill ? (
        <BillDetail
          bill={selectedBill}
          transactions={billTxs}
          loading={txsLoading}
          canPrev={selectedIdx > 0}
          canNext={selectedIdx < list.length - 1}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onPayBill={() => onPayBill(selectedBill)}
          isPaying={payingBillKey === `${cardId}::${selectedBill.billMonth}`}
        />
      ) : (
        <div className="card-flat p-6 md:p-8 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-positive" />
          <p className="font-display font-bold">Nenhuma fatura em aberto</p>
          <p className="text-xs text-ink-500 mt-1">As faturas já pagas ficam na aba Pagas.</p>
        </div>
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold uppercase tracking-wider border transition-all duration-200 ${
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
  const single = !canPrev && !canNext; // fatura única na aba: setas somem, título segue centralizado
  const boxes = bill.paidAmount > 0 && bill.unpaidAmount > 0
    ? [['Total', bill.totalAmount, 'bg-ink-50', 'text-ink-500'], ['Pago', bill.paidAmount, 'bg-positive/10', 'text-positive'], ['A pagar', bill.unpaidAmount, 'bg-red-50', 'text-negative']]
    : bill.unpaidAmount > 0
      ? [['A pagar', bill.unpaidAmount, 'bg-red-50', 'text-negative']]
      : [['Total pago', bill.paidAmount, 'bg-positive/10', 'text-positive']];
  const monthLabel = formatBillMonth(bill.billMonth);

  let statusBadge;
  if (bill.isFullyPaid) {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-positive text-white">
        <CheckCircle2 className="w-3 h-3" strokeWidth={3} /> Paga
      </span>
    );
  } else if (bill.isClosed) {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-warn text-ink-900">
        <AlertTriangle className="w-3 h-3" strokeWidth={2.5} /> Fechada
      </span>
    );
  } else {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-ink-200 text-ink-700">
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
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all ${single ? 'invisible' : ''}`}
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
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all ${single ? 'invisible' : ''}`}
          aria-label="Próxima fatura"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Resumo numérico: as três caixas só quando está paga em parte. Senão
          uma só — "Pago R$ 0,00" ou "A pagar R$ 0,00" não dizem nada. */}
      <div className={`grid gap-2 ${boxes.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
        {boxes.map(([label, value, bg, tone], i) => (
          <div key={label} className={`rounded-xl p-2.5 ${bg} ${i === 2 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <p className={`text-[10px] uppercase tracking-widest font-bold ${tone}`}>{label}</p>
            <p className="font-display font-bold text-base md:text-lg mt-0.5">{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {/* Datas */}
      <p className="text-xs text-ink-500 font-medium text-center">
        Fecha {formatDate(bill.closesOn)} · Vence {formatDate(bill.dueOn)}
      </p>

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
                      <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-ink-100 text-ink-700 rounded-full">
                        {t.installment_number}/{t.installment_total}
                      </span>
                    )}
                    {isPaid && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-positive text-white rounded-full">
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
        <div className="bg-white rounded-2xl border border-hairline-light shadow-soft overflow-hidden divide-y divide-ink-100">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-ink-100 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 bg-ink-100 rounded-full animate-pulse" />
                <div className="h-2.5 w-1/2 bg-ink-100 rounded-full animate-pulse" />
              </div>
            </div>
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
        <div data-tour="cards" className="bg-white rounded-2xl border border-hairline-light shadow-soft overflow-hidden divide-y divide-ink-100">
          {cards.map((summary) => (
            <CardRow key={summary.card.id} summary={summary} onOpen={setDetailCardId} />
          ))}
        </div>
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
            {/* Mini-resumo do cartão no topo do modal: limite + editar/excluir */}
            <div
              className="rounded-2xl p-4 text-white relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${detailCard.card.color} 0%, ${detailCard.card.color}cc 100%)` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest opacity-80 font-bold">{detailCard.card.brand}</p>
                  <p className="font-mono text-xs tracking-[0.2em] opacity-80 mt-0.5">•••• {detailCard.card.last_digits || '----'}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setDetailCardId(null); setEditing(detailCard.card); open(); }}
                    className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors"
                    title="Editar cartão"
                    aria-label="Editar cartão"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDetailCardId(null); requestDelete(detailCard); }}
                    className="w-9 h-9 rounded-lg bg-white/15 hover:bg-negative flex items-center justify-center transition-colors"
                    title="Excluir cartão"
                    aria-label="Excluir cartão"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {detailCard.cardLimit > 0 && (
                <div className="mt-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest opacity-70 font-bold">Limite livre</p>
                      <p className="font-display font-bold text-xl leading-tight">{formatCurrency(detailCard.available)}</p>
                    </div>
                    <p className="text-xs opacity-80 text-right">de {formatCurrency(detailCard.cardLimit)}</p>
                  </div>
                  <div className="mt-2 h-1.5 bg-black/25 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(detailCard.utilizationPercent, 100)}%` }} />
                  </div>
                </div>
              )}
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
