import { useState, useEffect } from 'react';
import { Plus, Loader2, CreditCard, UserPlus, HandCoins } from 'lucide-react';
import { debtorService, chargeService } from '../services/cobrancas';
import { formatCurrency, parseAmount } from '../utils/format';

/**
 * Form rápido de Cobrança — usado pelo botão "+" (FAB), lado a lado com a
 * transação. Permite escolher um devedor existente ou criar um na hora,
 * lançar valor/vencimento e opcionalmente parcelar (cartão emprestado).
 *
 * Standalone: fala direto com debtorService/chargeService (igual TransactionForm
 * faz com seus services). Ao salvar, chama onSaved.
 */
export default function CobrancaQuickForm({ onSaved, onCancel }) {
  const [debtors, setDebtors] = useState([]);
  const [debtorId, setDebtorId] = useState('');     // '' = nenhum, 'new' = criar
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [form, setForm] = useState({ description: '', amount: '', dueDate: '' });
  const [parcelado, setParcelado] = useState(false);
  const [count, setCount] = useState(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    debtorService.list()
      .then((list) => {
        setDebtors(list);
        // Pré-seleciona o primeiro, ou força "nova pessoa" se não houver nenhum
        setDebtorId(list.length ? list[0].id : 'new');
      })
      .catch(() => setDebtorId('new'));
  }, []);

  const total = parseAmount(form.amount);
  const perParcel = parcelado && total > 0 && count > 1
    ? Math.floor((total / count) * 100) / 100
    : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.description.trim() || total <= 0) {
      setError('Preencha descrição e valor.');
      return;
    }
    setSaving(true);
    try {
      // Resolve o devedor (cria na hora se "nova pessoa")
      let id = debtorId;
      if (debtorId === 'new') {
        if (!newName.trim()) { setError('Informe o nome da pessoa.'); setSaving(false); return; }
        const created = await debtorService.create({ name: newName.trim(), phone: newPhone.trim() });
        id = created.id;
      }

      if (parcelado && count > 1) {
        await chargeService.createInstallments({
          debtorId: id,
          description: form.description.trim(),
          totalAmount: total,
          count,
          firstDueDate: form.dueDate || null,
        });
      } else {
        await chargeService.create({
          debtorId: id,
          description: form.description.trim(),
          amount: total,
          dueDate: form.dueDate || null,
        });
      }
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar a cobrança.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Devedor */}
      <div>
        <label className="label flex items-center gap-1.5"><HandCoins className="w-3.5 h-3.5" /> Quem te deve</label>
        <select className="input-field" value={debtorId} onChange={(e) => setDebtorId(e.target.value)}>
          {debtors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="new">+ Nova pessoa…</option>
        </select>
      </div>

      {debtorId === 'new' && (
        <div className="grid grid-cols-2 gap-2 animate-slide-up">
          <div>
            <label className="label flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Nome</label>
            <input className="input-field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: João" autoFocus />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input className="input-field" type="tel" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="(11) 9…" />
          </div>
        </div>
      )}

      <div>
        <label className="label">Descrição</label>
        <input className="input-field" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex: Compra na Amazon" required />
      </div>

      <div>
        <label className="label">{parcelado ? 'Valor total' : 'Valor'}</label>
        <input className="input-field" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="R$ 0,00" required />
      </div>

      {/* Parcelar */}
      <button
        type="button"
        onClick={() => setParcelado((v) => !v)}
        className={`w-full flex items-center justify-between min-h-[44px] px-3 rounded-xl border transition-colors ${
          parcelado ? 'border-accent bg-accent/10' : 'border-ink-200 bg-ink-50'
        }`}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <CreditCard className="w-4 h-4" /> Parcelar (cartão emprestado)
        </span>
        <span className={`w-9 h-5 rounded-full relative transition-colors ${parcelado ? 'bg-accent' : 'bg-ink-300'}`}>
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${parcelado ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
      </button>

      {parcelado && (
        <div className="space-y-2 animate-slide-up">
          <div>
            <label className="label">Número de parcelas</label>
            <input className="input-field" type="number" min="2" max="48" value={count}
              onChange={(e) => setCount(Math.max(2, Math.min(48, Number(e.target.value) || 2)))} />
          </div>
          {perParcel > 0 && (
            <p className="text-xs text-ink-500">{count}x de aprox. <span className="font-bold text-ink-800">{formatCurrency(perParcel)}</span> — uma por mês.</p>
          )}
        </div>
      )}

      <div>
        <label className="label">{parcelado ? 'Vencimento da 1ª parcela' : 'Vencimento (opcional)'}</label>
        <input className="input-field" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
      </div>

      {error && <p className="text-sm text-negative font-medium">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 min-h-[48px]">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          {parcelado ? `Lançar ${count}x` : 'Lançar cobrança'}
        </button>
      </div>
    </form>
  );
}
