import { useState } from 'react';
import { Users, Crown, Clock, UserPlus, Loader2, X, LogOut } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { travelErrorMessage } from '../services/travel';

/**
 * Viajantes da viagem, como nas metas coletivas: o dono convida pelo @nick e a
 * pessoa aceita dentro do app. Mostra quanto cada um anotou de gastos.
 * Remover alguém ou cancelar convite só no modo "Gerenciar", com confirmação.
 */
export default function TripTravelers({
  members, invites, expenses, currentUserId, isOwner, onInvite, onCancelInvite, onRemoveMember, onConfirm,
}) {
  const [managing, setManaging] = useState(false);
  const spentBy = {};
  for (const e of expenses) spentBy[e.user_id] = (spentBy[e.user_id] || 0) + Number(e.amount);
  const me = members.find((m) => m.user_id === currentUserId);

  function askRemove(m) {
    onConfirm({
      title: 'Remover viajante',
      message: `Remover ${m.display_name || 'esta pessoa'} da viagem? Os gastos que ela anotou continuam na viagem.`,
      confirmLabel: 'Remover',
      tone: 'danger',
      onConfirm: () => onRemoveMember(m.user_id),
    });
  }

  function askCancel(i) {
    onConfirm({
      title: 'Cancelar convite',
      message: `Cancelar o convite para @${i.invitee_nick}?`,
      confirmLabel: 'Cancelar convite',
      tone: 'danger',
      onConfirm: () => onCancelInvite(i.id),
    });
  }

  function askLeave() {
    onConfirm({
      title: 'Sair da viagem',
      message: 'Você deixa de ver esta viagem. Os gastos que você anotou continuam nela.',
      confirmLabel: 'Sair',
      tone: 'danger',
      onConfirm: () => onRemoveMember(currentUserId),
    });
  }

  const canManage = isOwner && (members.length > 1 || invites.length > 0);

  return (
    <section className="card-flat p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] md:text-xs uppercase tracking-widest font-bold text-ink-500 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Viajantes ({members.length})
        </h2>
        {canManage && (
          <button type="button" onClick={() => setManaging((v) => !v)} className="text-xs font-semibold text-ink-500 hover:text-ink-900">
            {managing ? 'Concluir' : 'Gerenciar'}
          </button>
        )}
      </div>

      <ul className="space-y-1.5">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 px-3 py-2.5 bg-ink-50 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-gradient-dark text-white text-xs font-bold flex items-center justify-center flex-shrink-0 uppercase">
              {(m.display_name || '?').slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate flex items-center gap-1.5">
                {m.display_name || 'Viajante'}
                {m.user_id === currentUserId && <span className="text-ink-400 font-medium">(você)</span>}
                {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-warn" aria-label="Criou a viagem" />}
              </p>
              <p className="text-xs text-ink-500">Anotou {formatCurrency(spentBy[m.user_id] || 0)}</p>
            </div>
            {managing && m.role !== 'owner' && (
              <button type="button" onClick={() => askRemove(m)} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50" aria-label="Remover viajante">
                <X className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-3 py-2.5 border border-dashed border-ink-200 rounded-xl">
            <Clock className="w-4 h-4 text-ink-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">@{i.invitee_nick}</p>
              <p className="text-xs text-ink-500">Aguardando aceitar o convite</p>
            </div>
            {managing && (
              <button type="button" onClick={() => askCancel(i)} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50" aria-label="Cancelar convite">
                <X className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && <InviteForm onInvite={onInvite} />}
      {!isOwner && me && (
        <button type="button" onClick={askLeave} className="text-xs font-semibold text-ink-500 hover:text-negative inline-flex items-center gap-1.5">
          <LogOut className="w-3.5 h-3.5" /> Sair da viagem
        </button>
      )}
    </section>
  );
}

function InviteForm({ onInvite }) {
  const [nick, setNick] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSent(false);
    setSubmitting(true);
    try {
      await onInvite(nick);
      setNick('');
      setSent(true);
    } catch (err) {
      setError(travelErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label className="label">Convidar pelo @nick</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="@nick_da_pessoa"
          className="input-field flex-1"
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
        <button type="submit" disabled={submitting} className="btn-accent !px-4" aria-label="Enviar convite">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-[11px] text-ink-400">
        O convite aparece em Viagens da pessoa, que escolhe aceitar ou recusar. Quem aceita vê a viagem e anota gastos também.
      </p>
      {sent && <p className="text-xs text-positive font-bold">Convite enviado!</p>}
      {error && <p className="text-xs text-negative">{error}</p>}
    </form>
  );
}
