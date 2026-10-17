import { useEffect, useState } from 'react';
import { AtSign, Copy, Check, Edit2 } from 'lucide-react';
import { profileService } from '../services/goals';

/**
 * @nick do usuário — é por ele que outras pessoas o convidam para metas
 * coletivas, sem precisar trocar e-mail. Sem nick, mostra o formulário.
 */
export default function NickCard() {
  const [nick, setNick] = useState(undefined); // undefined = carregando
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    profileService.getMyNick().then(setNick).catch(() => setNick(null));
  }, []);

  if (nick === undefined) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      setNick(await profileService.setNick(value));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(`@${nick}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  }

  if (nick && !editing) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-500">
        <AtSign className="w-3.5 h-3.5" />
        <span>Seu nick para convites: <strong className="text-ink-900">@{nick}</strong></span>
        <button onClick={copy} className="p-1.5 rounded-lg hover:bg-ink-100" title="Copiar nick" aria-label="Copiar nick">
          {copied ? <Check className="w-3.5 h-3.5 text-positive" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => { setValue(nick); setEditing(true); }} className="p-1.5 rounded-lg hover:bg-ink-100" title="Alterar nick" aria-label="Alterar nick">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card-flat p-4 space-y-2">
      <p className="text-sm font-bold flex items-center gap-1.5">
        <AtSign className="w-4 h-4" /> {nick ? 'Alterar seu nick' : 'Crie seu @nick'}
      </p>
      <p className="text-xs text-ink-500">
        É com ele que outras pessoas convidam você para metas coletivas.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ex: ana.silva"
          className="input-field flex-1"
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={21}
          required
        />
        <button type="submit" disabled={submitting} className="btn-accent !px-4">
          {submitting ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      {nick && (
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-500 underline">Cancelar</button>
      )}
      {error && <p className="text-xs text-negative">{error}</p>}
    </form>
  );
}
