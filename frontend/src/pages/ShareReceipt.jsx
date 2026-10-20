import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check, FileText, HandCoins, Target, ReceiptText, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendPaymentReceipt, savedStatements } from '../services/cobrancas';
import { goalService, goalReceiptService } from '../services/goals';
import { formatCurrency, parseAmount } from '../utils/format';

const SHARE_CACHE = 'cofre-share';
const SHARED_FILE = '/compartilhar/arquivo';

/**
 * Rota pública /compartilhar — destino do "Compartilhar" do Android (manifest
 * share_target). O service worker recebe o arquivo e guarda no Cache; aqui a
 * pessoa escolhe pra onde ele vai:
 *   - extrato aberto neste aparelho → comprovante vai pro credor (aviso de pagamento);
 *   - logada → comprovante numa meta (com o valor, vira depósito).
 * Só existe no Android com o Cofre instalado — o iOS não tem Web Share Target.
 */
export default function ShareReceipt() {
  const { user, loading: authLoading } = useAuth();
  const [file, setFile] = useState(undefined); // undefined = lendo, null = nada compartilhado
  const [preview, setPreview] = useState('');
  const [goals, setGoals] = useState([]);
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(null); // destino em envio
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [statements] = useState(savedStatements);

  useEffect(() => {
    let url = '';
    readSharedFile().then((f) => {
      setFile(f);
      if (f?.type.startsWith('image/')) {
        url = URL.createObjectURL(f);
        setPreview(url);
      }
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);

  useEffect(() => {
    if (user) goalService.list().then(setGoals).catch(() => setGoals([]));
  }, [user]);

  async function send(id, action, doneText) {
    setError('');
    setSending(id);
    try {
      await action();
      await clearSharedFile();
      setDone(doneText);
    } catch (err) {
      setError(err.message || 'Não foi possível enviar.');
    } finally {
      setSending(null);
    }
  }

  function sendToGoal(goal) {
    const value = parseAmount(amount);
    send(goal.id, async () => {
      await goalReceiptService.upload(goal.id, file, value > 0 ? value : null);
      if (value > 0) await goalService.contribute(goal.id, value);
    }, value > 0
      ? `${formatCurrency(value)} guardados em "${goal.title}", com o comprovante.`
      : `Comprovante anexado à meta "${goal.title}".`);
  }

  if (file === undefined || authLoading) {
    return (
      <Screen>
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-400" /></div>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <div className="text-center py-6 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
            <Check className="w-7 h-7 text-positive" strokeWidth={3} />
          </div>
          <p className="font-display font-bold text-lg text-ink-900">Enviado!</p>
          <p className="text-sm text-ink-500">{done}</p>
          {user && <Link to="/" className="btn-primary w-full">Abrir o Cofre</Link>}
        </div>
      </Screen>
    );
  }

  if (!file) {
    return (
      <Screen>
        <p className="text-sm text-ink-600 text-center py-6">
          Nada pra enviar. No app do banco, toque em <b>Compartilhar</b> no comprovante e escolha o <b>Cofre</b>.
        </p>
      </Screen>
    );
  }

  const hasDestination = statements.length > 0 || user;

  return (
    <Screen>
      <div className="space-y-5">
        {/* O que chegou */}
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 p-3">
          <div className="w-14 h-14 rounded-xl bg-ink-100 overflow-hidden flex items-center justify-center flex-shrink-0">
            {preview
              ? <img src={preview} alt="" className="w-full h-full object-cover" />
              : <FileText className="w-6 h-6 text-ink-500" />}
          </div>
          <p className="min-w-0 flex-1 text-sm font-semibold text-ink-900 truncate">{file.name}</p>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>
        )}

        {/* Pra quem você deve */}
        {statements.length > 0 && (
          <div className="space-y-2">
            <p className="label !mb-0">Comprovante de pagamento</p>
            {statements.map((s) => (
              <Destination
                key={s.code}
                icon={HandCoins}
                title={`Enviar para ${s.ownerName || 'quem te cobrou'}`}
                subtitle={`Extrato de ${s.debtorName}`}
                busy={sending === s.code}
                disabled={!!sending}
                onClick={() => send(s.code, () => sendPaymentReceipt(s.code, file),
                  `${s.ownerName || 'Quem te cobrou'} recebeu o comprovante.`)}
              />
            ))}
          </div>
        )}

        {/* Metas do usuário logado */}
        {user && goals.length > 0 && (
          <div className="space-y-2">
            <p className="label !mb-0">Guardar numa meta</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Valor do PIX (opcional)"
                className="input-field pl-10 font-mono"
              />
            </div>
            {goals.map((g) => (
              <Destination
                key={g.id}
                icon={Target}
                title={g.title}
                subtitle={`${formatCurrency(g.current_amount)} de ${formatCurrency(g.target_amount)}`}
                busy={sending === g.id}
                disabled={!!sending}
                onClick={() => sendToGoal(g)}
              />
            ))}
          </div>
        )}

        {!hasDestination && (
          <p className="text-sm text-ink-600 text-center">
            Pra enviar, abra antes o link do extrato que te mandaram — ou <Link to="/login" className="font-bold underline">entre na sua conta</Link>.
          </p>
        )}
      </div>
    </Screen>
  );
}

function Screen({ children }) {
  return (
    <div className="min-h-screen bg-gradient-app p-4 py-6 flex justify-center">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-soft-lg overflow-hidden self-start">
        <div className="bg-gradient-dark text-white px-6 py-5">
          <div className="inline-flex items-center gap-2 text-accent font-bold text-sm">
            <ReceiptText className="w-4 h-4" /> Cofre
          </div>
          <p className="font-display font-bold text-lg mt-1">Enviar comprovante</p>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Destination({ icon: Icon, title, subtitle, busy, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-ink-200 text-left hover:bg-ink-50 transition-colors disabled:opacity-60"
    >
      <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
        {busy ? <Loader2 className="w-5 h-5 animate-spin text-ink-900" /> : <Icon className="w-5 h-5 text-ink-900" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink-900 truncate">{title}</span>
        <span className="block text-xs text-ink-500 truncate">{subtitle}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-ink-400 flex-shrink-0" />
    </button>
  );
}

/** Arquivo que o service worker guardou ao receber o compartilhamento. */
async function readSharedFile() {
  try {
    const res = await (await caches.open(SHARE_CACHE)).match(SHARED_FILE);
    if (!res) return null;
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get('X-File-Name') || 'comprovante');
    return new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}

async function clearSharedFile() {
  try { await (await caches.open(SHARE_CACHE)).delete(SHARED_FILE); } catch { /* ignora */ }
}
