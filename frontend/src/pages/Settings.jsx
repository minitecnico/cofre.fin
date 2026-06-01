import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, LogOut, Mail, User as UserIcon,
  FileSpreadsheet, Key, CheckCircle2, X, Compass,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import ChangePasswordModal from '../components/ChangePasswordModal';
import GoogleIcon from '../components/GoogleIcon';

/**
 * Página de Ajustes — versão minimalista.
 * Conta + Importar/Exportar + Alterar senha + Sair.
 */
export default function Settings() {
  const { user, logout, listIdentities, linkGoogle, unlinkIdentity } = useAuth();
  const { start: startTour } = useTour();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [toast, setToast] = useState(null); // { text } | null
  const [identities, setIdentities] = useState(null); // null = carregando
  const [linkBusy, setLinkBusy] = useState(false);

  // Auto-dismiss do toast em 4 segundos
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // Carrega as identidades vinculadas (email/senha, google, ...)
  useEffect(() => {
    let alive = true;
    listIdentities()
      .then((list) => { if (alive) setIdentities(list); })
      .catch(() => { if (alive) setIdentities([]); });
    return () => { alive = false; };
  }, [listIdentities]);

  const googleIdentity = identities?.find((i) => i.provider === 'google') ?? null;

  async function handleLinkGoogle() {
    setLinkBusy(true);
    try {
      await linkGoogle(); // redireciona para o Google; volta para /settings
    } catch (err) {
      setToast({ text: err.message || 'Não foi possível vincular o Google' });
      setLinkBusy(false);
    }
  }

  async function handleUnlinkGoogle() {
    if (!googleIdentity) return;
    // Trava: não deixa remover o último meio de login.
    if ((identities?.length ?? 0) <= 1) {
      setToast({ text: 'Defina uma senha antes de desvincular o Google.' });
      return;
    }
    setLinkBusy(true);
    try {
      await unlinkIdentity(googleIdentity);
      setIdentities((prev) => prev.filter((i) => i.provider !== 'google'));
      setToast({ text: 'Conta Google desvinculada.' });
    } catch (err) {
      setToast({ text: err.message || 'Não foi possível desvincular' });
    } finally {
      setLinkBusy(false);
    }
  }

  function handlePasswordChangeSuccess() {
    setChangePasswordOpen(false);
    setToast({ text: 'Senha alterada com sucesso!' });
  }

  return (
    <div className="space-y-4 md:space-y-6 max-w-2xl">
      <div>
        <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">
          Configurações
        </p>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight tracking-tight flex items-center gap-2 md:gap-3">
          <SettingsIcon className="w-7 h-7 md:w-10 md:h-10 flex-shrink-0" strokeWidth={2.25} />
          <span>Ajustes</span>
        </h1>
      </div>

      {/* Conta */}
      <div className="card-flat p-5 md:p-6">
        <h3 className="font-display text-lg md:text-xl font-bold mb-4 tracking-tight">Sua conta</h3>

        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-accent flex items-center justify-center font-display text-2xl font-bold text-ink-900 shadow-soft">
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-ink-900 truncate">{user?.name}</p>
            <p className="text-sm text-ink-500 truncate">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-ink-100">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
            <UserIcon className="w-4 h-4 text-ink-400" strokeWidth={2} />
            <span className="text-[10px] uppercase tracking-widest text-ink-500 font-semibold w-16">
              Nome
            </span>
            <span className="text-sm font-semibold text-ink-900 truncate">{user?.name}</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
            <Mail className="w-4 h-4 text-ink-400" strokeWidth={2} />
            <span className="text-[10px] uppercase tracking-widest text-ink-500 font-semibold w-16">
              E-mail
            </span>
            <span className="text-sm font-semibold text-ink-900 truncate">{user?.email}</span>
          </div>
        </div>
      </div>

      {/* Contas vinculadas */}
      <div data-tour="link-accounts" className="card-flat p-5 md:p-6">
        <h3 className="font-display text-lg md:text-xl font-bold mb-1 tracking-tight">Contas vinculadas</h3>
        <p className="text-xs md:text-sm text-ink-500 mb-4">
          Conecte o Google para entrar com um toque, sem digitar senha.
        </p>

        <div className="flex items-center justify-between gap-4 px-3 py-3 rounded-xl bg-ink-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white shadow-soft flex items-center justify-center flex-shrink-0">
              <GoogleIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-ink-900">Google</p>
              <p className="text-xs text-ink-500 truncate">
                {identities === null
                  ? 'Verificando…'
                  : googleIdentity
                    ? (googleIdentity.identity_data?.email || 'Vinculado')
                    : 'Não vinculado'}
              </p>
            </div>
          </div>

          {identities !== null && (
            googleIdentity ? (
              <button
                onClick={handleUnlinkGoogle}
                disabled={linkBusy}
                className="text-xs font-semibold text-negative hover:underline disabled:opacity-50 flex-shrink-0"
              >
                Desvincular
              </button>
            ) : (
              <button
                onClick={handleLinkGoogle}
                disabled={linkBusy}
                className="text-xs font-semibold text-accent-dark hover:underline disabled:opacity-50 flex-shrink-0"
              >
                {linkBusy ? 'Aguarde…' : 'Vincular'}
              </button>
            )
          )}
        </div>
      </div>

      {/* Alterar senha */}
      <button
        onClick={() => setChangePasswordOpen(true)}
        className="w-full card-flat p-5 md:p-6 text-left transition-all duration-200 hover:border-ink-900/40 group"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-ink-100 group-hover:bg-ink-900 group-hover:text-white flex items-center justify-center text-ink-700 transition-all duration-200 flex-shrink-0">
              <Key className="w-5 h-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold text-base md:text-lg text-ink-900">
                Alterar senha
              </p>
              <p className="text-xs md:text-sm text-ink-500 truncate">
                Troque sua senha de acesso ao Cofre
              </p>
            </div>
          </div>
          <span className="text-ink-400 text-xl flex-shrink-0">→</span>
        </div>
      </button>

      {/* Importar / Exportar */}
      <Link
        to="/import-export"
        className="block w-full card-flat p-5 md:p-6 transition-all duration-200 hover:border-ink-900/40 group"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-accent/30 group-hover:bg-gradient-accent group-hover:shadow-soft-md flex items-center justify-center text-ink-900 transition-all duration-200 flex-shrink-0">
              <FileSpreadsheet className="w-5 h-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold text-base md:text-lg text-ink-900">
                Importar e exportar
              </p>
              <p className="text-xs md:text-sm text-ink-500 truncate">
                Baixe seus dados em CSV ou suba uma planilha preenchida
              </p>
            </div>
          </div>
          <span className="text-ink-400 text-xl flex-shrink-0">→</span>
        </div>
      </Link>

      {/* Rever tour guiado */}
      <button
        onClick={startTour}
        className="w-full card-flat p-5 md:p-6 text-left transition-all duration-200 hover:border-ink-900/40 group"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-ink-100 group-hover:bg-ink-900 group-hover:text-white flex items-center justify-center text-ink-700 transition-all duration-200 flex-shrink-0">
              <Compass className="w-5 h-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold text-base md:text-lg text-ink-900">
                Rever tour guiado
              </p>
              <p className="text-xs md:text-sm text-ink-500 truncate">
                Refaça a apresentação interativa do app
              </p>
            </div>
          </div>
          <span className="text-ink-400 text-xl flex-shrink-0">→</span>
        </div>
      </button>

      {/* Sair */}
      <button
        onClick={logout}
        className="w-full card-flat p-5 md:p-6 text-left transition-all duration-200 hover:border-negative/40 group"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-red-50 group-hover:bg-negative group-hover:text-white flex items-center justify-center text-negative transition-all duration-200 flex-shrink-0">
              <LogOut className="w-5 h-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold text-base md:text-lg text-ink-900">
                Sair da conta
              </p>
              <p className="text-xs md:text-sm text-ink-500 truncate">
                Encerra esta sessão neste dispositivo
              </p>
            </div>
          </div>
          <span className="text-ink-400 text-xl flex-shrink-0">→</span>
        </div>
      </button>

      {/* Sobre — bem discreto no rodapé */}
      <p className="text-center text-[10px] uppercase tracking-widest text-ink-400 pt-4">
        Cofre · controle financeiro pessoal
      </p>

      {/* Modal de alterar senha */}
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onSuccess={handlePasswordChangeSuccess}
      />

      {/* Toast flutuante de sucesso */}
      {toast && (
        <div className="fixed top-4 md:top-6 left-1/2 -translate-x-1/2 z-[60] animate-fade-in px-2 max-w-md w-full">
          <div className="bg-gradient-accent text-ink-900 px-4 py-3 rounded-2xl shadow-soft-lg flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-ink-900 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-accent" strokeWidth={2.5} />
            </div>
            <p className="font-bold text-sm flex-1">{toast.text}</p>
            <button
              onClick={() => setToast(null)}
              className="w-6 h-6 rounded-md hover:bg-ink-900/15 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
