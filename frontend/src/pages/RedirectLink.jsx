import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, FileWarning } from 'lucide-react';
import { resolveReportLink } from '../services';

/**
 * Rota pública /r/:code — resolve o código curto e redireciona pro PDF.
 *
 * Não exige login (a RPC resolve_report_link é pública). Mostra um spinner e,
 * se o código não existir/expirar, uma mensagem amigável.
 */
export default function RedirectLink() {
  const { code } = useParams();
  const [state, setState] = useState('loading'); // 'loading' | 'notfound' | 'error'

  useEffect(() => {
    let alive = true;
    resolveReportLink(code)
      .then((url) => {
        if (!alive) return;
        if (url) {
          window.location.replace(url); // troca pela URL real (baixa o PDF)
        } else {
          setState('notfound');
        }
      })
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, [code]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app p-6 text-center">
      {state === 'loading' ? (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-ink-500 mb-3" />
          <p className="text-ink-600 text-sm">Abrindo o relatório…</p>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center mb-3">
            <FileWarning className="w-7 h-7 text-ink-500" />
          </div>
          <p className="font-display font-bold text-lg text-ink-900">Link indisponível</p>
          <p className="text-sm text-ink-500 mt-1 max-w-xs">
            {state === 'notfound'
              ? 'Este link não existe ou expirou. Peça um novo relatório.'
              : 'Algo deu errado ao abrir o relatório. Tente de novo.'}
          </p>
        </>
      )}
    </div>
  );
}
