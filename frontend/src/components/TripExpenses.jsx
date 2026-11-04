import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Check, CloudOff, CreditCard, Receipt } from 'lucide-react';
import Modal from './Modal';
import Select from './Select';
import { formatCurrency, formatDate, parseAmount, toAmountInput, todayISO } from '../utils/format';
import { travelErrorMessage } from '../services/travel';

/**
 * Gastos da viagem. Cada um é uma despesa normal (desconta do saldo e aparece
 * em Despesas); registrado sem internet fica "aguardando envio" até a rede voltar.
 */
export default function TripExpenses({ expenses, categories, cards, onAdd, onUpdate, onRemove, onConfirm, onNotify }) {
  const [editing, setEditing] = useState(null); // null | 'new' | gasto

  async function submit(fields) {
    if (editing === 'new') {
      const queued = await onAdd(fields);
      if (queued) onNotify('Sem internet — o gasto ficou salvo no aparelho e será enviado quando a conexão voltar.');
    } else {
      await onUpdate(editing.id, fields);
    }
    setEditing(null);
  }

  function askRemove(item) {
    onConfirm({
      title: item.pending ? 'Descartar gasto' : 'Apagar gasto',
      message: item.pending
        ? `“${item.description}” ainda não foi enviado. Descartar apaga ele deste aparelho.`
        : `Apagar “${item.description}”? Ele sai também de Despesas e o valor volta para o saldo.`,
      confirmLabel: item.pending ? 'Descartar' : 'Apagar',
      tone: 'danger',
      onConfirm: () => onRemove(item, 'expense'),
    });
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditing('new')} className="btn-primary w-full sm:w-auto">
        <Plus className="w-5 h-5" /> Adicionar gasto
      </button>

      {expenses.length === 0 ? (
        <div className="card-flat p-8 text-center">
          <Receipt className="w-10 h-10 mx-auto mb-3 text-ink-300" strokeWidth={1.75} />
          <p className="text-sm text-ink-500">Nenhum gasto ainda. Passagem, hospedagem, passeio — tudo entra aqui.</p>
        </div>
      ) : (
        <ul className="card-flat overflow-hidden divide-y divide-ink-100">
          {expenses.map((e) => (
            <li key={e.id} className="px-4 py-3 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.category?.color || '#a1a1aa' }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900 truncate">{e.description}</p>
                <p className="text-xs text-ink-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{formatDate(e.date)}</span>
                  {e.category && <span>· {e.category.name}</span>}
                  {e.card_label && (
                    <span className="inline-flex items-center gap-1"><CreditCard className="w-3 h-3" />{e.card_label}</span>
                  )}
                  {!e.paid && <span className="text-warn font-semibold">a pagar</span>}
                </p>
                {e.pending && (
                  <p className={`text-[11px] font-semibold mt-0.5 flex items-center gap-1 ${e.sendError ? 'text-negative' : 'text-ink-500'}`}>
                    <CloudOff className="w-3 h-3" /> {e.sendError ? `Não enviado: ${e.sendError}` : 'Aguardando internet'}
                  </p>
                )}
              </div>
              <span className="stat-number text-sm text-ink-900 whitespace-nowrap">{formatCurrency(e.amount)}</span>
              <div className="flex items-center">
                {!e.pending && (
                  <button type="button" onClick={() => setEditing(e)} className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100" aria-label="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => askRemove(e)} className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-red-50 hover:text-negative" aria-label="Apagar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Novo gasto' : 'Editar gasto'}>
        {editing && (
          <ExpenseForm
            initial={editing === 'new' ? null : editing}
            categories={categories}
            cards={cards}
            onSubmit={submit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * Categorias e cartões vêm do que está salvo da viagem — o form abre sem
 * internet. O cartão é só uma anotação (não entra na fatura).
 */
function ExpenseForm({ initial, categories, cards, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    description: initial?.description || '',
    amount: toAmountInput(initial?.amount),
    date: initial?.date || todayISO(),
    category_id: initial?.category_id || categories[0]?.id || '',
    card_label: initial?.card_label || '',
    paid: initial ? initial.paid : true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Cartão renomeado depois do gasto: a anotação antiga continua aparecendo.
  const cardNames = [...new Set([...cards.map((c) => c.name), initial?.card_label].filter(Boolean))];

  async function handleSubmit(e) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    const description = form.description.trim();
    if (!description) return setError('Informe uma descrição');
    if (!(amount > 0)) return setError('Informe um valor válido');
    if (!form.category_id) return setError('Escolha uma categoria');
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

      {categories.length > 0 ? (
        <Select
          label="Categoria"
          value={form.category_id}
          onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
          options={categories.map((c) => ({
            value: c.id,
            label: c.name,
            icon: <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />,
          }))}
        />
      ) : (
        <p className="text-sm text-ink-500">Sem categorias de despesa salvas — abra a viagem com internet uma vez.</p>
      )}

      {cardNames.length > 0 && (
        <div>
          <label className="label">Cartão usado (só anotação)</label>
          <div className="flex flex-wrap gap-2">
            {['', ...cardNames].map((name) => (
              <button
                key={name || 'nenhum'}
                type="button"
                onClick={() => setForm((f) => ({ ...f, card_label: name }))}
                className={`px-3 min-h-[36px] rounded-full border text-sm font-semibold transition-colors ${
                  form.card_label === name ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                }`}
              >
                {name || 'Nenhum'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-500 mt-1">Não entra na fatura nem no limite do cartão.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setForm((f) => ({ ...f, paid: !f.paid }))}
        className={`w-full flex items-center justify-between min-h-[44px] px-3 rounded-xl border transition-colors ${
          form.paid ? 'border-accent bg-accent/10' : 'border-ink-200 bg-ink-50'
        }`}
      >
        <span className="text-sm font-semibold text-ink-800">{form.paid ? 'Já pago' : 'A pagar'}</span>
        <span className={`w-9 h-5 rounded-full relative transition-colors ${form.paid ? 'bg-accent' : 'bg-ink-300'}`}>
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${form.paid ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
      </button>

      {error && <p className="text-sm text-negative font-medium">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 min-h-[48px]">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 min-h-[48px] disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          Salvar
        </button>
      </div>
    </form>
  );
}
