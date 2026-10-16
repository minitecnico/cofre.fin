import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Copy, Check, FileWarning, QrCode } from 'lucide-react';
import { resolvePixLink } from '../services';
import { formatCurrency } from '../utils/format';

/**
 * Rota pública /pix/:code — página de pagamento PIX.
 *
 * Quem recebe a cobrança abre aqui (sem login): vê o QR Code (imagem do
 * Storage), o valor e o recebedor, e copia o código PIX pra pagar no app do banco.
 */
export default function PixPay() {
  const { code } = useParams();
  const [data, setData] = useState(undefined); // undefined=loading, null=notfound
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    resolvePixLink(code)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => { alive = false; };
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignora */ }
  }

  if (data === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app">
        <Loader2 className="w-8 h-8 animate-spin text-ink-500 mb-3" />
        <p className="text-ink-600 text-sm">Carregando cobrança…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center mb-3">
          <FileWarning className="w-7 h-7 text-ink-500" />
        </div>
        <p className="font-display font-bold text-lg text-ink-900">Cobrança não encontrada</p>
        <p className="text-sm text-ink-500 mt-1">Este link de pagamento não existe mais.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-app p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-soft-lg overflow-hidden">
        {/* Cabeçalho */}
        <div className="bg-gradient-dark text-white px-6 py-5 text-center">
          <div className="inline-flex items-center gap-2 text-accent font-bold text-sm">
            <QrCode className="w-4 h-4" /> Pagamento PIX
          </div>
          {data.recipient_name && (
            <p className="text-ink-300 text-xs mt-2">Pagar para</p>
          )}
          {data.recipient_name && (
            <p className="font-display font-bold text-lg">{data.recipient_name}</p>
          )}
          {data.amount != null && (
            <p className="font-display font-bold text-3xl mt-1">{formatCurrency(data.amount)}</p>
          )}
        </div>

        <div className="p-6 space-y-4 text-center">
          {/* QR Code (imagem do Storage) */}
          {data.qr_url ? (
            <img src={data.qr_url} alt="QR Code PIX" className="w-60 h-60 mx-auto rounded-2xl border border-ink-100" />
          ) : (
            <div className="w-60 h-60 mx-auto rounded-2xl bg-ink-50 flex items-center justify-center text-ink-400 text-sm">
              QR indisponível
            </div>
          )}

          <p className="text-xs text-ink-500">
            Escaneie no app do seu banco ou copie o código abaixo.
          </p>

          {/* Copia e cola */}
          <button onClick={copy} className="btn-primary w-full min-h-[52px] flex items-center justify-center gap-2">
            {copied ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5" />}
            {copied ? 'Código copiado!' : 'Copiar código PIX'}
          </button>

          <p className="text-[10px] text-ink-400 break-all leading-relaxed px-1">{data.payload}</p>
        </div>

        <div className="px-6 py-3 bg-ink-50 text-center">
          <p className="text-[11px] text-ink-400">Gerado pelo app Cofre</p>
        </div>
      </div>
    </div>
  );
}
