import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, MessageCircle, QrCode, FileText, Download,
  ChevronDown, ChevronRight, KeyRound, Loader2, CheckCircle2, Copy, Check,
  AlertTriangle, Wallet, Share2, CreditCard,
} from 'lucide-react';
import Modal from '../components/Modal';
import Stepper from '../components/Stepper';
import { useDisclosure } from '../hooks/useDisclosure';
import { useCobrancas } from '../hooks/useCobrancas';
import { formatCurrency, formatDate, parseAmount } from '../utils/format';
import { buildPixPayload, pixQrCodeDataUrl } from '../services/pix';
import {
  buildReminderText, waLink, generateChargesPdf, normalizePhone,
} from '../services/cobrancasReport';
import { downloadPdf, shareReportFile } from '../services/reports';

/**
 * Página de Cobranças.
 *
 * Controla quem deve ao usuário (emprestou cartão/dinheiro). Permite:
 *   - cadastrar pessoas e suas dívidas (valor, descrição, vencimento)
 *   - marcar como pago, ver vencidas
 *   - configurar a chave PIX p/ receber → gera QR / copia-e-cola
 *   - cobrar via WhatsApp (mensagem pronta, com PIX)
 *   - exportar relatório em PDF com links clicáveis
 */
export default function Cobrancas() {
  const c = useCobrancas();
  const pixModal = useDisclosure();
  const debtorModal = useDisclosure();
  const [qrTarget, setQrTarget] = useState(null);     // { name, amount } p/ modal QR
  const [chargeTarget, setChargeTarget] = useState(null); // devedor p/ nova cobrança
  const [pdfBusy, setPdfBusy] = useState(false);

  const pixReady = c.pix?.pixKey && c.pix?.pixName && c.pix?.pixCity;

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

  // Cobrar um devedor via WhatsApp
  function handleCharge(debtor) {
    const charges = c.chargesByDebtor.get(debtor.debtorId) || [];
    const open = charges.filter((x) => !x.paid);
    const pixPayload = pixReady
      ? buildPixPayload({
          key: c.pix.pixKey, keyType: c.pix.pixKeyType, name: c.pix.pixName, city: c.pix.pixCity,
          amount: debtor.openAmount,
        })
      : undefined;
    const text = buildReminderText(debtor.name, open, { pixPayload, ownerName: c.pix?.pixName });
    window.open(waLink(debtor.phone, text), '_blank', 'noopener');
  }

  return (
    <div className="space-y-5 pb-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Cobranças</h1>
          <p className="text-ink-500 text-sm mt-1">Controle quem te deve e cobre pelo WhatsApp.</p>
        </div>
        <button onClick={debtorModal.open} className="btn-primary min-h-[44px] flex items-center gap-2 flex-shrink-0">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Pessoa</span>
        </button>
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
          {pixReady ? 'Chave PIX ✓' : 'Configurar PIX'}
        </button>
        <button onClick={() => handlePdf(false)} disabled={pdfBusy || c.summary.length === 0} className="btn-ghost min-h-[44px] flex items-center gap-2 flex-1 justify-center disabled:opacity-50">
          {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Relatório PDF
        </button>
        <button onClick={() => handlePdf(true)} disabled={pdfBusy || c.summary.length === 0} className="btn-ghost min-h-[44px] w-12 flex items-center justify-center disabled:opacity-50" title="Compartilhar PDF">
          <Share2 className="w-4 h-4" />
        </button>
      </div>

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
              onShowQr={() => setQrTarget({ name: d.name, amount: d.openAmount })}
              onSetPaid={c.setChargePaid}
              onRemoveCharge={c.removeCharge}
              onRemoveDebtor={() => c.removeDebtor(d.debtorId)}
              pixReady={pixReady}
            />
          ))}
        </div>
      )}

      {/* ── Modais ─────────────────────────────────────────── */}
      <PixConfigModal isOpen={pixModal.isOpen} onClose={pixModal.close} pix={c.pix} onSave={c.savePix} />
      <DebtorModal isOpen={debtorModal.isOpen} onClose={debtorModal.close} onSave={c.addDebtor} />
      <ChargeModal
        debtor={chargeTarget}
        onClose={() => setChargeTarget(null)}
        onSave={c.addCharge}
        onSaveInstallments={c.addInstallments}
      />
      <PixQrModal
        target={qrTarget}
        pix={c.pix}
        pixReady={pixReady}
        onClose={() => setQrTarget(null)}
        onConfigure={() => { setQrTarget(null); pixModal.open(); }}
      />
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

function DebtorCard({ debtor, charges, onAddCharge, onCharge, onShowQr, onSetPaid, onRemoveCharge, onRemoveDebtor, pixReady }) {
  const [open, setOpen] = useState(false);
  const hasOverdue = debtor.overdueCount > 0;

  return (
    <div className="card-flat overflow-hidden">
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
          </div>
        </button>
      </div>

      {/* Ações rápidas */}
      <div className="px-3 pb-3 flex flex-wrap gap-1.5">
        <button onClick={onCharge} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-positive/10 text-positive font-bold text-xs hover:bg-positive/20 transition-colors">
          <MessageCircle className="w-3.5 h-3.5" /> Cobrar
        </button>
        <button onClick={onShowQr} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-ink-100 text-ink-700 font-bold text-xs hover:bg-ink-200 transition-colors">
          <QrCode className="w-3.5 h-3.5" /> PIX QR
        </button>
        <button onClick={onAddCharge} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-ink-100 text-ink-700 font-bold text-xs hover:bg-ink-200 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Cobrança
        </button>
        <button onClick={onRemoveDebtor} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg text-ink-400 hover:text-negative hover:bg-red-50 font-bold text-xs transition-colors ml-auto" title="Remover pessoa">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Lista de cobranças (expandida) */}
      {open && (
        <div className="border-t border-ink-100 divide-y divide-ink-50 animate-slide-up">
          {charges.length === 0 ? (
            <p className="p-3 text-xs text-ink-400 text-center">Sem cobranças. Use “Cobrança” pra adicionar.</p>
          ) : (
            charges.map((ch) => (
              <ChargeRow key={ch.id} charge={ch} onSetPaid={onSetPaid} onRemove={onRemoveCharge} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ChargeRow({ charge, onSetPaid, onRemove }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !charge.paid && charge.due_date && charge.due_date < today;
  return (
    <div className="p-3 flex items-center gap-3">
      <button
        onClick={() => onSetPaid(charge.id, !charge.paid)}
        className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          charge.paid ? 'bg-positive text-white' : 'border-2 border-ink-300 text-transparent hover:border-positive'
        }`}
        title={charge.paid ? 'Marcar como pendente' : 'Marcar como pago'}
      >
        <Check className="w-3.5 h-3.5" strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${charge.paid ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
          {charge.description}
        </p>
        {charge.due_date && (
          <p className={`text-xs ${overdue ? 'text-negative font-semibold' : 'text-ink-400'}`}>
            {overdue ? 'Venceu ' : 'Vence '}{formatDate(charge.due_date, 'long')}
          </p>
        )}
      </div>
      <span className={`font-mono font-bold text-sm ${charge.paid ? 'text-ink-400' : 'text-ink-900'}`}>
        {formatCurrency(charge.amount)}
      </span>
      <button onClick={() => onRemove(charge.id)} className="w-7 h-7 rounded-lg text-ink-300 hover:text-negative hover:bg-red-50 flex items-center justify-center flex-shrink-0" title="Remover">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Modal: config PIX ──────────────────────────────────────────
function PixConfigModal({ isOpen, onClose, pix, onSave }) {
  const [form, setForm] = useState({ pixKey: '', pixKeyType: 'cpf', pixName: '', pixCity: '' });
  const [saving, setSaving] = useState(false);

  // Ao abrir, carrega os valores já salvos (se houver)
  useEffect(() => {
    if (isOpen && pix) {
      setForm({
        pixKey: pix.pixKey || '',
        pixKeyType: pix.pixKeyType || 'cpf',
        pixName: pix.pixName || '',
        pixCity: pix.pixCity || '',
      });
    }
  }, [isOpen, pix]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Chave PIX para receber">
      <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="label">Tipo de chave</label>
        <select className="input-field" value={form.pixKeyType} onChange={(e) => setForm((f) => ({ ...f, pixKeyType: e.target.value }))}>
          <option value="cpf">CPF</option>
          <option value="cnpj">CNPJ</option>
          <option value="email">E-mail</option>
          <option value="phone">Telefone</option>
          <option value="random">Aleatória</option>
        </select>
      </div>
      <div>
        <label className="label">Chave PIX</label>
        <input className="input-field" value={form.pixKey} onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))} placeholder="sua chave" required />
      </div>
      <div>
        <label className="label">Nome do recebedor</label>
        <input className="input-field" value={form.pixName} onChange={(e) => setForm((f) => ({ ...f, pixName: e.target.value }))} placeholder="Como aparece no PIX" required />
      </div>
      <div>
        <label className="label">Cidade</label>
        <input className="input-field" value={form.pixCity} onChange={(e) => setForm((f) => ({ ...f, pixCity: e.target.value }))} placeholder="Ex: São Paulo" required />
      </div>
        <button type="submit" disabled={saving} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Salvar
        </button>
      </form>
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

// ── Modal: adicionar cobrança a um devedor ─────────────────────
function ChargeModal({ debtor, onClose, onSave, onSaveInstallments }) {
  const [form, setForm] = useState({ description: '', amount: '', dueDate: '' });
  const [parcelado, setParcelado] = useState(false);
  const [count, setCount] = useState(2);
  const [saving, setSaving] = useState(false);

  function reset() {
    setForm({ description: '', amount: '', dueDate: '' });
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
        });
      } else {
        await onSave({ debtorId: debtor.debtorId, description: form.description.trim(), amount: total, dueDate: form.dueDate || null });
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
              <Stepper value={count} min={2} max={48} onChange={setCount} suffix="x" />
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

        <button type="submit" disabled={saving} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          {parcelado ? `Adicionar ${count}x` : 'Adicionar cobrança'}
        </button>
      </form>
    </Modal>
  );
}

// ── Modal: QR Code PIX ─────────────────────────────────────────
function PixQrModal({ target, pix, pixReady, onClose, onConfigure }) {
  const [dataUrl, setDataUrl] = useState('');
  const [payload, setPayload] = useState('');
  const [copied, setCopied] = useState(false);

  // Gera o payload + QR sempre que abre com um novo alvo e o PIX está pronto
  useEffect(() => {
    if (!target || !pixReady) { setDataUrl(''); setPayload(''); return; }
    setCopied(false);
    let alive = true;
    const code = buildPixPayload({
      key: pix.pixKey, keyType: pix.pixKeyType, name: pix.pixName, city: pix.pixCity,
      amount: target.amount,
    });
    setPayload(code);
    setDataUrl('');
    pixQrCodeDataUrl(code).then((url) => { if (alive) setDataUrl(url); }).catch(() => { if (alive) setDataUrl(''); });
    return () => { alive = false; };
  }, [target, pixReady, pix]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignora */ }
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} title="PIX para receber">
      {!pixReady ? (
        <div className="text-center py-4">
          <p className="text-sm text-ink-600 mb-4">Configure sua chave PIX primeiro pra gerar o QR Code.</p>
          <button onClick={onConfigure} className="btn-primary inline-flex items-center gap-2 min-h-[44px]">
            <KeyRound className="w-4 h-4" /> Configurar PIX
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <div>
            <p className="text-xs text-ink-500">{target?.name} — valor</p>
            <p className="font-display font-bold text-2xl text-ink-900">{formatCurrency(target?.amount || 0)}</p>
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
          <p className="text-[11px] text-ink-400 break-all px-2">{payload}</p>
        </div>
      )}
    </Modal>
  );
}
