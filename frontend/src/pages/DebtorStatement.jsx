import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Copy, Check, FileWarning, QrCode, Lock, AlertTriangle, ReceiptText, Minus, KeyRound } from 'lucide-react';
import Modal from '../components/Modal';
import { resolveDebtorStatement } from '../services/cobrancas';
import { buildPixPayload, pixQrCodeDataUrl } from '../services/pix';
import { formatCurrency, formatDate } from '../utils/format';
import { groupCharges, summarizeCharges, baseDescription, isOverdue } from '../utils/charges';

/**
 * Rota pública /extrato/:code — a "carteira" vista pelo DEVEDOR.
 *
 * Quem deve abre o link (sem login) e vê, sempre atualizado: total da dívida,
 * quanto já pagou, quanto falta, parcelas pagas × pendentes e cada dívida.
 * Se o credor tem chave PIX, o devedor escolhe QUAIS parcelas vai pagar agora
 * (padrão: todas as pendentes) e gera o PIX só desse valor.
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

  // Parcelas escolhidas pra pagar agora (referências dos objetos de `charges`).
  // Começa com todas as pendentes: o caso comum continua a 1 toque.
  const [picked, setPicked] = useState(EMPTY);
  const [payOpen, setPayOpen] = useState(false);
  useEffect(() => { setPicked(new Set(charges.filter((c) => !c.paid))); }, [charges]);

  const pickedTotal = useMemo(
    () => Math.round([...picked].reduce((s, c) => s + Number(c.amount), 0) * 100) / 100,
    [picked]
  );
  const canPick = !!data?.pix;

  function toggle(items) {
    const open = items.filter((c) => !c.paid);
    setPicked((prev) => {
      const next = new Set(prev);
      const allOn = open.every((c) => next.has(c));
      open.forEach((c) => (allOn ? next.delete(c) : next.add(c)));
      return next;
    });
  }
  const pickWhere = (fn) => setPicked(new Set(charges.filter((c) => !c.paid && fn(c))));

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
          </div>
        </div>

        {/* Atalhos de seleção */}
        {!settled && canPick && (
          <div className="flex items-center gap-1.5 flex-wrap px-1">
            <span className="text-xs font-semibold text-ink-600 mr-1">Escolha o que vai pagar:</span>
            <Chip onClick={() => pickWhere(() => true)}>Todas</Chip>
            {wallet.overdueCount > 0 && <Chip onClick={() => pickWhere((c) => isOverdue(c))}>Só vencidas</Chip>}
            <Chip onClick={() => setPicked(EMPTY)}>Nenhuma</Chip>
          </div>
        )}

        {/* Dívidas / parcelas */}
        {groups.map((g, gi) => (
          <div key={g.groupId || gi} className="bg-white rounded-2xl shadow-soft overflow-hidden">
            {g.type === 'installment' && (
              <GroupHeader items={g.items} canPick={canPick} picked={picked} onToggle={() => toggle(g.items)} />
            )}
            <div className="divide-y divide-ink-50">
              {g.items.map((ch, i) => (
                <Row
                  key={i}
                  charge={ch}
                  inGroup={g.type === 'installment'}
                  canPick={canPick}
                  checked={picked.has(ch)}
                  onToggle={() => toggle([ch])}
                />
              ))}
            </div>
          </div>
        ))}

        <p className={`text-center text-[11px] text-ink-400 pt-2 ${!settled && canPick ? 'pb-24' : ''}`}>
          Atualizado em tempo real · Gerado pelo app Cofre
        </p>
      </div>

      {/* Barra fixa: total escolhido → PIX desse valor */}
      {!settled && canPick && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex justify-center pointer-events-none">
          <div className="w-full max-w-md bg-ink-900 text-white rounded-2xl shadow-soft-xl px-4 py-3 flex items-center gap-3 pointer-events-auto">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-ink-400">{picked.size} selecionada(s)</p>
              <p className="font-display font-bold text-lg leading-tight">{formatCurrency(pickedTotal)}</p>
            </div>
            <button
              onClick={() => setPayOpen(true)}
              disabled={picked.size === 0}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-accent text-ink-900 font-bold text-sm hover:bg-accent-light transition-colors disabled:opacity-40"
            >
              <QrCode className="w-4 h-4" /> Pagar via PIX
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={payOpen} onClose={() => setPayOpen(false)} title="Pagar via PIX">
        {payOpen && <PixPayBox pix={data.pix} amount={pickedTotal} items={[...picked]} />}
      </Modal>
    </div>
  );
}

const EMPTY = new Set();

function Chip({ onClick, children }) {
  return (
    <button onClick={onClick} className="px-3 min-h-[32px] rounded-full bg-white shadow-soft text-[11px] font-bold text-ink-700 hover:bg-ink-50 transition-colors">
      {children}
    </button>
  );
}

/** Caixinha de seleção. `partial` = parte das parcelas do grupo escolhida. */
function PickBox({ checked, partial = false }) {
  const Icon = partial && !checked ? Minus : Check;
  return (
    <span className={`w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
      checked || partial ? 'bg-ink-900 text-white' : 'border-2 border-ink-300 text-transparent'
    }`}>
      <Icon className="w-3.5 h-3.5" strokeWidth={3} />
    </span>
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

function GroupHeader({ items, canPick, picked, onToggle }) {
  const w = summarizeCharges(items);
  const n = items[0].installment_total || items.length;
  const open = items.filter((c) => !c.paid);
  const on = open.filter((c) => picked.has(c)).length;
  const selectable = canPick && open.length > 0;
  const Tag = selectable ? 'button' : 'div';
  return (
    <Tag
      {...(selectable ? { type: 'button', onClick: onToggle } : {})}
      className="w-full px-4 py-2.5 bg-ink-50 flex items-center gap-3 text-left"
    >
      {selectable && <PickBox checked={on === open.length} partial={on > 0 && on < open.length} />}
      <div className="min-w-0 flex-1">
      <p className="text-sm font-bold text-ink-900">{baseDescription(items[0].description)}</p>
      <p className="text-[11px] text-ink-500">
        {n}x · {formatCurrency(w.total)} · <b className="text-ink-700">{w.paidCount}/{n} pagas</b>
        {w.openCount > 0 && <> · faltam {w.openCount} ({formatCurrency(w.open)})</>}
      </p>
      </div>
    </Tag>
  );
}

function Row({ charge, inGroup, canPick, checked, onToggle }) {
  const overdue = isOverdue(charge);
  const label = inGroup ? `Parcela ${charge.installment_number}/${charge.installment_total}` : charge.description;
  // Pendente = linha inteira tocável pra escolher; paga = só informativa.
  const selectable = canPick && !charge.paid;
  const Tag = selectable ? 'button' : 'div';
  return (
    <Tag
      {...(selectable ? { type: 'button', onClick: onToggle, 'aria-pressed': checked } : {})}
      className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
        selectable ? (checked ? 'bg-accent/10' : 'hover:bg-ink-50') : ''
      }`}
    >
      {selectable && <PickBox checked={checked} />}
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
    </Tag>
  );
}

/**
 * PIX do valor escolhido: QR + copia-e-cola (já com o valor), gerados no próprio
 * navegador. Também oferece a chave crua, pra quem prefere digitar o valor.
 */
function PixPayBox({ pix, amount, items }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState('');  // 'code' | 'key' | ''
  const payload = useMemo(() => buildPixPayload({
    key: pix.key, keyType: pix.key_type, name: pix.name, city: pix.city, amount,
  }), [pix, amount]);

  useEffect(() => {
    let alive = true;
    pixQrCodeDataUrl(payload).then((url) => alive && setQr(url)).catch(() => alive && setQr(''));
    return () => { alive = false; };
  }, [payload]);

  async function copy(what) {
    try {
      await navigator.clipboard.writeText(what === 'code' ? payload : pix.key);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch { /* ignora */ }
  }

  return (
    <div className="space-y-4 text-center">
      <div>
        <p className="text-xs text-ink-500">{items.length} parcela(s)/cobrança(s) · para {pix.name}</p>
        <p className="font-display font-bold text-3xl text-ink-900">{formatCurrency(amount)}</p>
      </div>
      <ul className="text-left text-xs text-ink-600 bg-ink-50 rounded-xl px-3 py-2 max-h-28 overflow-y-auto space-y-0.5">
        {items.map((c, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">
              {c.installment_total > 1
                ? `${baseDescription(c.description)} · ${c.installment_number}/${c.installment_total}`
                : c.description}
            </span>
            <span className="font-mono flex-shrink-0">{formatCurrency(c.amount)}</span>
          </li>
        ))}
      </ul>
      {qr ? (
        <img src={qr} alt="QR Code PIX" className="w-56 h-56 mx-auto rounded-2xl border border-ink-100" />
      ) : (
        <div className="w-56 h-56 mx-auto rounded-2xl bg-ink-50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-ink-400" />
        </div>
      )}
      <p className="text-xs text-ink-500">Escaneie no app do seu banco ou copie o código — o valor já vai preenchido.</p>
      <button onClick={() => copy('code')} className="btn-primary w-full min-h-[52px] flex items-center justify-center gap-2">
        {copied === 'code' ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5" />}
        {copied === 'code' ? 'Código copiado!' : 'Copiar PIX copia e cola'}
      </button>
      <button onClick={() => copy('key')} className="btn-ghost w-full min-h-[44px] flex items-center justify-center gap-2">
        {copied === 'key' ? <Check className="w-4 h-4 text-positive" /> : <KeyRound className="w-4 h-4" />}
        {copied === 'key' ? 'Chave copiada!' : 'Copiar só a chave PIX'}
      </button>
      <p className="text-[10px] text-ink-400 break-all leading-relaxed px-1">
        Chave ({pix.key_type?.toUpperCase()}): {pix.key}
      </p>
    </div>
  );
}
