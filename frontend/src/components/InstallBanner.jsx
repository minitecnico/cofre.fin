import { useState } from 'react';
import { Download, X, Share2, Plus } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

/**
 * Banner de instalação do PWA.
 * --------------------------------------------------------------
 * - Android/Chrome: dispara o prompt nativo do navegador
 * - iOS Safari: mostra instruções manuais (sem prompt nativo)
 * - Já instalado: não aparece
 * - Dispensado: oculto por 7 dias
 *
 * Renderiza apenas onde for incluído (geralmente no Dashboard).
 */
export default function InstallBanner() {
  const { canInstall, isIOS, prompt, dismiss } = useInstallPrompt();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  if (!canInstall) return null;

  async function handleInstall() {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }
    const outcome = await prompt();
    if (outcome === 'dismissed') {
      dismiss();
    }
  }

  return (
    <>
      <div className="card-flat bg-accent text-ink-900 p-4 md:p-5 flex items-start gap-3 md:gap-4 animate-slide-up">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-ink-900 text-accent flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg md:text-xl font-bold">
            Instale o app
          </h3>
          <p className="text-xs md:text-sm mt-0.5 text-ink-700">
            Tenha o Cofre na tela inicial e abra como um app nativo.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="px-4 py-2 min-h-[40px] rounded-full bg-ink-900 text-white text-xs md:text-sm font-semibold hover:bg-ink-800 active:scale-[0.98] transition-all"
            >
              {isIOS ? 'Como instalar' : 'Instalar agora'}
            </button>
            <button
              onClick={dismiss}
              className="px-4 py-2 min-h-[40px] rounded-full text-xs md:text-sm font-medium text-ink-700 hover:bg-ink-900/10 transition-colors"
            >
              Mais tarde
            </button>
          </div>
        </div>

        <button
          onClick={dismiss}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-ink-900/10 transition-colors flex-shrink-0"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Modal de instruções iOS */}
      {showIOSInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowIOSInstructions(false)}
        >
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-3xl border border-hairline-light shadow-soft-xl w-full md:max-w-md p-5 md:p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl md:text-2xl font-bold">
                Instalar no iPhone
              </h3>
              <button
                onClick={() => setShowIOSInstructions(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-ink-100 transition-colors"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-4">
              <li className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-ink-900 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                  1
                </span>
                <div className="flex-1">
                  <p className="text-sm">
                    Toque no botão <strong>Compartilhar</strong>
                  </p>
                  <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ink-100 text-xs font-medium">
                    <Share2 className="w-4 h-4" />
                    na barra inferior do Safari
                  </div>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-ink-900 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                  2
                </span>
                <div className="flex-1">
                  <p className="text-sm">
                    Role e toque em <strong>"Adicionar à Tela de Início"</strong>
                  </p>
                  <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ink-100 text-xs font-medium">
                    <Plus className="w-4 h-4" />
                    Adicionar à Tela de Início
                  </div>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-ink-900 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                  3
                </span>
                <p className="text-sm pt-1">
                  Toque em <strong>"Adicionar"</strong> no canto superior direito.
                </p>
              </li>
            </ol>

            <p className="mt-5 pt-4 border-t border-ink-200 text-xs text-ink-500">
              💡 Funciona apenas no <strong>Safari</strong> (não funciona no Chrome do iPhone).
            </p>

            <button
              onClick={() => { setShowIOSInstructions(false); dismiss(); }}
              className="btn-accent w-full mt-4"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
