import { useState, useEffect, useCallback } from 'react';
import { Paperclip, FileText, Trash2, Loader2, X } from 'lucide-react';
import { goalReceiptService } from '../services/goals';
import { RECEIPT_ACCEPT } from '../constants';
import { formatCurrency, formatDate } from '../utils/format';

/**
 * Comprovantes de PIX de uma meta — lista, abre, exclui e envia avulso
 * (ex.: PIX feito antes de existir o campo no depósito, ou meta já concluída).
 *
 * Em meta coletiva todos enviam e veem (com o nome de quem enviou); excluir é
 * só do dono (`canDelete`) — o RLS garante o mesmo no banco.
 */
export default function GoalReceipts({ goal, canDelete }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setReceipts(await goalReceiptService.list(goal.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [goal.id]);

  useEffect(() => { load(); }, [load]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await goalReceiptService.upload(goal.id, file);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(receipt) {
    setError(null);
    try {
      await goalReceiptService.remove(receipt);
      setReceipts((rs) => rs.filter((r) => r.id !== receipt.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="px-4 py-3 bg-ink-50 rounded-xl">
        <p className="text-xs uppercase tracking-widest font-bold text-ink-500">Meta</p>
        <p className="font-bold text-sm md:text-base mt-0.5">{goal.title}</p>
      </div>

      <label
        className={`flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] border border-dashed border-ink-300 rounded-xl text-sm font-bold text-ink-700 transition-colors ${
          uploading ? 'opacity-60 pointer-events-none' : 'hover:bg-ink-50 cursor-pointer'
        }`}
      >
        {uploading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
          : <><Paperclip className="w-4 h-4" /> Enviar comprovante</>}
        <input
          type="file"
          accept={RECEIPT_ACCEPT}
          onChange={handleFile}
          disabled={uploading}
          className="sr-only"
        />
      </label>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 bg-ink-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : receipts.length === 0 ? (
        <p className="text-sm text-ink-500 text-center py-4">
          Nenhum comprovante ainda. Imagem ou PDF, até 5 MB.
        </p>
      ) : (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-2 rounded-xl border border-ink-200">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 min-w-0 flex-1"
              >
                <div className="w-12 h-12 rounded-lg bg-ink-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {r.mime_type.startsWith('image/') && r.url
                    ? <img src={r.url} alt="" className="w-full h-full object-cover" />
                    : <FileText className="w-5 h-5 text-ink-500" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">
                    {r.amount != null ? formatCurrency(r.amount) : r.file_name}
                  </p>
                  <p className="text-xs text-ink-500 truncate">
                    {[
                      goal.is_shared && r.display_name,
                      formatDate(new Date(r.created_at), 'long'),
                      r.amount != null && r.file_name,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </a>

              {!canDelete ? null : confirmingId === r.id ? (
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleRemove(r)}
                    className="px-3 min-h-[40px] rounded-lg bg-negative text-white text-xs font-bold"
                  >
                    Excluir
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100"
                    aria-label="Cancelar exclusão"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingId(r.id)}
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-ink-400 hover:text-negative hover:bg-red-50 transition-colors"
                  title="Excluir comprovante"
                  aria-label="Excluir comprovante"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!canDelete && receipts.length > 0 && (
        <p className="text-[11px] text-ink-400">Só quem criou a meta pode excluir comprovantes.</p>
      )}
    </div>
  );
}
