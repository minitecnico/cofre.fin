import { useState } from 'react';
import { Bug, Lightbulb, Info, Loader2, Send } from 'lucide-react';
import Modal from './Modal';
import { feedbackService } from '../services/comms';

const MAX = 2000;

const KINDS = [
  { value: 'problem', label: 'Problema', icon: Bug, placeholder: 'O que aconteceu? Em qual tela? O que você esperava que acontecesse?' },
  { value: 'suggestion', label: 'Sugestão', icon: Lightbulb, placeholder: 'O que você gostaria de ver no Cofre?' },
];

/** Problema ou sugestão pra central do administrador (aba Mensagens). */
export default function FeedbackModal({ isOpen, onClose, onSent }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Fale com a gente">
      {isOpen && <FeedbackForm onCancel={onClose} onSent={onSent} />}
    </Modal>
  );
}

function FeedbackForm({ onCancel, onSent }) {
  const [kind, setKind] = useState('problem');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const current = KINDS.find((k) => k.value === kind);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return setError('Escreva sua mensagem');
    setSending(true);
    setError(null);
    try {
      await feedbackService.send({ kind, message: text });
      onSent();
    } catch (err) {
      console.error(err);
      setError(navigator.onLine === false ? 'Sem internet — tente de novo quando a conexão voltar.' : 'Não foi possível enviar. Tente de novo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de mensagem">
        {KINDS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={`min-h-[48px] px-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              kind === value ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div>
        <label className="label">Mensagem</label>
        <textarea
          className="input-field min-h-[140px] resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX}
          placeholder={current.placeholder}
          autoFocus
          required
        />
        <p className="text-[11px] text-ink-400 text-right mt-1 tabular-nums">{message.length}/{MAX}</p>
      </div>

      <p className="flex items-start gap-2 text-xs text-ink-500 leading-relaxed">
        <Info className="w-4 h-4 flex-shrink-0" />
        Junto vai só o tipo de aparelho e navegador, pra ajudar a encontrar o problema. A resposta chega no seu e-mail.
      </p>

      {error && <p className="px-3 py-2 rounded-xl bg-red-50 text-sm text-negative font-medium">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={sending} className="btn-primary flex-1 disabled:opacity-60">
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar
        </button>
      </div>
    </form>
  );
}
