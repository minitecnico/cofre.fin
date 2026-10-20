import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2, Copy, Check, FileWarning, QrCode, Lock, AlertTriangle, ReceiptText, Minus,
  KeyRound, CalendarDays, Smartphone, BellRing, Paperclip,
} from 'lucide-react';
import Modal from '../components/Modal';
import BankLogo from '../components/BankLogo';
import PaidDisclosure from '../components/PaidDisclosure';
import { resolveDebtorStatement, notifyPayment, sendPaymentReceipt } from '../services/cobrancas';
import { requestPaymentPush } from '../services/push';
import { buildPixPayload, pixQrCodeDataUrl } from '../services/pix';
import { formatCurrency, formatDate, todayISO } from '../utils/format';
import { groupCharges, summarizeCharges, baseDescription, isOverdue } from '../utils/charges';
import { BANKS_WITH_APP, findBank } from '../constants/banks';
import { PIX_KEY_TYPES, RECEIPT_ACCEPT } from '../constants';

/**
 * Rota pública /extrato/:code — a "carteira" vista pelo DEVEDOR.
 *
 * Quem deve abre o link (sem login) e vê, sempre atualizado: total da dívida,
 * quanto já pagou, quanto falta, parcelas pagas × pendentes e cada dívida.
 * Os números saem de utils/charges — os mesmos da tela do credor.
 *
 * Pagamento em 2 passos, pensado no ritmo real (uma parcela de cada dívida
 * por mês):
 *   1. toca no MÊS → entram juntas todas as parcelas em aberto daquele mês
 *      (ou marca parcela a parcela). Nada vem marcado: ele escolhe o que paga.
 *   2. "Pagar" já copia o PIX copia-e-cola com o valor e oferece abrir o app
 *      do banco dele.
 */
export default function DebtorStatement() {
  const { code } = useParams();
  const [data, setData] = useState(undefined); // undefined=loading, null=notfound
  const [picked, setPicked] = useState(EMPTY);  // parcelas escolhidas (refs de `charges`)
  const [payOpen, setPayOpen] = useState(false);
  const [copied, setCopied] = useState(false);  // copiou ao abrir o passo 2
  const [notified, setNotified] = useState(false); // credor avisado deste pagamento

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
  const months = useMemo(() => groupOpenByMonth(charges), [charges]);
  const openGroups = groups.filter((g) => g.items.some((c) => !c.paid));
  const doneGroups = groups.filter((g) => g.items.every((c) => c.paid));

  const pickedList = useMemo(() => charges.filter((c) => picked.has(c)), [charges, picked]);
  const pickedTotal = Math.round(pickedList.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100;
  const payload = useMemo(() => (data?.pix && pickedTotal > 0 ? buildPixPayload({
    key: data.pix.key, keyType: data.pix.key_type, name: data.pix.name, city: data.pix.city, amount: pickedTotal,
  }) : ''), [data, pickedTotal]);

  /** Liga/desliga um conjunto de parcelas (só as em aberto). */
  function toggle(items) {
    const open = items.filter((c) => !c.paid);
    setPicked((prev) => {
      const next = new Set(prev);
      const allOn = open.every((c) => next.has(c));
      open.forEach((c) => (allOn ? next.delete(c) : next.add(c)));
      return next;
    });
  }

  // Passo 2: o toque em "Pagar" já copia o código (o clipboard exige um gesto
  // do usuário — por isso copia aqui, e não ao abrir o modal).
  async function startPayment() {
    let ok = false;
    try { await navigator.clipboard.writeText(payload); ok = true; } catch { /* sem permissão */ }
    setCopied(ok);
    setNotified(false);
    setPayOpen(true);
    // Avisa o credor (sem travar o fluxo — se falhar, o PIX segue normal).
    const ids = pickedList.map((c) => c.id).filter(Boolean);
    if (ids.length) {
      notifyPayment(code, ids)
        .then((ok) => { setNotified(ok); if (ok) requestPaymentPush(code); })
        .catch(() => {});
    }
  }

  if (data === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app">
        <Loader2 className="w-8 h-8 animate-spin text-ink-500 mb-3" />
        <p className="text-ink-600 text-sm">Carregando extrato…</p>
      </div>
    );
  }

  // Link inexistente ou vencido (SHARE_LINK_DAYS): o banco não devolve dados.
  if (!data || data.status === 'expired') {
    return (
      <StatusScreen
        icon={<FileWarning className="w-7 h-7 text-ink-500" />}
        title={data ? 'Link expirado' : 'Extrato não encontrado'}
        text={data
          ? 'Por segurança, este link tem validade. Peça um novo a quem te enviou.'
          : 'Este link não existe mais. Peça um novo a quem te enviou.'}
      />
    );
  }

  // Dívida quitada: o link deixa de mostrar o extrato.
  if (data.status === 'settled') {
    return (
      <StatusScreen
        icon={<Check className="w-7 h-7 text-positive" strokeWidth={3} />}
        tone="bg-emerald-50"
        title={`Tudo pago, ${data.debtor_name}! 🎉`}
        text="Não há nenhuma cobrança em aberto. Obrigado!"
      />
    );
  }

  const settled = wallet.count > 0 && wallet.openCount === 0;
  const canPay = !settled && !!data.pix;

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
            <p className="text-ink-300 text-xs mt-4">{settled ? 'Tudo pago' : 'Total em aberto'}</p>
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

        {/* Passo 1: pagar por mês */}
        {canPay && months.length > 0 && (
          <div className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <CalendarDays className="w-4 h-4" /> Qual mês você vai pagar?
              </p>
              {picked.size > 0 && (
                <button onClick={() => setPicked(EMPTY)} className="text-[11px] font-bold text-ink-400 hover:text-ink-700 px-2 min-h-[32px]">
                  Limpar
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {months.map((m) => {
                const on = m.items.filter((c) => picked.has(c)).length;
                const full = on === m.items.length;
                return (
                  <button
                    key={m.key}
                    onClick={() => toggle(m.items)}
                    aria-pressed={full}
                    className={`relative text-left rounded-xl border-2 px-3 py-2.5 min-h-[64px] transition-colors ${
                      full ? 'border-ink-900 bg-ink-900 text-white'
                        : on > 0 ? 'border-ink-900 bg-white'
                          : m.overdue ? 'border-red-200 bg-red-50/60 hover:border-negative' : 'border-ink-100 bg-ink-50 hover:border-ink-300'
                    }`}
                  >
                    <span className={`block text-xs font-bold capitalize ${full ? 'text-white' : 'text-ink-900'}`}>{m.label}</span>
                    <span className={`block font-display font-bold text-base ${full ? 'text-accent' : 'text-ink-900'}`}>{formatCurrency(m.total)}</span>
                    <span className={`block text-[10px] font-semibold ${full ? 'text-ink-300' : m.overdue ? 'text-negative' : 'text-ink-400'}`}>
                      {m.items.length} parcela(s){m.overdue ? ' · atrasado' : m.current ? ' · este mês' : ''}
                    </span>
                    {full && <Check className="absolute top-2 right-2 w-4 h-4 text-accent" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-400">Toque no mês pra juntar todas as parcelas dele. Também dá pra marcar uma a uma lá embaixo.</p>
          </div>
        )}

        {/* Dívidas em aberto; as quitadas por inteiro ficam recolhidas no fim */}
        {openGroups.map((g, gi) => (
          <Block key={g.groupId || gi} group={g} canPick={canPay} picked={picked} toggle={toggle} />
        ))}
        <PaidDisclosure
          count={doneGroups.length}
          total={doneGroups.reduce((s, g) => s + summarizeCharges(g.items).paid, 0)}
          label={`${doneGroups.length} dívida(s) quitada(s)`}
          className="bg-white rounded-2xl shadow-soft overflow-hidden"
        >
          <div className="p-2 pt-0 space-y-2">
            {doneGroups.map((g, gi) => (
              <Block key={g.groupId || gi} group={g} canPick={false} picked={picked} toggle={toggle} flat />
            ))}
          </div>
        </PaidDisclosure>

        <p className={`text-center text-[11px] text-ink-400 pt-2 ${canPay ? 'pb-24' : ''}`}>
          Atualizado em tempo real · Gerado pelo app Cofre
        </p>
      </div>

      {/* Barra fixa: total escolhido → passo 2 */}
      {canPay && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex justify-center pointer-events-none">
          <div className="w-full max-w-md bg-ink-900 text-white rounded-2xl shadow-soft-xl px-4 py-3 flex items-center gap-3 pointer-events-auto">
            <div className="min-w-0 flex-1">
              {picked.size ? (
                <>
                  <p className="text-[11px] text-ink-400">{picked.size} parcela(s) escolhida(s)</p>
                  <p className="font-display font-bold text-lg leading-tight">{formatCurrency(pickedTotal)}</p>
                </>
              ) : (
                <p className="text-xs text-ink-300 leading-snug">Escolha o mês ou as parcelas que vai pagar</p>
              )}
            </div>
            <button
              onClick={startPayment}
              disabled={!picked.size}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-accent text-ink-900 font-bold text-sm hover:bg-accent-light transition-colors disabled:opacity-40 flex-shrink-0"
            >
              <QrCode className="w-4 h-4" /> Pagar
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={payOpen} onClose={() => setPayOpen(false)} title="Pagar via PIX">
        {payOpen && (
          <PayStep pix={data.pix} amount={pickedTotal} items={pickedList} payload={payload} copiedOnOpen={copied}
            notified={notified} ownerName={data.owner_name} code={code} />
        )}
      </Modal>
    </div>
  );
}

const EMPTY = new Set();

/** Tela simples de status (link expirado / não encontrado / quitado). */
function StatusScreen({ icon, title, text, tone = 'bg-ink-100' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app p-6 text-center">
      <div className={`w-14 h-14 rounded-2xl ${tone} flex items-center justify-center mb-3`}>{icon}</div>
      <p className="font-display font-bold text-lg text-ink-900">{title}</p>
      <p className="text-sm text-ink-500 mt-1 max-w-xs">{text}</p>
    </div>
  );
}

/**
 * Agrupa as parcelas EM ABERTO por mês de vencimento (as sem vencimento num
 * grupo à parte). Ordem cronológica — o atrasado aparece primeiro.
 */
function groupOpenByMonth(charges) {
  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const map = new Map();
  for (const c of charges) {
    if (c.paid) continue;
    const key = c.due_date ? c.due_date.slice(0, 7) : 'none';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 'none') - (b === 'none') || a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      items,
      label: key === 'none' ? 'Sem vencimento' : monthLabel(key),
      total: Math.round(items.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100,
      overdue: items.some((c) => isOverdue(c, today)),
      current: key === thisMonth,
    }));
}

/** '2026-10' → 'out. 2026' (data local, sem shift de fuso). */
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace(' de ', ' ');
}

/**
 * Bloco de uma dívida (avulsa ou parcelamento). Parcelas pagas de um
 * parcelamento em aberto ficam recolhidas — só o que falta pagar aparece.
 */
function Block({ group, canPick, picked, toggle, flat = false }) {
  const inGroup = group.type === 'installment';
  const open = group.items.filter((c) => !c.paid);
  const paid = group.items.filter((c) => c.paid);
  const rows = (list) => list.map((ch, i) => (
    <Row key={i} charge={ch} inGroup={inGroup} canPick={canPick} checked={picked.has(ch)} onToggle={() => toggle([ch])} />
  ));
  return (
    <div className={`bg-white overflow-hidden ${flat ? 'rounded-xl border border-ink-100' : 'rounded-2xl shadow-soft'}`}>
      {inGroup && <GroupHeader items={group.items} canPick={canPick} picked={picked} onToggle={() => toggle(group.items)} />}
      <div className="divide-y divide-ink-50">{rows(open.length ? open : group.items)}</div>
      {open.length > 0 && (
        <PaidDisclosure count={paid.length} total={summarizeCharges(paid).paid} label={`${paid.length} parcela(s) paga(s)`} className="border-t border-ink-100">
          <div className="divide-y divide-ink-50">{rows(paid)}</div>
        </PaidDisclosure>
      )}
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
  // Pendente = linha inteira tocável pra escolher; paga = travada, só informativa.
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

const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
// Mouse = computador: não tem app do banco ali, então o QR já vem aberto.
const HAS_MOUSE = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
const LAST_BANK_KEY = 'cofre_extrato_banco'; // último banco escolhido (conveniência do devedor)

/**
 * Link que abre o app do banco no Android. Se o app não abrir direto, o
 * Chrome cai na página dele na Play Store — que tem o botão "Abrir".
 */
function androidAppLink(pkg) {
  const store = encodeURIComponent(`https://play.google.com/store/apps/details?id=${pkg}`);
  return `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};S.browser_fallback_url=${store};end`;
}

/**
 * Passo 2: código já copiado (com valor) → abrir o app do banco → colar.
 * QR fica recolhido (útil se for pagar por outro aparelho).
 */
function PayStep({ pix, amount, items, payload, copiedOnOpen, notified, ownerName, code }) {
  const [copied, setCopied] = useState(copiedOnOpen ? 'code' : '');
  const [showQr, setShowQr] = useState(HAS_MOUSE);
  const [qr, setQr] = useState('');
  const [lastBank, setLastBank] = useState(() => {
    try { return localStorage.getItem(LAST_BANK_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    if (!showQr) return;
    let alive = true;
    pixQrCodeDataUrl(payload).then((url) => alive && setQr(url)).catch(() => alive && setQr(''));
    return () => { alive = false; };
  }, [showQr, payload]);

  async function copy(what) {
    try {
      await navigator.clipboard.writeText(what === 'code' ? payload : pix.key);
      setCopied(what);
    } catch { /* ignora */ }
  }

  function rememberBank(id) {
    setLastBank(id);
    try { localStorage.setItem(LAST_BANK_KEY, id); } catch { /* ignora */ }
  }

  // Banco que RECEBE (apelido da chave PIX do credor, ex.: "Nubank").
  const payeeBank = findBank(pix.label);

  // Banco usado da última vez vem primeiro.
  const banks = [...BANKS_WITH_APP].sort((a, b) => (b.id === lastBank) - (a.id === lastBank));
  const keyType = PIX_KEY_TYPES.find((t) => t.value === pix.key_type)?.label || 'PIX';

  return (
    <div className="space-y-5">
      {/* Valor e quem recebe */}
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Valor a pagar</p>
        <p className="font-display font-bold text-4xl text-ink-900 tabular-nums mt-1">{formatCurrency(amount)}</p>
        <p className="text-sm text-ink-500 mt-1">para <b className="text-ink-900 font-semibold">{pix.name}</b></p>
        {payeeBank && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 bg-ink-50 rounded-full pl-1 pr-2.5 py-1">
            <BankLogo bankId={payeeBank.id} size={20} /> Recebe no {payeeBank.name}
          </p>
        )}
      </div>

      {/* O que está sendo pago */}
      <div className="rounded-2xl border border-ink-200 overflow-hidden">
        <p className="px-4 py-2 bg-ink-50 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
          {items.length} {items.length === 1 ? 'parcela' : 'parcelas'}
        </p>
        <ul className="divide-y divide-ink-100 max-h-40 overflow-y-auto">
          {items.map((c, i) => (
            <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink-800">
                {c.installment_total > 1 ? baseDescription(c.description) : c.description}
              </span>
              {c.installment_total > 1 && (
                <span className="text-[10px] font-bold text-ink-500 bg-ink-100 rounded-full px-2 py-0.5 flex-shrink-0">
                  {c.installment_number}/{c.installment_total}
                </span>
              )}
              <span className="w-24 text-right font-mono font-semibold text-ink-900 flex-shrink-0">{formatCurrency(c.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      {notified && (
        <p className="flex items-center gap-2 text-xs text-positive font-semibold bg-emerald-50 rounded-xl px-3 py-2.5 animate-fade-in">
          <BellRing className="w-4 h-4 flex-shrink-0" />
          Avisamos {ownerName || 'quem te cobrou'} que você está pagando.
        </p>
      )}

      {/* Passo a passo */}
      <ol>
        {/* 1. código copiado */}
        <Step n={1} done={copied === 'code'} title={copied === 'code' ? 'Código PIX copiado, já com o valor' : 'Copie o código PIX (já com o valor)'}>
          {copied === 'code' ? (
            <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 pl-3 pr-1 py-1">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-500">{payload}</span>
              <button
                onClick={() => copy('code')}
                className="h-10 px-3 rounded-lg bg-white shadow-soft text-ink-800 font-bold text-xs hover:bg-ink-100 flex items-center gap-1.5 flex-shrink-0 transition-colors"
              >
                <Copy className="w-4 h-4" /> Copiar de novo
              </button>
            </div>
          ) : (
            <button onClick={() => copy('code')} className="btn-primary w-full">
              <Copy className="w-4 h-4" /> Copiar código PIX
            </button>
          )}
        </Step>

        {/* 2. abrir o banco */}
        <Step n={2} title="Abra o app do seu banco">
          {IS_ANDROID ? (
            <div className="grid grid-cols-4 gap-2">
              {banks.map((b) => (
                <a
                  key={b.id}
                  href={androidAppLink(b.android)}
                  onClick={() => rememberBank(b.id)}
                  className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-colors ${b.id === lastBank ? 'bg-accent/15' : 'hover:bg-ink-50'}`}
                >
                  <BankLogo bankId={b.id} size={36} />
                  <span className="text-[10px] font-semibold text-ink-700 text-center leading-tight line-clamp-1">{b.name}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="flex items-start gap-2 text-xs text-ink-500 leading-snug">
              <Smartphone className="w-4 h-4 flex-shrink-0" />
              <span>No celular, abra o app do seu banco. No computador, escaneie o QR Code abaixo com o celular.</span>
            </p>
          )}
        </Step>

        {/* 3. colar */}
        <Step n={3} last={!notified} title="Cole em PIX › Pix Copia e Cola">
          <p className="text-xs text-ink-500 leading-snug">
            Antes de confirmar, veja se o valor é <b className="text-ink-700">{formatCurrency(amount)}</b> e
            quem recebe é <b className="text-ink-700">{pix.name}</b>.
          </p>
        </Step>

        {/* 4. comprovante — só com o aviso registrado (é nele que o arquivo entra) */}
        {notified && (
          <Step n={4} last title="Envie o comprovante">
            <ReceiptUpload code={code} ownerName={ownerName} />
          </Step>
        )}
      </ol>

      {/* Alternativas */}
      <div className="pt-4 border-t border-ink-100 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Outras formas de pagar</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowQr((v) => !v)}
            aria-expanded={showQr}
            className={`min-h-[48px] px-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              showQr ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-800 hover:bg-ink-50'
            }`}
          >
            <QrCode className="w-4 h-4 flex-shrink-0" /> QR Code
          </button>
          <button
            onClick={() => copy('key')}
            className="min-h-[48px] px-3 rounded-xl border border-ink-200 bg-white text-ink-800 text-sm font-semibold hover:bg-ink-50 flex items-center justify-center gap-2 transition-colors"
          >
            {copied === 'key' ? <Check className="w-4 h-4 text-positive flex-shrink-0" /> : <KeyRound className="w-4 h-4 flex-shrink-0" />}
            {copied === 'key' ? 'Chave copiada' : 'Copiar chave'}
          </button>
        </div>
        {copied === 'key' && (
          <p className="text-xs text-ink-500 leading-snug animate-fade-in">
            Chave copiada ({keyType}). No app, pague com PIX por chave e digite o valor de <b className="text-ink-700">{formatCurrency(amount)}</b>.
          </p>
        )}
        {showQr && (
          <div className="rounded-2xl border border-ink-200 p-4 flex flex-col items-center gap-2 animate-fade-in">
            {qr
              ? <img src={qr} alt="QR Code PIX" className="w-52 h-52" />
              : <div className="w-52 h-52 rounded-xl bg-ink-50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-400" /></div>}
            <p className="text-xs text-ink-500 text-center">Abra o app do banco no celular, escolha pagar com QR Code e aponte a câmera.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Um passo numerado; a linha vertical liga ao próximo (exceto no `last`). */
function Step({ n, title, done = false, last = false, children }) {
  return (
    <li className={`relative flex gap-3 ${last ? '' : 'pb-5'}`}>
      {!last && <span className="absolute left-3 top-7 bottom-1 w-px bg-ink-200" aria-hidden="true" />}
      <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        done ? 'bg-positive text-white' : 'bg-ink-900 text-white'
      }`}>
        {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-ink-900 pt-0.5">{title}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * Passo 4: o banco gerou o comprovante → o devedor salva (imagem ou PDF) e
 * envia aqui. Vai pro aviso de pagamento que o credor vê em Cobranças.
 */
function ReceiptUpload({ code, ownerName }) {
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setError('');
    setState('sending');
    try {
      await sendPaymentReceipt(code, file);
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <p className="flex items-center gap-2 text-xs text-positive font-semibold bg-emerald-50 rounded-xl px-3 py-2.5 animate-fade-in">
        <Check className="w-4 h-4 flex-shrink-0" strokeWidth={3} />
        Comprovante enviado para {ownerName || 'quem te cobrou'}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500 leading-snug">
        No app do banco, salve o comprovante (imagem ou PDF) e envie aqui.
      </p>
      <label className={`btn-ghost w-full border border-dashed border-ink-300 ${
        state === 'sending' ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
      }`}>
        {state === 'sending'
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
          : <><Paperclip className="w-4 h-4" /> Enviar comprovante</>}
        <input type="file" accept={RECEIPT_ACCEPT} onChange={handleFile} disabled={state === 'sending'} className="sr-only" />
      </label>
      {error && <p className="text-xs text-negative font-medium">{error}</p>}
    </div>
  );
}
