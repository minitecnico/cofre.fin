import { useState } from 'react';
import { Users, Check, X } from 'lucide-react';
import { goalService } from '../services/goals';
import { formatCurrency } from '../utils/format';

/**
 * Convites recebidos para metas coletivas. A pessoa só entra na meta depois de
 * aceitar aqui — até lá não vê nada da meta além do título e do valor alvo.
 */
export default function GoalInvites({ invites, onResponded }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (invites.length === 0) return null;

  async function respond(id, accept) {
    setBusy(id);
    setError(null);
    try {
      await goalService.respondInvite(id, accept);
      onResponded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {invites.map((i) => (
        <div key={i.id} className="card-flat p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-l-4 border-accent animate-slide-up">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-accent flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-ink-900" />
            </div>
            <div className="min-w-0">
              <p className="text-sm">
                <strong>{i.inviter_name}</strong> convidou você para a meta coletiva
              </p>
              <p className="font-display font-bold truncate">
                {i.goal_title} <span className="text-xs text-ink-500 font-medium">· {formatCurrency(i.target_amount)}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => respond(i.id, false)}
              disabled={busy === i.id}
              className="btn-ghost !py-2 !px-3 !text-sm flex-1 sm:flex-none"
            >
              <X className="w-4 h-4" /> Recusar
            </button>
            <button
              onClick={() => respond(i.id, true)}
              disabled={busy === i.id}
              className="btn-accent !py-2 !px-3 !text-sm flex-1 sm:flex-none"
            >
              <Check className="w-4 h-4" /> Aceitar
            </button>
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-negative">{error}</p>}
    </div>
  );
}
