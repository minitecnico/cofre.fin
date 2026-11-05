import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Check, CloudOff, CreditCard, Receipt } from 'lucide-react';
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
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const pick = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  // Cartão renomeado depois do gasto: a anotação antiga continua aparecendo.
  const cardNames = [...new Set([...cards.map((c) => c.name), initial?.card_label].filter(Boolean))];

  async function handleSubmit(e) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    const description = form.description.trim();
    if (!description) return setError('Informe uma descrição');
    if (!(amount > 0)) return setError('Informe um valor válido');
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

  const chip = (active) => `px-3 min-h-[36px] rounded-full border text-sm font-semibold transition-colors ${
    active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
  }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="label">Descrição</label>
        <input className="input-field" value={form.description} onChange={set('description')} placeholder="Ex: Barco até a ilha" autoFocus={!initial} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Valor</label>
          <input className="input-field" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="R$ 0,00" required />
        </div>
        <div>
          <label className="label">Data</label>
          <input className="input-field" type="date" value={form.date} onChange={set('date')} required />
        </div>
      </div>

      <div>
        <label className="label">Categoria</label>
        <div className="flex flex-wrap gap-2">
          {TRIP_CATEGORIES.map((c) => (
            <button key={c.value} type="button" onClick={() => pick('category', c.value)} className={`${chip(form.category === c.value)} inline-flex items-center gap-1.5`}>
              <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {cardNames.length > 0 && (
        <div>
          <label className="label">Cartão usado (só anotação)</label>
          <div className="flex flex-wrap gap-2">
            {['', ...cardNames].map((name) => (
              <button key={name || 'nenhum'} type="button" onClick={() => pick('card_label', name)} className={chip(form.card_label === name)}>
                {name || 'Nenhum'}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-ink-500">Fica só na viagem — não entra nas despesas do mês nem no saldo.</p>

      {error && <p className="text-sm text-negative font-medium">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 min-h-[48px]">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 min-h-[48px] disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          Salvar
        </button>
      </div>
      {onDelete && (
        <button type="button" onClick={onDelete} className="btn-danger w-full">
          <Trash2 className="w-4 h-4" /> {initial?.pending ? 'Descartar gasto' : 'Excluir gasto'}
        </button>
      )}
    </form>
  );
}
