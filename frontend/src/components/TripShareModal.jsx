import { useState } from 'react';
import { Link2, Copy, Check, ExternalLink, MessageCircle, RefreshCw, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { tripShareUrl, travelErrorMessage } from '../services/travel';

const SECONDARY_BTN = 'inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3 rounded-full border border-ink-300 bg-white text-ink-900 font-bold text-sm whitespace-nowrap shadow-soft hover:bg-ink-50 transition-colors';

/**
 * Link público só de leitura: quem abre vê os gastos da viagem (sem login).
 * O link só existe depois de "Criar link"; trocar gera outro e o anterior
 * para de funcionar; "Parar de compartilhar" desliga.
 */
export default function TripShareModal({ isOpen, onClose, trip, onShare, onStopSharing, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const link = trip?.share_code ? tripShareUrl(trip.share_code) : '';

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(travelErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  }

  function askRotate() {
    onConfirm({
      title: 'Gerar novo link',
      message: 'O link atual para de funcionar. Quem já recebeu precisa do novo.',
      confirmLabel: 'Gerar novo',
      onConfirm: () => run(() => onShare({ rotate: true })),
    });
  }

  function askStop() {
    onConfirm({
      title: 'Parar de compartilhar',
      message: 'O link para de funcionar e ninguém mais vê os gastos por ele.',
      confirmLabel: 'Parar de compartilhar',
      tone: 'danger',
      onConfirm: () => run(onStopSharing),
    });
  }

  const message = `Gastos da viagem “${trip?.name}”: ${link}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compartilhar gastos">
      <div className="space-y-4">
        <p className="text-sm text-ink-600 leading-relaxed">
          Quem abrir o link vê os gastos da viagem, por categoria e por pessoa — sem precisar de conta.
          Observações, orçamento e cartões não aparecem.
        </p>

        {!link ? (
          <button type="button" onClick={() => run(() => onShare())} disabled={busy} className="btn-accent w-full min-h-[52px] disabled:opacity-60">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />} Criar link
          </button>
        ) : (
          <div className="space-y-2 animate-slide-up">
            <p className="px-3 py-2.5 rounded-xl bg-ink-50 text-xs font-mono text-ink-700 break-all">{link}</p>
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn-accent w-full min-h-[52px]">
              <ExternalLink className="w-5 h-5" /> Abrir
            </a>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={copy} className={SECONDARY_BTN}>
                {copied ? <Check className="w-4 h-4 text-positive" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar link'}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}>
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <button type="button" onClick={askRotate} disabled={busy} className="text-xs font-semibold text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Gerar novo link
              </button>
              <button type="button" onClick={askStop} disabled={busy} className="text-xs font-semibold text-ink-500 hover:text-negative">
                Parar de compartilhar
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-negative font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
