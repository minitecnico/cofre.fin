import { useEffect, useState } from 'react';
import { Copy, Check, Loader2, UserPlus, X, Users, Clock, LogOut, Crown } from 'lucide-react';
import { goalService } from '../services/goals';
import { buildPixPayload, pixQrCodeDataUrl } from '../services/pix';
import { formatCurrency } from '../utils/format';

/**
 * Detalhes de uma meta coletiva: conta PIX onde todos depositam, participantes
 * (com quanto cada um já colocou), convites pendentes e histórico de depósitos.
 *
 * `refreshKey` muda quando o Realtime avisa de alguma alteração (o canal vive
 * no GoalsList) — aí recarregamos, e todos veem o avanço ao vivo.
 */
export default function SharedGoalDetails({ goal, isOwner, currentUserId, refreshKey, onLeft }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    goalService.sharedDetails(goal.id)
      .then((d) => { if (alive) setDetails(d); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [goal.id, refreshKey]);

  if (error) {
    return <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>;
  }
  if (!details) {
    return <div className="h-40 bg-ink-100 animate-pulse rounded-2xl" />;
  }

  // Total depositado por participante
  const byUser = {};
  for (const c of details.contributions) byUser[c.user_id] = (byUser[c.user_id] || 0) + Number(c.amount);

  async function removeMember(userId) {
    try {
      await goalService.removeMember(goal.id, userId);
      if (userId === currentUserId) onLeft();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelInvite(id) {
    try { await goalService.cancelInvite(id); } catch (err) { setError(err.message); }
  }

  return (
    <div className="space-y-5">
      <PixBox goal={goal} />

      {/* Participantes */}
      <section>
        <h4 className="text-[10px] uppercase tracking-widest font-bold text-ink-500 mb-2 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Participantes ({details.members.length})
        </h4>
        <ul className="space-y-1.5">
          {details.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 px-3 py-2.5 bg-ink-50 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-gradient-dark text-white text-xs font-bold flex items-center justify-center flex-shrink-0 uppercase">
                {(m.display_name || '?').slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate flex items-center gap-1.5">
                  {m.display_name || 'Participante'}
                  {m.user_id === currentUserId && <span className="text-ink-400 font-medium">(você)</span>}
                  {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-warn" aria-label="Criador da meta" />}
                </p>
                <p className="text-xs text-ink-500">Depositou {formatCurrency(byUser[m.user_id] || 0)}</p>
              </div>
              {m.role !== 'owner' && (isOwner || m.user_id === currentUserId) && (
                <button
                  onClick={() => removeMember(m.user_id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50 transition-colors"
                  title={m.user_id === currentUserId ? 'Sair da meta' : 'Remover participante'}
                  aria-label={m.user_id === currentUserId ? 'Sair da meta' : 'Remover participante'}
                >
                  {m.user_id === currentUserId ? <LogOut className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </button>
              )}
            </li>
          ))}
          {details.invites.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2.5 border border-dashed border-ink-200 rounded-xl">
              <Clock className="w-4 h-4 text-ink-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">@{i.invitee_nick}</p>
                <p className="text-xs text-ink-500">Aguardando aceitar o convite</p>
              </div>
              {isOwner && (
                <button
                  onClick={() => cancelInvite(i.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50 transition-colors"
                  title="Cancelar convite"
                  aria-label="Cancelar convite"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && <InviteForm goalId={goal.id} />}
      </section>

      {/* Histórico */}
      <section>
        <h4 className="text-[10px] uppercase tracking-widest font-bold text-ink-500 mb-2">Depósitos</h4>
        {details.contributions.length === 0 ? (
          <p className="text-xs text-ink-500">Nenhum depósito registrado ainda.</p>
        ) : (
          <ul className="divide-y divide-ink-100 max-h-60 overflow-y-auto">
            {details.contributions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">
                  <strong>{c.display_name || 'Participante'}</strong>
                  <span className="text-xs text-ink-500 ml-2">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </span>
                <span className="font-mono font-bold text-positive whitespace-nowrap">+ {formatCurrency(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** QR + copia-e-cola da conta da meta (PIX estático, sem valor fixo). */
function PixBox({ goal }) {
  const [dataUrl, setDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const payload = goal.pix_key && goal.pix_name && goal.pix_city
    ? buildPixPayload({ key: goal.pix_key, keyType: goal.pix_key_type, name: goal.pix_name, city: goal.pix_city })
    : '';

  useEffect(() => {
    if (!payload) return;
    let alive = true;
    pixQrCodeDataUrl(payload).then((url) => { if (alive) setDataUrl(url); }).catch(() => {});
    return () => { alive = false; };
  }, [payload]);

  if (!payload) {
    return (
      <p className="px-4 py-3 bg-ink-50 rounded-xl text-xs text-ink-500">
        A conta PIX da meta ainda não foi definida. O criador pode configurar em “Editar”.
      </p>
    );
  }

  async function copy() {
    try { await navigator.clipboard.writeText(payload); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  }

  return (
    <section className="text-center space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">Deposite via PIX em</p>
        <p className="font-bold text-sm mt-0.5">{goal.pix_name}</p>
        <p className="text-xs text-ink-500 break-all">{goal.pix_key}</p>
      </div>
      {dataUrl ? (
        <img src={dataUrl} alt="QR Code PIX da meta" className="w-44 h-44 mx-auto rounded-2xl border border-ink-100" />
      ) : (
        <div className="w-44 h-44 mx-auto rounded-2xl bg-ink-50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-ink-400" />
        </div>
      )}
      <button onClick={copy} className="btn-ghost w-full min-h-[44px] flex items-center justify-center gap-2">
        {copied ? <Check className="w-4 h-4 text-positive" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copiado!' : 'Copiar código PIX'}
      </button>
      <p className="text-[11px] text-ink-400">Depois de transferir, toque em “Registrar depósito” no card da meta.</p>
    </section>
  );
}

function InviteForm({ goalId }) {
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
      await goalService.invite(goalId, nick);
      setNick('');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
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
        O convite aparece na aba Metas da pessoa, que escolhe aceitar ou recusar. Ela encontra o próprio @nick ali também.
      </p>
      {sent && <p className="text-xs text-positive font-bold">Convite enviado!</p>}
      {error && <p className="text-xs text-negative">{error}</p>}
    </form>
  );
}
