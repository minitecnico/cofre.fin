import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Copy, Check, ExternalLink, MessageCircle, RefreshCw, Loader2, Pencil, ListChecks, Users, UserPlus, Clock, X } from 'lucide-react';
import LoanStatement from './LoanStatement';
import { loanService, loanShareUrl } from '../services';
import { parseAmount, parseLoanInfo } from '../utils/format';

const SECONDARY_BTN = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-full border border-ink-300 bg-white text-ink-900 font-bold text-sm whitespace-nowrap shadow-soft hover:bg-ink-50 transition-colors';

/** Taxa em decimal: a informada à mão vence a gravada pelo LoanForm na 1ª parcela. */
export function loanRate(meta, info) {
  if (meta?.monthly_rate != null) return Number(meta.monthly_rate) / 100;
  return info ? info.taxa : null;
}

/**
 * Detalhe de um empréstimo (dono): extrato, edição de taxa/observações e link
 * público só leitura (/emprestimo/:code) — quem abre vê parcelas em aberto,
 * pagas, taxa e observações, sem precisar de conta.
 */
export default function LoanDetail({ loan, onMetaChange }) {
  const meta = loan.meta || {};
  const info = loan.parcels.map((p) => parseLoanInfo(p.notes)).find(Boolean) || null;
  const rate = loanRate(meta, info);
  const parcels = loan.parcels.map((p) => ({
    number: p.installment_number, total: p.installment_total, date: p.date, amount: p.amount, paid: p.paid,
  }));

  const [editing, setEditing] = useState(false);
  const [rateInput, setRateInput] = useState(rate != null ? String((rate * 100).toFixed(2)).replace('.', ',') : '');
  const [notesInput, setNotesInput] = useState(meta.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'rotate' | 'stop'

  const link = meta.share_code ? loanShareUrl(meta.share_code) : '';

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const saveEdit = () => run(async () => {
    const r = rateInput.trim() === '' ? null : parseAmount(rateInput);
    if (r != null && (r < 0 || r > 100)) throw new Error('Taxa inválida (use % ao mês, ex.: 1,5).');
    const saved = await loanService.saveMeta(loan.groupId, { notes: notesInput.trim() || null, monthly_rate: r });
    onMetaChange(loan.groupId, saved);
    setEditing(false);
  });

  const share = (rotate = false) => run(async () => {
    const code = await loanService.share(loan.groupId, meta.share_code, { rotate });
    onMetaChange(loan.groupId, { ...meta, share_code: code });
  });

  const stop = () => run(async () => {
    await loanService.stopSharing(loan.groupId);
    onMetaChange(loan.groupId, { ...meta, share_code: null });
  });

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  }

  return (
    <div className="space-y-5">
      <LoanStatement parcels={parcels} rate={rate} info={info} notes={meta.notes} />

      <Link to={`/expenses?installmentGroup=${loan.groupId}`} className={`${SECONDARY_BTN} w-full`}>
        <ListChecks className="w-4 h-4" /> Marcar parcelas como pagas
      </Link>

      {/* Taxa e observações */}
      <section className="rounded-2xl border border-hairline-light p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display font-bold">Taxa e observações</p>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900 min-h-[44px] px-2 rounded-lg">
              <Pencil className="w-4 h-4" /> Editar
            </button>
          )}
        </div>
        {editing ? (
          <div className="space-y-3 animate-fade-in">
            <div>
              <label className="label">Taxa de juros mensal</label>
              <div className="relative">
                <input type="text" inputMode="decimal" value={rateInput} onChange={(e) => setRateInput(e.target.value)}
                  placeholder="Ex.: 1,5" className="input-field pr-20 font-mono text-right" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">% a.m.</span>
              </div>
              <p className="text-[11px] text-ink-500 mt-1.5">Só informativo — não altera o valor das parcelas já criadas.</p>
            </div>
            <div>
              <label className="label">Observações</label>
              <textarea value={notesInput} onChange={(e) => setNotesInput(e.target.value)} rows={4} maxLength={2000}
                placeholder="Ex.: contrato nº 123, banco X, quitação antecipada com desconto…" className="input-field resize-y" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost min-h-[44px]">Cancelar</button>
              <button type="button" onClick={saveEdit} disabled={busy} className="btn-primary min-h-[44px] disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-500">
            {meta.notes || meta.monthly_rate != null ? 'Aparecem no extrato acima e no link compartilhado.' : 'Adicione a taxa e observações (contrato, banco, combinados).'}
          </p>
        )}
      </section>

      <LoanPeople groupId={loan.groupId} />

      {/* Compartilhar */}
      <section className="rounded-2xl border border-hairline-light p-4 space-y-3">
        <div>
          <p className="font-display font-bold">Compartilhar por link</p>
          <p className="text-sm text-ink-500 mt-0.5">
            Quem abrir o link vê as parcelas em aberto e pagas, a taxa e as observações — sem precisar de conta.
            Categoria e cartão não aparecem.
          </p>
        </div>

        {!link ? (
          <button type="button" onClick={() => share()} disabled={busy} className="btn-accent w-full min-h-[48px] disabled:opacity-60">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />} Criar link
          </button>
        ) : (
          <div className="space-y-2 animate-fade-in">
            <p className="px-3 py-2.5 rounded-xl bg-ink-50 text-xs font-mono text-ink-700 break-all">{link}</p>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={copy} className={SECONDARY_BTN}>
                {copied ? <Check className="w-4 h-4 text-positive" /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Empréstimo “${loan.description}”: ${link}`)}`}
                target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}>
                <MessageCircle className="w-4 h-4" /><span className="hidden sm:inline">WhatsApp</span>
              </a>
              <a href={link} target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}>
                <ExternalLink className="w-4 h-4" /><span className="hidden sm:inline">Abrir</span>
              </a>
            </div>

            {confirm ? (
              <div className="px-3 py-3 rounded-xl bg-surface-soft border border-hairline-light space-y-2">
                <p className="text-sm text-ink-700">
                  {confirm === 'rotate'
                    ? 'O link atual para de funcionar. Quem já recebeu vai precisar do novo.'
                    : 'O link para de funcionar e ninguém mais vê o empréstimo por ele.'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirm(null)} className="btn-ghost min-h-[44px]">Voltar</button>
                  <button type="button" disabled={busy} onClick={() => (confirm === 'rotate' ? share(true) : stop())}
                    className={`${confirm === 'stop' ? 'btn-danger' : 'btn-primary'} min-h-[44px] disabled:opacity-60`}>
                    {confirm === 'rotate' ? 'Gerar novo' : 'Parar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 pt-1">
                <button type="button" onClick={() => setConfirm('rotate')} className="text-xs font-semibold text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5 min-h-[44px]">
                  <RefreshCw className="w-3.5 h-3.5" /> Gerar novo link
                </button>
                <button type="button" onClick={() => setConfirm('stop')} className="text-xs font-semibold text-ink-500 hover:text-negative min-h-[44px]">
                  Parar de compartilhar
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-negative font-medium">{error}</p>}
    </div>
  );
}

/**
 * Quem acompanha o empréstimo dentro do app: o dono convida pelo @nick, a
 * pessoa aceita na aba Empréstimos e passa a ver o extrato (só leitura).
 * Remover/cancelar pede um segundo toque de confirmação.
 */
function LoanPeople({ groupId }) {
  const [people, setPeople] = useState(null);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [confirmKey, setConfirmKey] = useState(null);

  const reload = () => loanService.people(groupId).then(setPeople).catch(() => setPeople({ members: [], invites: [] }));
  useEffect(() => { reload(); }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err.message || 'Não foi possível concluir. Tente de novo.');
    } finally {
      setBusy(false);
      setConfirmKey(null);
    }
  }

  function invite(e) {
    e.preventDefault();
    if (!nick.trim()) return;
    run(async () => {
      await loanService.invite(groupId, nick);
      setNick('');
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    });
  }

  function removeButton(k, label, onConfirm) {
    return confirmKey === k ? (
      <button type="button" disabled={busy} onClick={onConfirm} className="text-xs font-bold text-negative px-2 min-h-[36px] rounded-lg hover:bg-red-50">
        {label}?
      </button>
    ) : (
      <button type="button" onClick={() => setConfirmKey(k)} aria-label={label}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50">
        <X className="w-4 h-4" />
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-hairline-light p-4 space-y-3">
      <div>
        <p className="font-display font-bold flex items-center gap-1.5"><Users className="w-4 h-4" /> Quem acompanha</p>
        <p className="text-sm text-ink-500 mt-0.5">
          Convide outro usuário do Cofre pelo @nick. Depois de aceitar, a pessoa vê este empréstimo na aba Empréstimos (só leitura).
        </p>
      </div>

      {people === null ? (
        <div className="h-10 bg-ink-100 animate-pulse rounded-xl" />
      ) : (people.members.length > 0 || people.invites.length > 0) && (
        <ul className="space-y-1.5">
          {people.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 px-3 py-2 bg-ink-50 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-gradient-dark text-white text-xs font-bold flex items-center justify-center flex-shrink-0 uppercase">
                {(m.display_name || '?').slice(0, 1)}
              </div>
              <p className="text-sm font-bold truncate flex-1">{m.display_name || 'Usuário'}</p>
              {removeButton(`m:${m.user_id}`, 'Remover', () => run(() => loanService.removeMember(groupId, m.user_id)))}
            </li>
          ))}
          {people.invites.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2 bg-ink-50 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-ink-200 text-ink-600 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">@{i.invitee_nick}</p>
                <p className="text-xs text-ink-500">Convite pendente</p>
              </div>
              {removeButton(`i:${i.id}`, 'Cancelar convite', () => run(() => loanService.cancelInvite(i.id)))}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={invite} className="flex gap-2">
        <input type="text" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="@nick da pessoa"
          className="input-field flex-1 min-w-0" autoCapitalize="none" autoCorrect="off" maxLength={22} />
        <button type="submit" disabled={busy || !nick.trim()} className="btn-accent !px-4 flex-shrink-0 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          <span className="hidden sm:inline">{sent ? 'Enviado' : 'Convidar'}</span>
        </button>
      </form>
      {error && <p className="text-sm text-negative font-medium">{error}</p>}
    </section>
  );
}
