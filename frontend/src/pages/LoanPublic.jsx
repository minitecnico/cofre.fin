import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Landmark, Loader2, FileWarning } from 'lucide-react';
import { loanService } from '../services';
import { parseLoanInfo } from '../utils/format';
import LoanStatement from '../components/LoanStatement';

/**
 * Página pública /emprestimo/:code — extrato de um empréstimo compartilhado
 * por link, só leitura e sem login. O banco (resolve_loan_share) só devolve o
 * que pode aparecer: parcelas, taxa, resumo do financiamento e observações.
 */
export default function LoanPublic() {
  const { code } = useParams();
  const [data, setData] = useState(undefined); // undefined = carregando, null = link inválido
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loanService.resolveShare(code).then(setData).catch(() => setFailed(true));
  }, [code]);

  if (failed || data === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center mb-4">
          <FileWarning className="w-7 h-7 text-ink-500" />
        </div>
        <p className="font-display font-bold text-xl">{failed ? 'Não foi possível abrir' : 'Link não encontrado'}</p>
        <p className="text-sm text-ink-500 mt-1 max-w-xs">
          {failed ? 'Confira sua internet e tente de novo.' : 'Este link não existe mais. Peça um novo a quem te enviou.'}
        </p>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-app">
        <Loader2 className="w-8 h-8 animate-spin text-ink-500 mb-3" />
        <p className="text-ink-600 text-sm">Carregando…</p>
      </div>
    );
  }

  const info = parseLoanInfo(data.loan_info);
  const rate = data.monthly_rate != null ? Number(data.monthly_rate) / 100 : info ? info.taxa : null;

  return (
    <div className="min-h-screen bg-gradient-app">
      <header className="bg-gradient-dark text-white">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
            <Landmark className="w-5 h-5 text-ink-900" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-base md:text-lg leading-tight">Extrato do empréstimo</p>
            <p className="text-xs text-ink-300">Compartilhado pelo Cofre · atualizado ao vivo</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-8 space-y-4">
        <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight tracking-tight break-words">
          {data.description || 'Empréstimo'}
        </h1>
        <LoanStatement parcels={data.parcels} rate={rate} info={info} notes={data.notes} />
      </main>
    </div>
  );
}
