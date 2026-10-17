import { useState } from 'react';
import { Check, Loader2, X, Edit2, Trash2 } from 'lucide-react';
import { goalService } from '../services/goals';
import { formatCurrency, parseAmount } from '../utils/format';

/**
 * Histórico de depósitos de uma meta (individual ou coletiva). Quem registrou
 * um depósito pode corrigir o valor ou excluí-lo; o total da meta acompanha.
 */
export default function GoalContributionList({ contributions, currentUserId, onChanged }) {
  if (contributions.length === 0) {
    return <p className="text-xs text-ink-500">Nenhum depósito registrado ainda.</p>;
  }
  return (
    <ul className="divide-y divide-ink-100 max-h-60 overflow-y-auto">
      {contributions.map((c) => (
        <ContributionRow key={c.id} contribution={c} mine={c.user_id === currentUserId} onSaved={onChanged} />
      ))}
    </ul>
  );
}

/**
 * Linha do histórico. Depósitos próprios podem ter o valor corrigido ou ser
 * excluídos — a exclusão pede confirmação na própria linha (aqui já estamos
 * dentro de um Modal; um ConfirmDialog por cima não empilha bem).
 */
function ContributionRow({ contribution: c, mine, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    const amount = parseAmount(value);
    if (!amount || amount <= 0) { setError('Informe um valor válido'); return; }
    setSaving(true);
    setError(null);
    try {
      await goalService.updateContribution(c.id, amount);
      await onSaved();
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await goalService.removeContribution(c.id);
      await onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (confirming) {
    return (
      <li className="py-2 space-y-2">
        <p className="text-sm">
          Excluir o depósito de <strong>{formatCurrency(c.amount)}</strong>? O valor sai do total da meta.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="btn-ghost flex-1 !py-2 !text-sm" autoFocus>
            Cancelar
          </button>
          <button type="button" onClick={remove} disabled={saving} className="btn-danger-solid flex-1 !py-2 !text-sm flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Excluir
          </button>
        </div>
        {error && <p className="text-xs text-negative">{error}</p>}
      </li>
    );
  }

  if (editing) {
    return (
      <li className="py-2">
        <form onSubmit={save} className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input-field pl-10 font-mono text-right"
              autoFocus
            />
          </div>
          <button type="submit" disabled={saving} className="btn-accent !px-3" aria-label="Salvar valor">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost !px-3" aria-label="Cancelar edição">
            <X className="w-4 h-4" />
          </button>
        </form>
        {error && <p className="text-xs text-negative mt-1">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <span className="truncate">
        <strong>{c.display_name || 'Participante'}</strong>
        <span className="text-xs text-ink-500 ml-2">
          {new Date(c.created_at).toLocaleDateString('pt-BR')}
        </span>
      </span>
      <span className="flex items-center gap-1 flex-shrink-0">
        <span className="font-mono font-bold text-positive whitespace-nowrap">+ {formatCurrency(c.amount)}</span>
        {mine && (
          <>
            <button
              onClick={() => { setValue(String(c.amount).replace('.', ',')); setEditing(true); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
              title="Editar valor"
              aria-label="Editar valor do depósito"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50 transition-colors"
              title="Excluir depósito"
              aria-label="Excluir depósito"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </span>
    </li>
  );
}
