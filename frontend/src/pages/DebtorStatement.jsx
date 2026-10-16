import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Copy, Check, FileWarning, QrCode, Lock, AlertTriangle, ReceiptText } from 'lucide-react';
import { resolveDebtorStatement } from '../services/cobrancas';
import { buildPixPayload, pixQrCodeDataUrl } from '../services/pix';
import { formatCurrency, formatDate } from '../utils/format';
import { groupCharges, summarizeCharges, baseDescription, isOverdue } from '../utils/charges';

/**
 * Rota pública /extrato/:code — a "carteira" vista pelo DEVEDOR.
 *
 * Quem deve abre o link (sem login) e vê, sempre atualizado: total da dívida,
 * quanto já pagou, quanto falta, parcelas pagas × pendentes e cada dívida.
 * Se o credor tem chave PIX, paga o que está em aberto direto daqui.
 * Os números saem de utils/charges — os mesmos da tela do credor.
 */
export default function DebtorStatement() {
  const { code } = useParams();
  const [data, setData] = useState(undefined); // undefined=loading, null=notfound

  useEffect(() => {
    let alive = true;
    resolveDebtorStatement(code)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => { alive = false; };
  }, [code]);

  const charges = useMemo(() => data?.charges || [], [data]);
  const wallet = useMemo(() => summarizeCharges(charges), [charges]);
  const groups = useMemo(() => groupCharges(charges), [charges]);

  if (data === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app">
        <Loader2 className="w-8 h-8 animate-spin text-ink-500 mb-3" />
        <p className="text-ink-600 text-sm">Carregando extrato…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center mb-3">
          <FileWarning className="w-7 h-7 text-ink-500" />
        </div>
        <p className="font-display font-bold text-lg text-ink-900">Extrato não encontrado</p>
        <p className="text-sm text-ink-500 mt-1">Este link não existe mais. Peça um novo a quem te enviou.</p>
      </div>
    );
  }

  const settled = wallet.count > 0 && wallet.openCount === 0;

  return (
    <div className="min-h-screen bg-gradient-app p-4 py-6 flex justify-center">
      <div className="w-full max-w-md space-y-3">
        {/* Cabeçalho + valor a pagar */}
        <div className="bg-white rounded-3xl shadow-soft-lg overflow-hidden">
          <div className="bg-gradient-dark text-white px-6 py-5">
            <div className="inline-flex items-center gap-2 text-accent font-bold text-sm">
              <ReceiptText className="w-4 h-4" /> Extrato de cobrança
            </div>
            <p className="font-display font-bold text-lg mt-2">Olá, {data.debtor_name}</p>
            {data.owner_name && <p className="text-ink-300 text-xs">Cobrança de {data.owner_name}</p>}
            <p className="text-ink-300 text-xs mt-4">{settled ? 'Tudo pago' : 'Valor a pagar'}</p>
            <p className="font-display font-bold text-3xl">{formatCurrency(wallet.open)}</p>
          </div>

          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Total da dívida" value={formatCurrency(wallet.total)} />
              <Stat label="Já pago" value={formatCurrency(wallet.paid)} tone="text-positive" />
            </div>
            <div>
              <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                <div className="h-full rounded-full bg-positive" style={{ width: `${wallet.progress}%` }} />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-ink-500">
                <span><b className="text-ink-800">{wallet.paidCount}</b> de {wallet.count} pagas · faltam <b className="text-ink-800">{wallet.openCount}</b></span>
                <span className="font-bold text-ink-800">{wallet.progress}%</span>
              </div>
            </div>
            {wallet.overdueCount > 0 && (
              <p className="flex items-center gap-2 text-xs font-semibold text-negative bg-red-50 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {wallet.overdueCount} vencida(s) · {formatCurrency(wallet.overdue)}
              </p>
            )}
            {!settled && data.pix && <PixPayBox pix={data.pix} amount={wallet.open} />}
          </div>
        </div>

        {/* Dívidas / parcelas */}
        {groups.map((g, gi) => (
          <div key={g.groupId || gi} className="bg-white rounded-2xl shadow-soft overflow-hidden">
            {g.type === 'installment' && <GroupHeader items={g.items} />}
            <div className="divide-y divide-ink-50">
              {g.items.map((ch, i) => <Row key={i} charge={ch} inGroup={g.type === 'installment'} />)}
            </div>
          </div>
        ))}

        <p className="text-center text-[11px] text-ink-400 pt-2">Atualizado em tempo real · Gerado pelo app Cofre</p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-ink-900' }) {
  return (
    <div className="rounded-xl bg-ink-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`font-display font-bold text-base ${tone}`}>{value}</p>
    </div>
  );
}

function GroupHeader({ items }) {
  const w = summarizeCharges(items);
  const n = items[0].installment_total || items.length;
  return (
    <div className="px-4 py-2.5 bg-ink-50">
      <p className="text-sm font-bold text-ink-900">{baseDescription(items[0].description)}</p>
      <p className="text-[11px] text-ink-500">
        {n}x · {formatCurrency(w.total)} · <b className="text-ink-700">{w.paidCount}/{n} pagas</b>
        {w.openCount > 0 && <> · faltam {w.openCount} ({formatCurrency(w.open)})</>}
      </p>
    </div>
  );
}

function Row({ charge, inGroup }) {
  const overdue = isOverdue(charge);
  const label = inGroup ? `Parcela ${charge.installment_number}/${charge.installment_total}` : charge.description;
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${charge.paid ? 'text-ink-400' : 'text-ink-900'}`}>{label}</p>
        {charge.paid ? (
          <p className="inline-flex items-center gap-1 text-xs text-positive font-semibold">
            <Lock className="w-3 h-3" /> Pago{charge.paid_at ? ` em ${formatDate(charge.paid_at, 'long')}` : ''}
          </p>
        ) : charge.due_date ? (
          <p className={`text-xs ${overdue ? 'text-negative font-semibold' : 'text-ink-400'}`}>
            {overdue ? 'Venceu ' : 'Vence '}{formatDate(charge.due_date, 'long')}
          </p>
        ) : (
          <p className="text-xs text-ink-400">Pendente</p>
        )}
      </div>
      <span className={`font-mono font-bold text-sm flex-shrink-0 ${charge.paid ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
        {formatCurrency(charge.amount)}
      </span>
    </div>
  );
}

/** PIX do valor em aberto: QR + copia-e-cola, gerados no próprio navegador. */
function PixPayBox({ pix, amount }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const payload = useMemo(() => buildPixPayload({
    key: pix.key, keyType: pix.key_type, name: pix.name, city: pix.city, amount,
  }), [pix, amount]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    pixQrCodeDataUrl(payload).then((url) => alive && setQr(url)).catch(() => alive && setQr(''));
    return () => { alive = false; };
  }, [open, payload]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignora */ }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary w-full min-h-[52px] flex items-center justify-center gap-2">
        <QrCode className="w-5 h-5" /> Pagar {formatCurrency(amount)} via PIX
      </button>
    );
  }

  return (
    <div className="space-y-3 text-center animate-slide-up">
      {qr ? (
        <img src={qr} alt="QR Code PIX" className="w-56 h-56 mx-auto rounded-2xl border border-ink-100" />
      ) : (
        <div className="w-56 h-56 mx-auto rounded-2xl bg-ink-50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-ink-400" />
        </div>
      )}
      <p className="text-xs text-ink-500">Escaneie no app do seu banco ou copie o código.</p>
      <button onClick={copy} className="btn-primary w-full min-h-[52px] flex items-center justify-center gap-2">
        {copied ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5" />}
        {copied ? 'Código copiado!' : 'Copiar código PIX'}
      </button>
      <p className="text-[10px] text-ink-400 break-all leading-relaxed px-1">{payload}</p>
    </div>
  );
}
