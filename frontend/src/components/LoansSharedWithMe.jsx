import { useEffect, useState } from 'react';
import { Landmark, Check, X, Loader2, LogOut } from 'lucide-react';
import Modal from './Modal';
import LoanStatement from './LoanStatement';
import { loanService } from '../services';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, parseLoanInfo } from '../utils/format';

/**
 * Lado de quem foi convidado pelo @nick: convites pendentes (aceitar/recusar)
 * e os empréstimos de outras pessoas que acompanha — só leitura, mesmo extrato
 * do link público. Não renderiza nada se não houver nenhum dos dois.
 */
export default function LoansSharedWithMe() {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);
  const [shared, setShared] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  async function load() {
    // Sem a migration no banco os RPCs falham — a aba segue só com os próprios.
    const [inv, sh] = await Promise.all([
      loanService.myInvites().catch(() => []),
      loanService.sharedWithMe().catch(() => []),
    ]);
    setInvites(inv);
    setShared(sh);
  }
  useEffect(() => { load(); }, []);

  async function run(key, action) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível concluir. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  const open = shared.find((l) => l.installment_group_id === openId) || null;

  function closeModal() {
    setOpenId(null);
    setConfirmLeave(false);
  }

  if (invites.length === 0 && shared.length === 0) return null;

  return (
    <div className="space-y-3">
      {invites.map((i) => (
        <div key={i.id} className="card-flat p-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-slide-up">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-accent flex items-center justify-center flex-shrink-0">
              <Landmark className="w-5 h-5 text-ink-900" />
            </div>
            <div className="min-w-0">
              <p className="text-sm"><strong>{i.inviter_name}</strong> quer compartilhar um empréstimo com você</p>
              <p className="font-display font-bold truncate">{i.description || 'Empréstimo'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => run(i.id, () => loanService.respondInvite(i.id, false))} disabled={busy === i.id}
              className="btn-ghost !py-2 !px-3 !text-sm flex-1 sm:flex-none">
              <X className="w-4 h-4" /> Recusar
            </button>
            <button onClick={() => run(i.id, () => loanService.respondInvite(i.id, true))} disabled={busy === i.id}
              className="btn-accent !py-2 !px-3 !text-sm flex-1 sm:flex-none">
              {busy === i.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aceitar
            </button>
          </div>
        </div>
      ))}

      {shared.length > 0 && (
        <>
          <div className="flex items-baseline justify-between pt-2">
            <h3 className="font-display text-xl md:text-2xl font-bold tracking-display">Compartilhados comigo</h3>
            <span className="badge-tag">{shared.length}</span>
          </div>
          <div className="space-y-3">
            {shared.map(({ installment_group_id: id, statement: st }) => {
              const parcels = st.parcels || [];
              const total = parcels[0]?.total || parcels.length;
              const paidCount = parcels.filter((p) => p.paid).length;
              const openSum = parcels.filter((p) => !p.paid).reduce((a, p) => a + Number(p.amount), 0);
              const pct = total ? Math.round((paidCount / total) * 100) : 0;
              return (
                <button key={id} type="button" onClick={() => setOpenId(id)}
                  className="feature-card p-5 w-full text-left hover:shadow-soft-md transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-base md:text-lg font-bold truncate">{st.description || 'Empréstimo'}</p>
                      <p className="text-xs text-ink-500 mt-0.5">de {st.owner_name || 'outro usuário'}</p>
                    </div>
                    <span className="btn-pill-sm whitespace-nowrap flex-shrink-0">Detalhes</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs mt-3">
                    <div>
                      <p className="text-ink-500 font-semibold uppercase tracking-wider text-[10px]">Pagas</p>
                      <p className="font-display text-base font-bold tabular-nums mt-0.5">
                        {paidCount}<span className="text-ink-400 font-normal">/{total}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-ink-500 font-semibold uppercase tracking-wider text-[10px]">Falta pagar</p>
                      <p className="font-display text-base font-bold tabular-nums mt-0.5">{formatCurrency(openSum)}</p>
                    </div>
                  </div>
                  <div className="mt-3 w-full h-1.5 bg-surface-soft rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="text-sm text-negative font-medium">{error}</p>}

      <Modal isOpen={!!open} onClose={closeModal} title={open?.statement.description || 'Empréstimo'}>
        {open && (() => {
          const st = open.statement;
          const info = parseLoanInfo(st.loan_info);
          const rate = st.monthly_rate != null ? Number(st.monthly_rate) / 100 : info ? info.taxa : null;
          return (
            <div className="space-y-5">
              <p className="text-sm text-ink-500">Compartilhado por <b className="text-ink-900">{st.owner_name || 'outro usuário'}</b> · só leitura</p>
              <LoanStatement parcels={st.parcels} rate={rate} info={info} notes={st.notes} />
              {confirmLeave ? (
                <div className="px-3 py-3 rounded-xl bg-surface-soft border border-hairline-light space-y-2">
                  <p className="text-sm text-ink-700">Você deixa de ver este empréstimo. Para voltar, precisa de um novo convite.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmLeave(false)} className="btn-ghost min-h-[44px]">Voltar</button>
                    <button type="button" disabled={!!busy} className="btn-danger min-h-[44px]"
                      onClick={() => run('leave', async () => {
                        await loanService.removeMember(open.installment_group_id, user.id);
                        closeModal();
                      })}>
                      Deixar de acompanhar
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmLeave(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] text-sm font-semibold text-ink-500 hover:text-negative">
                  <LogOut className="w-4 h-4" /> Deixar de acompanhar
                </button>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
