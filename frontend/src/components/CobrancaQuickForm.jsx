import { useState, useEffect } from 'react';
import { Plus, Loader2, CreditCard, UserPlus, HandCoins } from 'lucide-react';
import { debtorService, chargeService } from '../services/cobrancas';
import { cardService } from '../services/index';
import { formatCurrency, parseAmount } from '../utils/format';
import Stepper from './Stepper';
import Select from './Select';
import { CardSelect } from './CardTag';
import { MAX_INSTALLMENTS } from '../constants';
import { debtorCode, sameNameDebtors } from '../utils/charges';

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
  const [cards, setCards] = useState([]);
  const [cardId, setCardId] = useState('');
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
    cardService.listSimple().then(setCards).catch(() => setCards([]));
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
          cardId: cardId || null,
        });
      } else {
        await chargeService.create({
          debtorId: id,
          description: form.description.trim(),
          amount: total,
          dueDate: form.dueDate || null,
          cardId: cardId || null,
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
      <Select
        label="Quem te deve"
        icon={HandCoins}
        value={debtorId}
        onChange={setDebtorId}
        options={[
          ...debtors.map((d) => ({
            value: d.id,
            label: d.name,
            hint: [debtorCode(d.code), d.phone].filter(Boolean).join(' · ') || undefined,
            icon: <Initial name={d.name} />,
          })),
          { value: 'new', label: 'Nova pessoa…', icon: <UserPlus className="w-6 h-6 p-1 rounded-full bg-accent/20 text-ink-900 flex-shrink-0" /> },
        ]}
      />

      {debtorId === 'new' && (
        <div className="grid grid-cols-2 gap-2 animate-slide-up">
          <div>
            <label className="label flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Nome</label>
            <input className="input-field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: João" autoFocus />
          </div>
          {sameNameDebtors(newName, debtors).length > 0 && (
            <p className="col-span-2 text-[11px] text-warn font-semibold -mt-1">
              Já existe {sameNameDebtors(newName, debtors).map((d) => `${d.name} ${debtorCode(d.code)}`.trim()).join(', ')} — se for outra pessoa, tudo bem: o número diferencia.
            </p>
          )}
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
            <Stepper value={count} min={2} max={MAX_INSTALLMENTS} onChange={setCount} suffix="x" />
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

      <CardSelect cards={cards} value={cardId} onChange={setCardId} />

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

/** Avatar com a inicial do nome (opções do seletor de pessoa). */
function Initial({ name }) {
  return (
    <span className="w-6 h-6 rounded-full bg-ink-100 text-ink-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
      {String(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
