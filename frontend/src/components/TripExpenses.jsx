import { useLayoutEffect, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Check, CloudOff, CreditCard, Receipt, Info, ChevronDown,
  BedDouble, Bus, UtensilsCrossed, Ticket, ShoppingBag, Ellipsis,
} from 'lucide-react';
import Modal from './Modal';
import { formatCurrency, formatDate, parseAmount, toAmountInput, todayISO } from '../utils/format';
import { travelErrorMessage } from '../services/travel';
import { TRIP_CATEGORIES, tripCategory } from '../constants';

/**
 * Gastos da viagem — caderno à parte: não entram nas despesas do mês nem no
 * saldo. Cada viajante anota os seus; edita/exclui os próprios (o dono, todos).
 * Anotado sem internet fica "aguardando internet" até a rede voltar.
 */
export default function TripExpenses({
  expenses, cards, members, currentUserId, isOwner, onAdd, onUpdate, onRemove, onConfirm, onNotify,
}) {
  const [editing, setEditing] = useState(null); // null | 'new' | gasto
  const names = Object.fromEntries(members.map((m) => [m.user_id, (m.display_name || '').split(' ')[0]]));
  const showWho = members.length > 1;

  async function submit(fields) {
    if (editing === 'new') {
      const queued = await onAdd(fields);
      if (queued) onNotify('Sem internet — o gasto ficou salvo no aparelho e será enviado quando a conexão voltar.');
    } else {
      await onUpdate(editing, fields);
    }
    setEditing(null);
  }

  function askRemove(item) {
    setEditing(null);
    onConfirm({
      title: item.pending ? 'Descartar gasto' : 'Excluir gasto',
      message: item.pending
        ? `“${item.description}” ainda não foi enviado. Descartar apaga ele deste aparelho.`
        : `Excluir “${item.description}” desta viagem?`,
      confirmLabel: item.pending ? 'Descartar' : 'Excluir',
      tone: 'danger',
      onConfirm: () => onRemove(item),
    });
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditing('new')} className="btn-primary w-full sm:w-auto">
        <Plus className="w-5 h-5" /> Anotar gasto
      </button>

      {expenses.length === 0 ? (
        <div className="card-flat p-8 text-center">
          <Receipt className="w-10 h-10 mx-auto mb-3 text-ink-300" strokeWidth={1.75} />
          <p className="text-sm text-ink-500">Nenhum gasto ainda. Passagem, hospedagem, passeio — tudo entra aqui.</p>
        </div>
      ) : (
        <ul className="card-flat overflow-hidden divide-y divide-ink-100">
          {expenses.map((e) => {
            const cat = tripCategory(e.category);
            const canEdit = e.pending || isOwner || e.user_id === currentUserId;
            return (
              <li key={e.id} className="px-4 py-3 flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900 truncate">{e.description}</p>
                  <p className="text-xs text-ink-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{formatDate(e.date, 'numeric')}</span>
                    <span>· {cat.label}</span>
                    {e.card_label && (
                      <span className="inline-flex items-center gap-1"><CreditCard className="w-3 h-3" />{e.card_label}</span>
                    )}
                    {showWho && names[e.user_id] && <span>· por {names[e.user_id]}</span>}
                  </p>
                  {e.pending && (
                    <p className={`text-[11px] font-semibold mt-0.5 flex items-center gap-1 ${e.sendError ? 'text-negative' : 'text-ink-500'}`}>
                      <CloudOff className="w-3 h-3" /> {e.sendError ? `Não enviado: ${e.sendError}` : 'Aguardando internet'}
                    </p>
                  )}
                </div>
                <span className="stat-number text-sm text-ink-900 whitespace-nowrap">{formatCurrency(e.amount)}</span>
                {canEdit && (
                  <button type="button" onClick={() => setEditing(e)} className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100" aria-label="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Anotar gasto' : 'Editar gasto'}>
        {editing && (
          <ExpenseForm
            initial={editing === 'new' ? null : editing}
            cards={cards}
            onSubmit={submit}
            onCancel={() => setEditing(null)}
            onDelete={editing === 'new' ? null : () => askRemove(editing)}
          />
        )}
      </Modal>
    </div>
  );
}

const CATEGORY_ICONS = {
  hospedagem: BedDouble,
  transporte: Bus,
  alimentacao: UtensilsCrossed,
  passeios: Ticket,
  compras: ShoppingBag,
  outro: Ellipsis,
};

/**
 * Abre sem internet (cartões vêm do que está salvo da viagem). O cartão é só
 * uma anotação. Excluir fica aqui dentro (com confirmação), nunca na lista.
 */
function ExpenseForm({ initial, cards, onSubmit, onCancel, onDelete }) {
  const [form, setForm] = useState({
    description: initial?.description || '',
    amount: toAmountInput(initial?.amount),
    date: initial?.date || todayISO(),
    category: initial?.category || 'alimentacao',
    card_label: initial?.card_label || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const descRef = useRef(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const pick = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  // Descrição cresce com o texto (até o max-h, depois rola): uma linha parece um
  // input comum; descrições longas de várias linhas não ficam espremidas.
  useLayoutEffect(() => {
    const el = descRef.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`; // +2 = bordas (border-box)
  }, [form.description]);

  // Cartão renomeado depois do gasto: a anotação antiga continua aparecendo.
  const cardNames = [...new Set([...cards.map((c) => c.name), initial?.card_label].filter(Boolean))];
  const deleteLabel = initial?.pending ? 'Descartar gasto' : 'Excluir gasto';

  async function handleSubmit(e) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    const description = form.description.trim();
    if (!(amount > 0)) return setError('Informe um valor válido');
    if (!description) return setError('Informe uma descrição');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...form, description, amount, card_label: form.card_label || null });
    } catch (err) {
      setError(travelErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Valor</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-ink-500 pointer-events-none">R$</span>
          <input
            className="input-field pl-12 text-xl md:text-2xl font-mono font-semibold"
            inputMode="decimal"
            value={form.amount}
            onChange={set('amount')}
            placeholder="0,00"
            autoFocus={!initial}
            required
          />
        </div>
      </div>

      <div>
        <label className="label">Descrição</label>
        <textarea
          ref={descRef}
          rows={1}
          className="input-field block resize-none max-h-40 overflow-y-auto leading-6"
          value={form.description}
          onChange={set('description')}
          placeholder="Ex: Barco até a ilha"
          required
        />
      </div>

      <div>
        <label className="label">Categoria</label>
        <div className="grid grid-cols-3 gap-2">
          {TRIP_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICONS[c.value];
            const active = form.category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={active}
                onClick={() => pick('category', c.value)}
                className={`min-h-[60px] px-1 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${
                  active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
                }`}
              >
                <Icon className="w-5 h-5" style={{ color: c.color }} />
                <span className="truncate max-w-full">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`grid gap-2 ${cardNames.length > 0 ? 'grid-cols-2' : ''}`}>
        <div className="min-w-0">
          <label className="label">Data</label>
          <input className="input-field min-w-0" type="date" value={form.date} onChange={set('date')} required />
        </div>
        {cardNames.length > 0 && (
          <div className="min-w-0">
            <label className="label">Cartão</label>
            {/* Seta própria (appearance-none): a nativa come espaço e cortava o nome no celular */}
            <div className="relative">
              <select className="input-field min-w-0 appearance-none pr-8" value={form.card_label} onChange={set('card_label')}>
                <option value="">Nenhum</option>
                {cardNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-ink-500 leading-relaxed">
        <Info className="w-4 h-4 flex-shrink-0" />
        <span>
          Fica só na viagem: não entra nas despesas do mês nem no saldo.
          {cardNames.length > 0 && ' O cartão é só anotação.'}
        </span>
      </p>

      {error && <p className="px-3 py-2 rounded-xl bg-red-50 text-sm text-negative font-medium">{error}</p>}

      {/* Rodapé fixo no fim do modal: Salvar sempre à vista, mesmo com a descrição
          longa ou a tela baixa. As margens negativas anulam o padding do Modal. */}
      <div className="sticky bottom-0 -mx-6 md:-mx-7 -mb-6 md:-mb-7 px-6 md:px-7 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-5 bg-white/95 backdrop-blur-md border-t border-hairline-light flex items-center gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={deleteLabel}
            title={deleteLabel}
            className="w-12 h-12 flex-shrink-0 rounded-full border border-ink-200 text-negative hover:bg-red-50 hover:border-red-200 flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          Salvar
        </button>
      </div>
    </form>
  );
}
