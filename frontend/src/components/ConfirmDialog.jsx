import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import Modal from './Modal';

/**
 * Confirmação explícita pra ações que não devem acontecer por toque acidental
 * (desfazer pagamento, excluir). O botão de confirmar fica do lado oposto ao
 * gesto que abriu o diálogo e o padrão é "Cancelar" — um segundo toque sem
 * querer no mesmo lugar não confirma nada.
 *
 * @param {{ title, message, confirmLabel, tone?: 'danger'|'primary', onConfirm }|null} request
 *        null = fechado. `onConfirm` pode ser async (botão mostra loading).
 */
export default function ConfirmDialog({ request, onClose }) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await request.onConfirm();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={!!request} onClose={busy ? () => {} : onClose} title={request?.title || ''} size="sm">
      <div className="space-y-5">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-xl bg-ink-100 flex items-center justify-center flex-shrink-0">
            <Lock className="w-[18px] h-[18px] text-ink-600" />
          </div>
          <div className="text-sm text-ink-600 leading-relaxed min-w-0">{request?.message}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost flex-1 min-h-[48px]" autoFocus>
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className={`${request?.tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'} flex-1 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {request?.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
