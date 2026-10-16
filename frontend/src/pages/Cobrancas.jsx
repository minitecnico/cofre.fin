import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Plus, Trash2, MessageCircle, QrCode, FileText,
  ChevronDown, ChevronRight, KeyRound, Loader2, CheckCircle2, Copy, Check,
  AlertTriangle, Wallet, Share2, CreditCard, Pencil, Star, Link2, X,
  Bell, BellRing, Clock, Send, Lock, Minus, ListChecks, ExternalLink, RefreshCw,
} from 'lucide-react';
import Modal from '../components/Modal';
import Stepper from '../components/Stepper';
import Select from '../components/Select';
import BankLogo from '../components/BankLogo';
import ConfirmDialog from '../components/ConfirmDialog';
import CobrancaQuickForm from '../components/CobrancaQuickForm';
import { CardTag, CardSelect } from '../components/CardTag';
import { useDisclosure } from '../hooks/useDisclosure';
import { useCobrancas } from '../hooks/useCobrancas';
import { formatCurrency, formatDate, parseAmount, todayISO } from '../utils/format';
import { groupCharges, summarizeCharges, baseDescription, isOverdue } from '../utils/charges';
import {
  DAY_MS, CHARGE_STALE_DAYS, CHARGE_DUE_SOON_DAYS, CHARGE_NOTIFY_STORAGE_KEY,
  MAX_INSTALLMENTS, PIX_KEY_TYPES,
} from '../constants';
import { BANKS } from '../constants/banks';
import { buildPixPayload, pixQrCodeDataUrl } from '../services/pix';
import { pixLinkService } from '../services/cobrancas';
import { buildReminderText, waLink, generateChargesPdf } from '../services/cobrancasReport';
import { downloadPdf, shareReportFile } from '../services/reports';

/**
 * Página de Cobranças — a "carteira do credor".
 *
 * Controla quem deve ao usuário (emprestou cartão/dinheiro). Permite:
 *   - cadastrar pessoas e suas dívidas (valor, descrição, vencimento, parcelas)
 *   - ver por pessoa: total da dívida, pago, a pagar, parcelas pagas × faltando
 *   - enviar ao devedor um extrato público e ao vivo (/extrato/:code)
 *   - marcar como pago — pagamento já feito fica TRAVADO (desfazer pede confirmação)
 *   - editar pessoa, cobrança avulsa ou parcelamento inteiro
 *   - PIX (QR / copia-e-cola / link), cobrar via WhatsApp, relatório PDF
 */
export default function Cobrancas() {
  const c = useCobrancas();
  const pixModal = useDisclosure();
  const debtorModal = useDisclosure();
  const addChargeModal = useDisclosure();
  const [qrTarget, setQrTarget] = useState(null);     // { name, openAmount, phone } p/ modal QR
  const [chargeTarget, setChargeTarget] = useState(null); // devedor p/ nova cobrança
  const [editTarget, setEditTarget] = useState(null);     // cobrança em edição
  const [groupTarget, setGroupTarget] = useState(null);   // parcelamento em edição
  const [debtorEdit, setDebtorEdit] = useState(null);     // pessoa em edição
  const [shareTarget, setShareTarget] = useState(null);   // pessoa p/ enviar extrato
  const [confirmReq, setConfirmReq] = useState(null);     // diálogo de confirmação (trava)
  const [pdfBusy, setPdfBusy] = useState(false);
  // Seleção: uma pessoa por vez. debtorId != null = modo seleção ativo nela.
  const [sel, setSel] = useState({ debtorId: null, ids: EMPTY_SET });

  const pixReady = c.pix?.pixKey && c.pix?.pixName && c.pix?.pixCity;

  // ── Painel de alertas: quem precisa ser cobrado (vencido / vencendo) ──
  // Ordena por urgência e prioriza os "stale" (sem lembrete recente).
  const attention = useMemo(() => {
    return c.summary
      .map((d) => ({ ...d, ...debtorStatus(d) }))
      .filter((d) => d.urgency === 'overdue' || d.urgency === 'due-soon')
      .sort((a, b) => {
        const rank = { overdue: 0, 'due-soon': 1 };
        return (rank[a.urgency] - rank[b.urgency])
          || (Number(b.stale) - Number(a.stale))
          || (b.overdueAmount - a.overdueAmount);
      });
  }, [c.summary]);

  // ── Notificações do navegador (opt-in) ──────────────────────────────
  const [notifyPerm, setNotifyPerm] = useState(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  );

  const fireDebtorNotification = useCallback((list) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !list.length) return;
    const total = list.reduce((s, d) => s + (d.overdueAmount || d.openAmount), 0);
    const n = list.length;
    try {
      new Notification('Cobranças pendentes', {
        body: `${n} ${n === 1 ? 'pessoa' : 'pessoas'} pra cobrar · ${formatCurrency(total)} em aberto`,
        icon: '/icons/icon-192.png',
        tag: 'cofre-cobrancas',
      });
    } catch { /* ignora */ }
  }, []);

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setNotifyPerm(p);
    if (p === 'granted') fireDebtorNotification(attention.filter((d) => d.stale));
  }

  // Lembrete automático uma vez por dia, se já autorizado e há vencidas "stale".
  useEffect(() => {
    if (notifyPerm !== 'granted') return;
    const stale = attention.filter((d) => d.stale && d.urgency === 'overdue');
    if (!stale.length) return;
    const today = todayISO();
    try {
      if (localStorage.getItem(CHARGE_NOTIFY_STORAGE_KEY) === today) return;
      localStorage.setItem(CHARGE_NOTIFY_STORAGE_KEY, today);
    } catch { return; }
    fireDebtorNotification(stale);
  }, [notifyPerm, attention, fireDebtorNotification]);

  // ── Seleção ─────────────────────────────────────────────────────────
  // O modo seleção é explícito (botão "Selecionar"): fora dele a linha só tem
  // o botão de pago, sem duas caixinhas lado a lado competindo pelo toque.
  const startSelect = (debtorId) => setSel({ debtorId, ids: EMPTY_SET });
  const selectOnly = (debtorId, ids) => setSel({ debtorId, ids: new Set(ids) });
  const clearSel = () => setSel({ debtorId: null, ids: EMPTY_SET });
  function toggleSelect(debtorId, ids) {
    setSel((prev) => {
      const next = new Set(prev.debtorId === debtorId ? prev.ids : []);
      const allOn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return { debtorId, ids: next };
    });
  }

  const activeDebtor = sel.debtorId ? c.summary.find((d) => d.debtorId === sel.debtorId) : null;
  const selectedCharges = activeDebtor
    ? (c.chargesByDebtor.get(sel.debtorId) || []).filter((ch) => sel.ids.has(ch.id))
    : [];
  const selSum = selectedCharges.reduce((s, x) => s + Number(x.amount), 0);

  function handleBulkDelete() {
    setConfirmReq({
      title: `Excluir ${selectedCharges.length} cobrança(s)?`,
      message: (
        <>
          Total de <b className="text-ink-900">{formatCurrency(selSum)}</b> de {activeDebtor.name}.
          {' '}Não dá pra desfazer.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
      onConfirm: async () => { await c.removeCharges([...sel.ids]); clearSel(); },
    });
  }

  // ── Trava de pagamento ──────────────────────────────────────────────
  // Marcar como pago é imediato. Já PAGO fica travado: desfazer exige
  // confirmação explícita, pra um toque sem querer não "reabrir" a dívida.
  function handleTogglePaid(charge) {
    if (!charge.paid) { c.setChargePaid(charge.id, true); return; }
    setConfirmReq({
      title: 'Desfazer pagamento?',
      message: (
        <>
          <b className="text-ink-900">{chargeLabel(charge)}</b> ({formatCurrency(charge.amount)}) foi marcada como paga
          {charge.paid_at ? <> em <b className="text-ink-900">{formatDate(charge.paid_at, 'long')}</b></> : null}.
          {' '}Ela volta a contar como valor a receber.
        </>
      ),
      confirmLabel: 'Desfazer pagamento',
      onConfirm: () => c.setChargePaid(charge.id, false),
    });
  }

  function handleRemoveCharge(charge) {
    setConfirmReq({
      title: 'Excluir cobrança?',
      message: (
        <>
          <b className="text-ink-900">{chargeLabel(charge)}</b> — {formatCurrency(charge.amount)}.
          {' '}Não dá pra desfazer.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
      onConfirm: () => c.removeCharge(charge.id),
    });
  }

  function handleRemoveDebtor(debtor) {
    const count = (c.chargesByDebtor.get(debtor.debtorId) || []).length;
    setConfirmReq({
      title: `Remover ${debtor.name}?`,
      message: count
        ? <>Apaga a pessoa e <b className="text-ink-900">todas as {count} cobrança(s)</b> dela, inclusive o histórico de pagamentos. Não dá pra desfazer.</>
        : 'A pessoa será removida. Não dá pra desfazer.',
      confirmLabel: 'Remover',
      tone: 'danger',
      onConfirm: () => c.removeDebtor(debtor.debtorId),
    });
  }

  // Monta o payload do relatório e gera PDF (download ou compartilhar)
  const handlePdf = useCallback(async (share) => {
    setPdfBusy(true);
    try {
      const debtors = c.summary
        .filter((d) => d.openCount > 0 || (c.chargesByDebtor.get(d.debtorId) || []).length > 0)
        .map((d) => {
          const charges = c.chargesByDebtor.get(d.debtorId) || [];
          const open = charges.filter((x) => !x.paid);
          const reminderText = pixReady
            ? buildReminderText(d.name, open, {
                pixPayload: buildPixPayload({
                  key: c.pix.pixKey, keyType: c.pix.pixKeyType, name: c.pix.pixName, city: c.pix.pixCity,
                  amount: d.openAmount,
                }),
                ownerName: c.pix.pixName,
              })
            : buildReminderText(d.name, open);
          return {
            name: d.name,
            phone: d.phone,
            openAmount: d.openAmount,
            overdueAmount: d.overdueAmount,
            charges,
            reminderText,
          };
        });

      const report = { debtors, totalOpen: c.totals.open, totalOverdue: c.totals.overdue };
      const { blob, filename } = generateChargesPdf(report);

      if (share) {
        const res = await shareReportFile({ blob, filename, text: 'Relatório de cobranças' });
        if (res === 'unsupported') downloadPdf(blob, filename);
      } else {
        downloadPdf(blob, filename);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPdfBusy(false);
    }
  }, [c.summary, c.chargesByDebtor, c.totals, c.pix, pixReady]);

  // Cobrar um devedor via WhatsApp → e marca as dívidas abertas como cobradas.
  function handleCharge(debtor) {
    const charges = c.chargesByDebtor.get(debtor.debtorId) || [];
    const open = charges.filter((x) => !x.paid);
    if (open.length === 0) return;
    const pixPayload = pixReady
      ? buildPixPayload({
          key: c.pix.pixKey, keyType: c.pix.pixKeyType, name: c.pix.pixName, city: c.pix.pixCity,
          amount: debtor.openAmount,
        })
      : undefined;
    const text = buildReminderText(debtor.name, open, { pixPayload, ownerName: c.pix?.pixName });
    window.open(waLink(debtor.phone, text), '_blank', 'noopener');
    c.markCharged(open.map((x) => x.id)); // sinaliza "cobrado" (evita cobrar 2-3x)
  }

  // Gera PIX (QR + link) só das parcelas/cobranças selecionadas → abre o modal.
  // Leva os ids junto pra marcar como cobrado quando o link for enviado.
  function handleGenPixForCharges(debtor, selected) {
    const open = selected.filter((x) => !x.paid);
    setQrTarget({
      name: debtor.name, phone: debtor.phone,
      openAmount: open.reduce((s, x) => s + Number(x.amount), 0),
      chargeIds: open.map((x) => x.id),
    });
  }

  // Relatório PDF só das cobranças selecionadas de um devedor
  function handleReportCharges(debtor, selected) {
    const open = selected.filter((x) => !x.paid);
    const openSum = open.reduce((s, x) => s + Number(x.amount), 0);
    const reminderText = pixReady
      ? buildReminderText(debtor.name, open, {
          pixPayload: buildPixPayload({
            key: c.pix.pixKey, keyType: c.pix.pixKeyType, name: c.pix.pixName, city: c.pix.pixCity,
            amount: openSum,
          }),
          ownerName: c.pix.pixName,
        })
      : buildReminderText(debtor.name, open);
    const overdueSum = open
      .filter((x) => isOverdue(x))
      .reduce((s, x) => s + Number(x.amount), 0);
    const report = {
      debtors: [{
        name: debtor.name, phone: debtor.phone,
        openAmount: openSum, overdueAmount: overdueSum,
        charges: selected, reminderText,
      }],
      totalOpen: openSum,
      totalOverdue: overdueSum,
    };
    const { blob, filename } = generateChargesPdf(report);
    downloadPdf(blob, filename);
  }

  return (
    <div className="space-y-5 pb-6 animate-fade-in">
      {/* Cabeçalho */}
      <div data-tour="page-header" className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Cobranças</h1>
          <p className="text-ink-500 text-sm mt-1 truncate">Controle quem te deve e cobre pelo WhatsApp.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={addChargeModal.open} className="btn-accent min-h-[44px] px-3.5 flex items-center gap-1.5 whitespace-nowrap">
            <Plus className="w-4 h-4" /> Cobrança
          </button>
          <button onClick={debtorModal.open} className="btn-primary min-h-[44px] px-3.5 flex items-center gap-1.5 whitespace-nowrap">
            <Plus className="w-4 h-4" /> Pessoa
          </button>
        </div>
      </div>

      {/* Resumo de totais */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SummaryTile label="A receber" value={formatCurrency(c.totals.open)} icon={Wallet} tone="neutral" />
        <SummaryTile label="Vencido" value={formatCurrency(c.totals.overdue)} icon={AlertTriangle} tone={c.totals.overdue > 0 ? 'negative' : 'neutral'} />
        <SummaryTile label="Já recebido" value={formatCurrency(c.totals.paid)} icon={CheckCircle2} tone="positive" />
      </div>

      {/* Barra de ações: PIX + PDF */}
      <div className="flex flex-wrap gap-2">
        <button onClick={pixModal.open} className="btn-ghost min-h-[44px] flex items-center gap-2 flex-1 justify-center">
          <KeyRound className="w-4 h-4" />
          {c.pixKeys.length ? `Chaves PIX (${c.pixKeys.length})` : 'Cadastrar PIX'}
        </button>
        <button onClick={() => handlePdf(false)} disabled={pdfBusy || c.summary.length === 0} className="btn-ghost min-h-[44px] flex items-center gap-2 flex-1 justify-center disabled:opacity-50">
          {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Relatório PDF
        </button>
        <button onClick={() => handlePdf(true)} disabled={pdfBusy || c.summary.length === 0} className="btn-ghost min-h-[44px] w-12 flex items-center justify-center disabled:opacity-50" title="Compartilhar PDF">
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Painel de alertas: quem cobrar hoje */}
      {attention.length > 0 && (
        <AttentionPanel
          debtors={attention}
          onCharge={handleCharge}
          notifyPerm={notifyPerm}
          onEnableNotify={enableNotifications}
        />
      )}

      {c.error && <p className="text-sm text-negative font-medium">{c.error}</p>}

      {/* Lista de devedores */}
      {c.loading ? (
        <div className="card-flat p-8 text-center text-ink-500 text-sm">Carregando…</div>
      ) : c.summary.length === 0 ? (
        <EmptyState onAdd={debtorModal.open} />
      ) : (
        <div className="space-y-3">
          {c.summary.map((d) => (
            <DebtorCard
              key={d.debtorId}
              debtor={d}
              charges={c.chargesByDebtor.get(d.debtorId) || []}
              onAddCharge={() => setChargeTarget(d)}
              onCharge={() => handleCharge(d)}
              onShowQr={() => setQrTarget({
                ...d,
                chargeIds: (c.chargesByDebtor.get(d.debtorId) || []).filter((x) => !x.paid).map((x) => x.id),
              })}
              onShare={() => setShareTarget(d)}
              onEditDebtor={() => setDebtorEdit(d)}
              onRemoveDebtor={() => handleRemoveDebtor(d)}
              onTogglePaid={handleTogglePaid}
              onEditCharge={setEditTarget}
              onEditGroup={setGroupTarget}
              onRemoveCharge={handleRemoveCharge}
              selecting={sel.debtorId === d.debtorId}
              selectedIds={sel.debtorId === d.debtorId ? sel.ids : EMPTY_SET}
              onStartSelect={() => startSelect(d.debtorId)}
              onSelectOnly={(ids) => selectOnly(d.debtorId, ids)}
              onToggleSelect={(ids) => toggleSelect(d.debtorId, ids)}
              onEndSelect={clearSel}
            />
          ))}
        </div>
      )}

      {/* ── Modais ─────────────────────────────────────────── */}
      <PixKeysModal
        isOpen={pixModal.isOpen}
        onClose={pixModal.close}
        keys={c.pixKeys}
        onAdd={c.addPixKey}
        onRemove={c.removePixKey}
        onSetDefault={c.setDefaultPixKey}
      />
      <DebtorModal isOpen={debtorModal.isOpen} onClose={debtorModal.close} onSave={c.addDebtor} />
      <EditDebtorModal debtor={debtorEdit} onClose={() => setDebtorEdit(null)} onSave={c.updateDebtor} />
      <ShareStatementModal
        debtor={shareTarget}
        charges={shareTarget ? c.chargesByDebtor.get(shareTarget.debtorId) || [] : []}
        getLink={c.shareDebtorLink}
        onClose={() => setShareTarget(null)}
      />

      {/* Cadastrar cobrança direto (escolhe/cria a pessoa) */}
      <Modal isOpen={addChargeModal.isOpen} onClose={addChargeModal.close} title="Nova cobrança">
        <CobrancaQuickForm
          onSaved={() => { addChargeModal.close(); c.reload(); }}
          onCancel={addChargeModal.close}
        />
      </Modal>
      <ChargeModal
        debtor={chargeTarget}
        cards={c.cards}
        onClose={() => setChargeTarget(null)}
        onSave={c.addCharge}
        onSaveInstallments={c.addInstallments}
      />
      <EditChargeModal
        charge={editTarget}
        cards={c.cards}
        onClose={() => setEditTarget(null)}
        onSave={c.updateCharge}
      />
      <EditGroupModal
        group={groupTarget}
        cards={c.cards}
        onClose={() => setGroupTarget(null)}
        onSave={c.updateChargeGroup}
      />
      <PixQrModal
        target={qrTarget}
        pixKey={c.activePixKey}
        pixReady={pixReady}
        onClose={() => setQrTarget(null)}
        onConfigure={() => { setQrTarget(null); pixModal.open(); }}
        onSent={(ids) => c.markCharged(ids)}
      />
      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />

      {/* Barra de seleção FLUTUANTE — sempre visível, sem rolar a tela */}
      {sel.ids.size > 0 && activeDebtor && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-[5.5rem] md:bottom-6 z-40 w-[calc(100%-1.5rem)] max-w-md animate-slide-up"
        >
          <div className="bg-ink-900 text-white rounded-2xl shadow-soft-xl px-3 py-2.5 flex items-center gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate leading-tight">{sel.ids.size} selec. · {formatCurrency(selSum)}</p>
              <p className="text-[10px] text-ink-400 truncate">{activeDebtor.name}</p>
            </div>
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              {pixReady && selectedCharges.some((x) => !x.paid) && (
                <button onClick={() => handleGenPixForCharges(activeDebtor, selectedCharges)} className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-xl bg-accent text-ink-900 font-bold text-xs hover:bg-accent-light transition-colors" title="Gerar PIX das pendentes selecionadas">
                  <QrCode className="w-4 h-4" /> PIX
                </button>
              )}
              <button onClick={() => handleReportCharges(activeDebtor, selectedCharges)} className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 text-white hover:bg-white/25 transition-colors" title="PDF das selecionadas">
                <FileText className="w-4 h-4" />
              </button>
              <button onClick={handleBulkDelete} className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-negative text-white hover:opacity-90 transition-opacity" title="Excluir selecionadas">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={clearSel} className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Sair da seleção">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Subcomponentes
// ───────────────────────────────────────────────────────────────

function SummaryTile({ label, value, icon: Icon, tone }) {
  const toneClass = { positive: 'text-positive', negative: 'text-negative', neutral: 'text-ink-900' }[tone] || 'text-ink-900';
  return (
    <div className="card-flat p-3">
      <div className="flex items-center gap-1.5 text-ink-500">
        <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`font-display font-bold text-lg mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="card-flat p-8 text-center">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-accent/20 flex items-center justify-center">
        <Users className="w-7 h-7 text-ink-900" strokeWidth={2.25} />
      </div>
      <p className="font-display font-bold text-base text-ink-900">Nenhuma cobrança ainda</p>
      <p className="text-xs text-ink-500 mt-1 mb-4">Cadastre quem te deve pra começar a controlar.</p>
      <button onClick={onAdd} className="btn-primary inline-flex items-center gap-2 min-h-[44px]">
        <Plus className="w-4 h-4" /> Adicionar pessoa
      </button>
    </div>
  );
}

/**
 * Painel de alertas — quem precisa ser cobrado (vencido/vencendo).
 * Esquema de cores por urgência + selo do último lembrete (pra não cobrar 2-3x).
 */
function AttentionPanel({ debtors, onCharge, notifyPerm, onEnableNotify }) {
  const total = debtors.reduce((s, d) => s + d.openAmount, 0);
  const accent = debtors[0].urgency === 'overdue' ? 'border-negative' : 'border-warn';
  const canNotify = notifyPerm !== 'unsupported';

  return (
    <div className={`card-flat overflow-hidden border-l-4 ${accent} animate-slide-up`}>
      <div className="p-3 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
          <BellRing className="w-[18px] h-[18px] text-negative" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-ink-900">Pra cobrar</p>
          <p className="text-[11px] text-ink-500">{debtors.length} pessoa(s) · {formatCurrency(total)} em aberto</p>
        </div>
        {canNotify && notifyPerm !== 'granted' && (
          <button onClick={onEnableNotify} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-ink-100 text-ink-700 font-bold text-[11px] hover:bg-ink-200 transition-colors flex-shrink-0" title="Receber lembretes no navegador">
            <Bell className="w-3.5 h-3.5" /> Notificar
          </button>
        )}
      </div>
      <div className="divide-y divide-ink-100 border-t border-ink-100">
        {debtors.map((d) => {
          const u = URGENCY[d.urgency];
          const charged = d.since === 0; // cobrado hoje
          return (
            <div key={d.debtorId} className="px-3 py-2.5 flex items-center gap-2.5">
              <span className={`w-1.5 h-9 rounded-full flex-shrink-0 ${u.bar}`} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-ink-900 truncate">{d.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${u.pill}`}>
                    {d.urgency === 'overdue' ? `${d.overdueCount} vencida(s)` : u.label}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${reminderTone(d.lastChargedAt)}`}>
                    {reminderLabel(d.lastChargedAt) || 'Nunca cobrado'}
                  </span>
                </div>
              </div>
              <span className="font-mono font-bold text-sm text-ink-900 flex-shrink-0">{formatCurrency(d.openAmount)}</span>
              <button
                onClick={() => onCharge(d)}
                className={`inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-xl font-bold text-xs transition-colors flex-shrink-0 ${
                  charged ? 'bg-ink-100 text-ink-500' : 'bg-positive text-white hover:opacity-90'
                }`}
                title={charged ? 'Já cobrado hoje' : 'Cobrar pelo WhatsApp'}
              >
                {charged ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {charged ? 'Feito' : 'Cobrar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const EMPTY_SET = new Set();

/** Nome curto de uma cobrança: "Notebook · parcela 2/6" ou a descrição. */
function chargeLabel(charge) {
  return charge.installment_total > 1
    ? `${baseDescription(charge.description)} · parcela ${charge.installment_number}/${charge.installment_total}`
    : charge.description;
}

// ── Status de cobrança / lembretes ─────────────────────────────
// Esquema de cores e textos pra sinalizar o que já foi cobrado (evita cobrar
// a mesma pessoa 2-3x) e o que precisa de atenção (vencido / vencendo).
function daysSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

/** Texto curto do último lembrete enviado, ou null se nunca cobrado. */
function reminderLabel(iso) {
  const d = daysSince(iso);
  if (d == null) return null;
  if (d <= 0) return 'Cobrado hoje';
  if (d === 1) return 'Cobrado ontem';
  return `Cobrado há ${d}d`;
}

/** Tom do "selo" de lembrete: nunca (neutro) · recente (verde) · faz tempo (âmbar). */
function reminderTone(iso) {
  const d = daysSince(iso);
  if (d == null) return 'bg-ink-100 text-ink-500';
  if (d < CHARGE_STALE_DAYS) return 'bg-emerald-50 text-positive';
  return 'bg-amber-50 text-warn';
}

/**
 * Urgência do devedor → cores e ordenação dos alertas.
 *   overdue  vermelho · due-soon âmbar · open neutro · settled verde
 * `stale`: vencido/vencendo e sem lembrete recente → entra no painel de alertas.
 */
function debtorStatus(d) {
  if (!d.openCount) return { urgency: 'settled', stale: false, since: null };
  let urgency = 'open';
  if (d.overdueCount > 0) urgency = 'overdue';
  else if (d.nextDue) {
    const diff = Math.ceil((new Date(`${d.nextDue}T00:00:00`).getTime() - Date.now()) / DAY_MS);
    if (diff <= CHARGE_DUE_SOON_DAYS) urgency = 'due-soon';
  }
  const since = daysSince(d.lastChargedAt);
  const recently = since != null && since < CHARGE_STALE_DAYS;
  const stale = (urgency === 'overdue' || urgency === 'due-soon') && !recently;
  return { urgency, stale, since };
}

const URGENCY = {
  overdue:    { bar: 'bg-negative',  pill: 'bg-red-50 text-negative',     label: 'Vencido' },
  'due-soon': { bar: 'bg-warn',      pill: 'bg-amber-50 text-warn',       label: 'Vence em breve' },
  open:       { bar: 'bg-ink-200',   pill: 'bg-ink-100 text-ink-600',     label: 'Em dia' },
  settled:    { bar: 'bg-positive',  pill: 'bg-emerald-50 text-positive', label: 'Quitado' },
};

function DebtorCard({
  debtor, charges, onAddCharge, onCharge, onShowQr, onShare, onEditDebtor, onRemoveDebtor,
  onTogglePaid, onEditCharge, onEditGroup, onRemoveCharge,
  selecting, selectedIds = EMPTY_SET, onStartSelect, onSelectOnly, onToggleSelect, onEndSelect,
}) {
  const [open, setOpen] = useState(false);
  const hasOverdue = debtor.overdueCount > 0;
  const st = debtorStatus(debtor);
  const chargedToday = st.since === 0;        // já cobrado hoje
  const hasDebt = debtor.openCount > 0;
  const wallet = useMemo(() => summarizeCharges(charges), [charges]);
  const groups = useMemo(() => groupCharges(charges), [charges]);
  const pendingIds = charges.filter((x) => !x.paid).map((x) => x.id);

  return (
    <div className={`card-flat overflow-hidden border-l-4 ${
      hasDebt ? (st.urgency === 'overdue' ? 'border-negative' : st.urgency === 'due-soon' ? 'border-warn' : 'border-ink-200') : 'border-positive'
    }`}>
      {/* Cabeçalho do devedor */}
      <div className="p-3 flex items-center gap-3">
        <button onClick={() => setOpen((v) => !v)} className="flex-1 flex items-center gap-3 text-left min-w-0">
          <div className="w-9 h-9 rounded-xl bg-ink-100 flex items-center justify-center flex-shrink-0">
            {open ? <ChevronDown className="w-4 h-4 text-ink-600" /> : <ChevronRight className="w-4 h-4 text-ink-600" />}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-ink-900 truncate">{debtor.name}</p>
            <div className="flex items-center gap-2 text-xs mt-0.5">
              <span className="font-mono font-bold text-ink-700">{formatCurrency(debtor.openAmount)}</span>
              {hasOverdue && (
                <span className="inline-flex items-center gap-1 text-negative font-semibold">
                  <AlertTriangle className="w-3 h-3" /> {debtor.overdueCount} vencida(s)
                </span>
              )}
              {debtor.nextDue && !hasOverdue && (
                <span className="text-ink-400">vence {formatDate(debtor.nextDue, 'long')}</span>
              )}
            </div>
            {/* Selo do último lembrete — sinaliza o que já foi cobrado */}
            {hasDebt && (
              <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${reminderTone(debtor.lastChargedAt)}`}>
                <Clock className="w-2.5 h-2.5" /> {reminderLabel(debtor.lastChargedAt) || 'Nunca cobrado'}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Ações rápidas */}
      <div className="px-3 pb-3 flex flex-wrap gap-1.5">
        <button
          onClick={onCharge}
          disabled={!hasDebt}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg font-bold text-xs transition-colors disabled:opacity-40 ${
            chargedToday ? 'bg-ink-100 text-ink-500' : 'bg-positive/10 text-positive hover:bg-positive/20'
          }`}
          title={chargedToday ? 'Já cobrado hoje' : 'Cobrar pelo WhatsApp'}
        >
          {chargedToday ? <Check className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
          {chargedToday ? 'Cobrado hoje' : 'Cobrar'}
        </button>
        <button onClick={onShowQr} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-ink-100 text-ink-700 font-bold text-xs hover:bg-ink-200 transition-colors">
          <QrCode className="w-3.5 h-3.5" /> PIX QR
        </button>
        <button onClick={onShare} disabled={!charges.length} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-ink-100 text-ink-700 font-bold text-xs hover:bg-ink-200 transition-colors disabled:opacity-40" title="Enviar extrato ao devedor">
          <Share2 className="w-3.5 h-3.5" /> Extrato
        </button>
        <button onClick={onAddCharge} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-ink-100 text-ink-700 font-bold text-xs hover:bg-ink-200 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Cobrança
        </button>
        <div className="ml-auto flex gap-0.5">
          <button onClick={onEditDebtor} className="inline-flex items-center justify-center w-9 min-h-[36px] rounded-lg text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors" title="Editar pessoa">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemoveDebtor} className="inline-flex items-center justify-center w-9 min-h-[36px] rounded-lg text-ink-400 hover:text-negative hover:bg-red-50 transition-colors" title="Remover pessoa">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Carteira + lista de cobranças (expandida) */}
      {open && (
        <div className="border-t border-ink-100 animate-slide-up">
          {charges.length === 0 ? (
            <p className="p-3 text-xs text-ink-400 text-center">Sem cobranças. Use “Cobrança” pra adicionar.</p>
          ) : (
            <>
              <WalletSummary wallet={wallet} />

              <SelectionToolbar
                selecting={selecting}
                total={charges.length}
                pendingCount={pendingIds.length}
                selectedCount={selectedIds.size}
                onStart={onStartSelect}
                onPending={() => onSelectOnly(pendingIds)}
                onNone={() => onSelectOnly([])}
                onDone={onEndSelect}
              />

              {/* Cada cobrança é um bloco. Parcelamento vira um bloco agrupado. */}
              <div className="px-3 pb-3 space-y-2">
                {groups.map((g) => (
                  <ChargeBlock
                    key={g.groupId || g.items[0].id}
                    group={g}
                    selecting={selecting}
                    selected={selectedIds}
                    onToggleSelect={onToggleSelect}
                    onTogglePaid={onTogglePaid}
                    onEdit={onEditCharge}
                    onEditGroup={onEditGroup}
                    onRemove={onRemoveCharge}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Carteira do devedor: total da dívida, pago, a pagar e progresso. Os mesmos
 * números aparecem no extrato público que ele recebe (utils/charges).
 */
function WalletSummary({ wallet }) {
  return (
    <div className="p-3 space-y-2.5">
      <div className="grid grid-cols-3 gap-2">
        <WalletStat label="Total da dívida" value={wallet.total} />
        <WalletStat label="Pago" value={wallet.paid} tone="text-positive" />
        <WalletStat label="A pagar" value={wallet.open} tone={wallet.overdue > 0 ? 'text-negative' : 'text-ink-900'} />
      </div>
      <div>
        <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
          <div className="h-full rounded-full bg-positive transition-all duration-500" style={{ width: `${wallet.progress}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-ink-500">
          <span className="truncate">
            <b className="text-ink-800">{wallet.paidCount}</b> de {wallet.count} pagas · faltam <b className="text-ink-800">{wallet.openCount}</b>
            {wallet.overdueCount > 0 && <span className="text-negative font-semibold"> · {wallet.overdueCount} vencida(s)</span>}
          </span>
          <span className="font-bold text-ink-800 flex-shrink-0">{wallet.progress}%</span>
        </div>
      </div>
    </div>
  );
}

function WalletStat({ label, value, tone = 'text-ink-900' }) {
  return (
    <div className="rounded-xl bg-ink-50 px-2.5 py-2 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500 leading-tight">{label}</p>
      <p className={`font-display font-bold text-[13px] sm:text-sm truncate ${tone}`}>{formatCurrency(value)}</p>
    </div>
  );
}

/**
 * Barra de seleção dentro do card. Fora do modo seleção é só um botão discreto;
 * dentro dele, atalhos "Todas pendentes" e "Nenhuma". Pagas ficam travadas e
 * nunca entram na seleção — só o que está em aberto pode ser selecionado.
 */
function SelectionToolbar({ selecting, total, pendingCount, selectedCount, onStart, onPending, onNone, onDone }) {
  if (!selecting) {
    return (
      <div className="px-3 pb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">{total} cobrança(s)</span>
        <button onClick={onStart} disabled={pendingCount === 0} className="inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg text-ink-600 font-bold text-xs hover:bg-ink-100 transition-colors disabled:opacity-40" title={pendingCount === 0 ? 'Tudo pago — nada a selecionar' : 'Selecionar pendentes'}>
          <ListChecks className="w-3.5 h-3.5" /> Selecionar
        </button>
      </div>
    );
  }
  const chip = 'px-2.5 min-h-[32px] rounded-full text-[11px] font-bold transition-colors whitespace-nowrap';
  return (
    <div className="px-3 pb-2 flex items-center gap-1.5 overflow-x-auto">
      <span className="text-[11px] font-bold text-ink-900 mr-0.5 whitespace-nowrap">{selectedCount} selec.</span>
      {pendingCount > 0 && (
        <button onClick={onPending} className={`${chip} bg-accent/20 text-ink-900 hover:bg-accent/30`}>Todas pendentes ({pendingCount})</button>
      )}
      {selectedCount > 0 && (
        <button onClick={onNone} className={`${chip} bg-ink-100 text-ink-700 hover:bg-ink-200`}>Nenhuma</button>
      )}
      <button onClick={onDone} className={`${chip} ml-auto text-ink-500 hover:text-ink-900 hover:bg-ink-100`}>Concluir</button>
    </div>
  );
}

/** Bloco de uma cobrança (avulsa) ou de um parcelamento (agrupado). */
function ChargeBlock({ group, selecting, selected, onToggleSelect, onTogglePaid, onEdit, onEditGroup, onRemove }) {
  const rowProps = { selecting, onTogglePaid, onEdit, onRemove };

  if (group.type === 'single') {
    const ch = group.items[0];
    return (
      <div className="rounded-xl border border-ink-200 overflow-hidden bg-white shadow-soft">
        <ChargeRow charge={ch} selected={selected.has(ch.id)} onToggleSelect={() => onToggleSelect([ch.id])} {...rowProps} />
      </div>
    );
  }

  // Parcelamento — bloco com cabeçalho (resumo + seleção/edição do grupo) + parcelas
  const items = group.items;
  const ids = items.filter((x) => !x.paid).map((x) => x.id); // pagas: travadas
  const w = summarizeCharges(items);
  const n = items[0].installment_total || items.length;
  const selCount = ids.filter((id) => selected.has(id)).length;

  return (
    <div className="rounded-xl border border-ink-200 overflow-hidden bg-white shadow-soft">
      <div className="px-3 py-2 bg-ink-50 flex items-center gap-2.5">
        {selecting && ids.length > 0 && (
          <button onClick={() => onToggleSelect(ids)} className="-m-2 p-2 flex-shrink-0" aria-label="Selecionar parcelamento">
            <SelectBox checked={selCount === ids.length} partial={selCount > 0 && selCount < ids.length} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900 truncate">{baseDescription(items[0].description)}</p>
          <p className="text-[11px] text-ink-500">
            {n}x · {formatCurrency(w.total)} · <b className="text-ink-700">{w.paidCount}/{n} pagas</b>
            {w.openCount > 0 && <> · faltam {w.openCount} ({formatCurrency(w.open)})</>}
          </p>
        </div>
        {items[0].credit_card
          ? <CardTag card={items[0].credit_card} className="flex-shrink-0" />
          : <CreditCard className="w-4 h-4 text-ink-400 flex-shrink-0" />}
        {!selecting && (
          <button onClick={() => onEditGroup(group)} className="w-8 h-8 -mr-1 rounded-lg text-ink-400 hover:text-ink-900 hover:bg-ink-100 flex items-center justify-center flex-shrink-0" title="Editar parcelamento">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="divide-y divide-ink-50">
        {items.map((ch) => (
          <ChargeRow key={ch.id} charge={ch} selected={selected.has(ch.id)} onToggleSelect={() => onToggleSelect([ch.id])} {...rowProps} />
        ))}
      </div>
    </div>
  );
}

/** Caixinha de seleção (visual). `partial` = parte do grupo selecionada. */
function SelectBox({ checked, partial = false }) {
  const on = checked || partial;
  const Icon = partial && !checked ? Minus : Check;
  return (
    <span className={`w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
      on ? 'bg-ink-900 text-white' : 'border-2 border-ink-300 text-transparent'
    }`}>
      <Icon className="w-3.5 h-3.5" strokeWidth={3} />
    </span>
  );
}

function ChargeRow({ charge, selecting, selected, onToggleSelect, onTogglePaid, onEdit, onRemove }) {
  const overdue = isOverdue(charge);
  // Em parcelamento o nome base fica no cabeçalho do bloco; a linha mostra a parcela.
  const label = charge.installment_total > 1
    ? `Parcela ${charge.installment_number}/${charge.installment_total}`
    : charge.description;

  const info = (
    <div className="min-w-0 flex-1">
      <p className={`text-sm font-medium truncate ${charge.paid ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
        {label}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {charge.paid ? (
          <p className="inline-flex items-center gap-1 text-xs text-positive font-semibold">
            <Lock className="w-3 h-3" /> Pago{charge.paid_at ? ` em ${formatDate(charge.paid_at, 'long')}` : ''}
          </p>
        ) : charge.due_date && (
          <p className={`text-xs ${overdue ? 'text-negative font-semibold' : 'text-ink-400'}`}>
            {overdue ? 'Venceu ' : 'Vence '}{formatDate(charge.due_date, 'long')}
          </p>
        )}
        {/* Tarja do cartão (só em avulsas; no parcelamento ela fica no cabeçalho) */}
        {!(charge.installment_total > 1) && charge.credit_card && (
          <CardTag card={charge.credit_card} />
        )}
        {/* Sinaliza que esta cobrança já foi cobrada (evita cobrar 2-3x) */}
        {!charge.paid && charge.last_charged_at && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${reminderTone(charge.last_charged_at)}`}>
            <Clock className="w-2.5 h-2.5" /> {reminderLabel(charge.last_charged_at)}
          </span>
        )}
      </div>
    </div>
  );
  const amount = (
    <span className={`font-mono font-bold text-sm flex-shrink-0 ${charge.paid ? 'text-ink-400' : 'text-ink-900'}`}>
      {formatCurrency(charge.amount)}
    </span>
  );

  // Paga = travada: não seleciona, não edita, não exclui. A única saída é
  // "desfazer pagamento" (botão verde), que pede confirmação.
  if (selecting && charge.paid) {
    return (
      <div className="w-full p-3 flex items-center gap-2.5 opacity-60" title="Paga — travada">
        <span className="w-[22px] h-[22px] rounded-md bg-ink-100 flex items-center justify-center flex-shrink-0">
          <Lock className="w-3 h-3 text-ink-400" />
        </span>
        {info}
        {amount}
      </div>
    );
  }

  // Modo seleção: a linha inteira é o alvo do toque (só a caixinha à esquerda).
  if (selecting) {
    return (
      <button
        type="button"
        onClick={onToggleSelect}
        className={`w-full p-3 flex items-center gap-2.5 text-left transition-colors ${selected ? 'bg-accent/10' : 'hover:bg-ink-50'}`}
        aria-pressed={selected}
      >
        <SelectBox checked={selected} />
        {info}
        {amount}
      </button>
    );
  }

  return (
    <div className="p-3 flex items-center gap-2.5">
      {/* Pago/pendente. Já pago = travado (o clique pede confirmação). */}
      <button
        onClick={() => onTogglePaid(charge)}
        className="-m-2 p-2 flex-shrink-0"
        title={charge.paid ? 'Pago (travado) — toque pra desfazer' : 'Marcar como pago'}
        aria-label={charge.paid ? 'Desfazer pagamento' : 'Marcar como pago'}
      >
        <span className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
          charge.paid ? 'bg-positive text-white' : 'border-2 border-ink-300 text-transparent hover:border-positive'
        }`}>
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </span>
      </button>
      {info}
      {amount}
      {charge.paid ? (
        <span className="w-[60px] flex items-center justify-center flex-shrink-0 text-ink-300" title="Paga — travada">
          <Lock className="w-3.5 h-3.5" />
        </span>
      ) : (
        <>
          <button onClick={() => onEdit(charge)} className="w-7 h-7 rounded-lg text-ink-300 hover:text-ink-900 hover:bg-ink-100 flex items-center justify-center flex-shrink-0" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onRemove(charge)} className="w-7 h-7 rounded-lg text-ink-300 hover:text-negative hover:bg-red-50 flex items-center justify-center flex-shrink-0" title="Remover">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

// ── Opções de banco (logo) p/ o seletor da chave PIX ──────────
const BANK_OPTIONS = [
  ...BANKS.map((b) => ({ value: b.id, label: b.name, icon: <BankLogo bankId={b.id} size={22} /> })),
  { value: 'other', label: 'Outro (digitar nome)', icon: <KeyRound className="w-[22px] h-[22px] p-0.5 text-ink-400 flex-shrink-0" /> },
];

// ── Modal: chaves PIX (múltiplas) ──────────────────────────────
const EMPTY_PIX_FORM = { bankId: '', label: '', keyType: 'cpf', key: '', name: '', city: '' };

function PixKeysModal({ isOpen, onClose, keys, onAdd, onRemove, onSetDefault }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_PIX_FORM);
  const [saving, setSaving] = useState(false);

  // Abre o form automaticamente se não há nenhuma chave
  useEffect(() => {
    if (isOpen) setAdding(keys.length === 0);
  }, [isOpen, keys.length]);

  // Escolher um banco preenche o apelido com o nome dele; "Outro" deixa digitar.
  function pickBank(bankId) {
    const bank = BANKS.find((b) => b.id === bankId);
    setForm((f) => ({ ...f, bankId, label: bank ? bank.name : '' }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.key.trim() || !form.name.trim() || !form.city.trim()) return;
    setSaving(true);
    try {
      const { bankId, ...payload } = form;
      await onAdd(payload);
      setForm(EMPTY_PIX_FORM);
      setAdding(keys.length === 0); // mantém aberto só se ainda for a única
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Minhas chaves PIX">
      <div className="space-y-3">
        {/* Lista de chaves */}
        {keys.length > 0 && (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ink-50">
                <BankLogo
                  name={k.label}
                  size={32}
                  fallback={<span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0"><KeyRound className="w-4 h-4 text-ink-400" /></span>}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-sm text-ink-900 truncate">{k.label || k.name}</p>
                    {k.is_default && <span className="text-[10px] font-bold text-accent-dark bg-accent/20 px-1.5 rounded-full">PADRÃO</span>}
                  </div>
                  <p className="text-xs text-ink-500 truncate">{k.key_type?.toUpperCase()} · {k.key}</p>
                </div>
                {!k.is_default && (
                  <button onClick={() => onSetDefault(k.id)} className="text-xs font-bold text-ink-600 hover:text-ink-900 px-2 py-1" title="Tornar padrão">
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => onRemove(k.id)} className="w-7 h-7 rounded-lg text-ink-300 hover:text-negative hover:bg-red-50 flex items-center justify-center" title="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Form de nova chave */}
        {adding ? (
          <form onSubmit={handleAdd} className="space-y-3 pt-1 border-t border-ink-100">
            <Select label="Banco" value={form.bankId} onChange={pickBank} options={BANK_OPTIONS} placeholder="Escolha o banco" />
            {form.bankId === 'other' && (
              <div className="animate-slide-up">
                <label className="label">Apelido</label>
                <input className="input-field" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex: Conta PJ" autoFocus />
              </div>
            )}
            <Select label="Tipo" value={form.keyType} onChange={(keyType) => setForm((f) => ({ ...f, keyType }))} options={PIX_KEY_TYPES} />
            <div>
              <label className="label">Chave PIX</label>
              <input className="input-field" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} placeholder="sua chave" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Nome do recebedor</label>
                <input className="input-field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Como no PIX" required />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input className="input-field" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="São Paulo" required />
              </div>
            </div>
            <div className="flex gap-2">
              {keys.length > 0 && (
                <button type="button" onClick={() => setAdding(false)} className="btn-ghost flex-1 min-h-[44px]">Cancelar</button>
              )}
              <button type="submit" disabled={saving} className="btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />} Salvar chave
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="btn-ghost w-full min-h-[48px] flex items-center justify-center gap-2 border border-dashed border-ink-300">
            <Plus className="w-4 h-4" /> Adicionar outra chave
          </button>
        )}
      </div>
    </Modal>
  );
}

// ── Modal: adicionar pessoa ────────────────────────────────────
function DebtorModal({ isOpen, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', phone: '', note: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: form.name.trim(), phone: form.phone.trim(), note: form.note.trim() });
      setForm({ name: '', phone: '', note: '' });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova pessoa">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: João" required autoFocus />
        </div>
        <div>
          <label className="label">WhatsApp (com DDD)</label>
          <input className="input-field" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(11) 91234-5678" />
        </div>
        <div>
          <label className="label">Observação (opcional)</label>
          <input className="input-field" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Ex: emprestei o cartão" />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />} Adicionar
        </button>
      </form>
    </Modal>
  );
}

// ── Modal: editar pessoa ───────────────────────────────────────
function EditDebtorModal({ debtor, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (debtor) setForm({ name: debtor.name || '', phone: debtor.phone || '' });
  }, [debtor]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(debtor.debtorId, { name: form.name.trim(), phone: form.phone.trim() || null });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={!!debtor} onClose={onClose} title="Editar pessoa">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
        </div>
        <div>
          <label className="label">WhatsApp (com DDD)</label>
          <input className="input-field" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(11) 91234-5678" />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Salvar
        </button>
      </form>
    </Modal>
  );
}

// ── Modal: adicionar cobrança a um devedor ─────────────────────
function ChargeModal({ debtor, cards, onClose, onSave, onSaveInstallments }) {
  const [form, setForm] = useState({ description: '', amount: '', dueDate: '' });
  const [cardId, setCardId] = useState('');
  const [parcelado, setParcelado] = useState(false);
  const [count, setCount] = useState(2);
  const [saving, setSaving] = useState(false);

  function reset() {
    setForm({ description: '', amount: '', dueDate: '' });
    setCardId('');
    setParcelado(false);
    setCount(2);
  }

  const total = parseAmount(form.amount);
  // Prévia do valor de cada parcela (1ª pega o centavo extra)
  const perParcel = parcelado && total > 0 && count > 1
    ? Math.floor((total / count) * 100) / 100
    : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim() || total <= 0) return;
    setSaving(true);
    try {
      if (parcelado && count > 1) {
        await onSaveInstallments({
          debtorId: debtor.debtorId,
          description: form.description.trim(),
          totalAmount: total,
          count,
          firstDueDate: form.dueDate || null,
          cardId: cardId || null,
        });
      } else {
        await onSave({ debtorId: debtor.debtorId, description: form.description.trim(), amount: total, dueDate: form.dueDate || null, cardId: cardId || null });
      }
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={!!debtor} onClose={onClose} title={debtor ? `Cobrança — ${debtor.name}` : 'Cobrança'}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Descrição</label>
          <input className="input-field" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex: Compra na Amazon" required autoFocus />
        </div>
        <div>
          <label className="label">{parcelado ? 'Valor total' : 'Valor'}</label>
          <input className="input-field" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="R$ 0,00" required />
        </div>

        {/* Toggle parcelar — mesma ideia da despesa no cartão */}
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
              <p className="text-xs text-ink-500">
                {count}x de aprox. <span className="font-bold text-ink-800">{formatCurrency(perParcel)}</span> — uma por mês a partir do vencimento.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="label">{parcelado ? 'Vencimento da 1ª parcela' : 'Vencimento (opcional)'}</label>
          <input className="input-field" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </div>

        <CardSelect cards={cards} value={cardId} onChange={setCardId} />

        <button type="submit" disabled={saving} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          {parcelado ? `Adicionar ${count}x` : 'Adicionar cobrança'}
        </button>
      </form>
    </Modal>
  );
}

// ── Modal: editar cobrança ─────────────────────────────────────
function EditChargeModal({ charge, cards, onClose, onSave }) {
  const [form, setForm] = useState({ description: '', amount: '', dueDate: '' });
  const [cardId, setCardId] = useState('');
  const [saving, setSaving] = useState(false);

  // Carrega os valores da cobrança ao abrir
  useEffect(() => {
    if (charge) {
      setForm({
        description: charge.description || '',
        amount: String(charge.amount ?? ''),
        dueDate: charge.due_date || '',
      });
      setCardId(charge.credit_card_id || '');
    }
  }, [charge]);

  async function handleSubmit(e) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.description.trim() || amount <= 0) return;
    setSaving(true);
    try {
      await onSave(charge.id, {
        description: form.description.trim(),
        amount,
        due_date: form.dueDate || null,
        credit_card_id: cardId || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={!!charge} onClose={onClose} title="Editar cobrança">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Descrição</label>
          <input className="input-field" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required autoFocus />
        </div>
        <div>
          <label className="label">Valor</label>
          <input className="input-field" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
        </div>
        <div>
          <label className="label">Vencimento (opcional)</label>
          <input className="input-field" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </div>
        <CardSelect cards={cards} value={cardId} onChange={setCardId} />
        {charge?.installment_total > 1 && (
          <p className="text-[11px] text-ink-400">
            Parcela {charge.installment_number}/{charge.installment_total} — editar afeta só esta parcela. Pra mudar todas, use o lápis do cabeçalho do parcelamento.
          </p>
        )}
        <button type="submit" disabled={saving} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Salvar
        </button>
      </form>
    </Modal>
  );
}

// ── Modal: editar parcelamento inteiro ─────────────────────────
function EditGroupModal({ group, cards, onClose, onSave }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [cardId, setCardId] = useState('');
  const [saving, setSaving] = useState(false);

  const items = group?.items || [];
  const pending = items.filter((x) => !x.paid);
  const paidCount = items.length - pending.length;

  useEffect(() => {
    if (!group) return;
    setDescription(baseDescription(group.items[0].description));
    const firstPending = group.items.find((x) => !x.paid);
    setAmount(firstPending ? String(firstPending.amount) : '');
    setCardId(group.items[0].credit_card_id || '');
  }, [group]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) return;
    setSaving(true);
    try {
      await onSave(group.groupId, items, {
        description: description.trim(),
        cardId,
        pendingAmount: pending.length ? parseAmount(amount) : 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={!!group} onClose={onClose} title="Editar parcelamento">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Descrição</label>
          <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} required autoFocus />
        </div>
        {pending.length > 0 && (
          <div>
            <label className="label">Valor de cada parcela pendente</label>
            <input className="input-field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        )}
        <CardSelect cards={cards} value={cardId} onChange={setCardId} />
        <p className="flex items-start gap-2 text-[11px] text-ink-500">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>
            Vale pras {items.length} parcelas.
            {paidCount > 0 && ` As ${paidCount} já pagas mantêm o valor original (travadas).`}
            {' '}Vencimentos se ajustam por parcela, no lápis de cada uma.
          </span>
        </p>
        <button type="submit" disabled={saving} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Salvar parcelamento
        </button>
      </form>
    </Modal>
  );
}

// ── Modal: enviar extrato (link público ao vivo) ───────────────
function ShareStatementModal({ debtor, charges, getLink, onClose }) {
  const [link, setLink] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | error
  const [copied, setCopied] = useState(false);
  const wallet = useMemo(() => summarizeCharges(charges), [charges]);

  const load = useCallback(async (rotate = false) => {
    if (!debtor) return;
    setState('loading');
    try {
      setLink(await getLink(debtor.debtorId, { rotate }));
      setState('idle');
    } catch (err) {
      console.error(err);
      setState('error');
    }
  }, [debtor, getLink]);

  useEffect(() => {
    if (!debtor) return;
    setLink(''); setCopied(false);
    load();
  }, [debtor, load]);

  const message = debtor
    ? `Oi, ${debtor.name}! Segue seu extrato atualizado: ${formatCurrency(wallet.open)} a pagar`
      + ` (${wallet.paidCount} de ${wallet.count} já pagas). Lá dá pra ver tudo e pagar via PIX: ${link}`
    : '';

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  }

  async function share() {
    try { await navigator.share({ title: 'Extrato de cobrança', text: message }); } catch { /* cancelado */ }
  }

  return (
    <Modal isOpen={!!debtor} onClose={onClose} title="Enviar extrato">
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          {debtor?.name} recebe um link que mostra <b className="text-ink-900">sempre atualizado</b> o total da dívida,
          o que já pagou, o que falta e as parcelas — com PIX pra pagar.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <WalletStat label="Total da dívida" value={wallet.total} />
          <WalletStat label="Pago" value={wallet.paid} tone="text-positive" />
          <WalletStat label="A pagar" value={wallet.open} />
        </div>

        {state === 'error' ? (
          <p className="text-sm text-negative font-medium">
            Não foi possível gerar o link. Confira se a migration <code>migration_cobrancas_extrato.sql</code> foi aplicada no Supabase.
          </p>
        ) : !link ? (
          <div className="h-12 rounded-xl bg-ink-50 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-ink-400" />
          </div>
        ) : (
          <div className="space-y-2 animate-slide-up">
            <div className="flex items-center gap-2 bg-ink-50 rounded-xl p-2">
              <span className="text-xs text-ink-600 truncate flex-1 ml-1">{link}</span>
              <a href={link} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-white text-ink-700 hover:bg-ink-100 flex items-center justify-center flex-shrink-0" title="Abrir extrato">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button onClick={copy} className="px-2.5 py-1.5 rounded-lg bg-white text-ink-700 font-bold text-xs hover:bg-ink-100 flex items-center gap-1 flex-shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-positive" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <div className="flex gap-2">
              <a href={waLink(debtor?.phone, message)} target="_blank" rel="noopener noreferrer" className="btn-accent flex-1 min-h-[48px] flex items-center justify-center gap-2">
                <MessageCircle className="w-5 h-5" /> Enviar no WhatsApp
              </a>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button onClick={share} className="btn-ghost min-h-[48px] w-12 px-0 flex items-center justify-center" title="Compartilhar">
                  <Share2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <button onClick={() => load(true)} disabled={state === 'loading'} className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-ink-400 hover:text-ink-700 py-1.5 disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${state === 'loading' ? 'animate-spin' : ''}`} /> Gerar novo link (o anterior para de funcionar)
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Modal: QR Code PIX + link de pagamento ─────────────────────
function PixQrModal({ target, pixKey, pixReady, onClose, onConfigure, onSent }) {
  const [dataUrl, setDataUrl] = useState('');
  const [payload, setPayload] = useState('');
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState('');       // link curto de pagamento
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const amount = target?.openAmount || 0;

  // Gera o payload + QR (preview local) ao abrir
  useEffect(() => {
    if (!target || !pixReady) { setDataUrl(''); setPayload(''); setLink(''); return; }
    setCopied(false); setLink(''); setLinkCopied(false);
    let alive = true;
    const code = buildPixPayload({
      key: pixKey.key, keyType: pixKey.key_type, name: pixKey.name, city: pixKey.city, amount,
    });
    setPayload(code);
    setDataUrl('');
    pixQrCodeDataUrl(code).then((url) => { if (alive) setDataUrl(url); }).catch(() => { if (alive) setDataUrl(''); });
    return () => { alive = false; };
  }, [target, pixReady, pixKey, amount]);

  async function copy() {
    try { await navigator.clipboard.writeText(payload); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  }

  // Gera o link de pagamento (sobe QR pro Storage + cria pix_link)
  async function genLink() {
    setLinkLoading(true);
    try {
      const { shortUrl } = await pixLinkService.createPaymentLink({
        pixKey, amount, recipientName: pixKey.name,
      });
      setLink(shortUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setLinkLoading(false);
    }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); } catch { /* */ }
  }

  function sendWhats() {
    const msg = `Oi, ${target?.name || ''}! Segue o link pra pagar via PIX${amount ? ` (${formatCurrency(amount)})` : ''}: ${link}`;
    window.open(waLink(target?.phone, msg), '_blank', 'noopener');
    if (target?.chargeIds?.length) onSent?.(target.chargeIds); // marca como cobrado
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} title="PIX para receber">
      {!pixReady ? (
        <div className="text-center py-4">
          <p className="text-sm text-ink-600 mb-4">Cadastre uma chave PIX primeiro pra gerar o QR Code.</p>
          <button onClick={onConfigure} className="btn-primary inline-flex items-center gap-2 min-h-[44px]">
            <KeyRound className="w-4 h-4" /> Cadastrar PIX
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <div>
            <p className="text-xs text-ink-500">{target?.name} — valor</p>
            <p className="font-display font-bold text-2xl text-ink-900">{formatCurrency(amount)}</p>
            <p className="text-[11px] text-ink-400 mt-0.5 inline-flex items-center gap-1.5">
              Recebendo em: <BankLogo name={pixKey?.label} size={14} /> {pixKey?.label || pixKey?.name}
            </p>
          </div>
          {dataUrl ? (
            <img src={dataUrl} alt="QR Code PIX" className="w-56 h-56 mx-auto rounded-2xl border border-ink-100" />
          ) : (
            <div className="w-56 h-56 mx-auto rounded-2xl bg-ink-50 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-ink-400" />
            </div>
          )}
          <button onClick={copy} className="btn-ghost w-full min-h-[44px] flex items-center justify-center gap-2">
            {copied ? <Check className="w-4 h-4 text-positive" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar código PIX'}
          </button>

          {/* Link de pagamento (página pública /p/:code) */}
          {!link ? (
            <button onClick={genLink} disabled={linkLoading} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
              {linkLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />}
              Gerar link de pagamento
            </button>
          ) : (
            <div className="space-y-2 animate-slide-up">
              <div className="flex items-center gap-2 bg-ink-50 rounded-xl p-2">
                <span className="text-xs text-ink-600 truncate flex-1 ml-1">{link}</span>
                <button onClick={copyLink} className="px-2.5 py-1.5 rounded-lg bg-white text-ink-700 font-bold text-xs hover:bg-ink-100 flex items-center gap-1">
                  {linkCopied ? <Check className="w-3.5 h-3.5 text-positive" /> : <Copy className="w-3.5 h-3.5" />}
                  {linkCopied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <button onClick={sendWhats} className="btn-accent w-full min-h-[48px] flex items-center justify-center gap-2">
                <MessageCircle className="w-5 h-5" /> Enviar link no WhatsApp
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
