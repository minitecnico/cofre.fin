import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { parseAmount, toAmountInput } from '../utils/format';
import { travelErrorMessage } from '../services/travel';

/**
 * Cria/edita a viagem. Só o nome é obrigatório — datas e orçamento ajudam a
 * acompanhar, mas dá pra começar a anotar gastos antes de decidir.
 */
export default function TripForm({ initial = null, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    destination: initial?.destination || '',
    start_date: initial?.start_date || '',
    end_date: initial?.end_date || '',
    budget: toAmountInput(initial?.budget),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return setError('Dê um nome para a viagem');
    if (form.start_date && form.end_date && form.end_date < form.start_date) return setError('A volta está antes da ida');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name,
        destination: form.destination.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget: parseAmount(form.budget) > 0 ? parseAmount(form.budget) : null,
      });
    } catch (err) {
      setError(travelErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="label">Nome</label>
        <input className="input-field" value={form.name} onChange={set('name')} placeholder="Ex: Férias em Ilha Grande" autoFocus={!initial} required />
      </div>
      <div>
        <label className="label">Destino (opcional)</label>
        <input className="input-field" value={form.destination} onChange={set('destination')} placeholder="Ex: Abraão, Angra dos Reis" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Ida</label>
          <input className="input-field" type="date" value={form.start_date} onChange={set('start_date')} />
        </div>
        <div>
          <label className="label">Volta</label>
          <input className="input-field" type="date" value={form.end_date} min={form.start_date || undefined} onChange={set('end_date')} />
        </div>
      </div>
      <div>
        <label className="label">Orçamento (opcional)</label>
        <input className="input-field" inputMode="decimal" value={form.budget} onChange={set('budget')} placeholder="R$ 0,00" />
      </div>

      {error && <p className="text-sm text-negative font-medium">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 min-h-[48px]">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 min-h-[48px] disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          {initial ? 'Salvar' : 'Criar viagem'}
        </button>
      </div>
    </form>
  );
}
