import { Wallet, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AlertCenter from './AlertCenter';

export default function MobileHeader() {
  const { logout } = useAuth();

  /*
   * O padding-top com safe-area existe por causa do APK: no Android 15 o app
   * desenha edge-to-edge, então sem isso o nome, o sino e o botão sair ficam por
   * baixo do relógio e da bateria. O espaço vai DENTRO do header para o gradiente
   * escuro preencher também a faixa da barra de status.
   * No navegador o env() resolve para 0 e o espaçamento volta a ser o py-3 original.
   */
  return (
    <header className="md:hidden sticky top-0 z-20 bg-gradient-dark text-ink-50 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] flex items-center justify-between shadow-soft-md">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 bg-gradient-accent rounded-xl flex items-center justify-center shadow-soft flex-shrink-0">
          <Wallet className="w-4 h-4 text-ink-900" strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-xl font-bold leading-none tracking-tight">Cofre</h1>
      </div>

      <div className="flex items-center gap-1">
        {/* Sino de alertas — variant sidebar pra usar cores escuras */}
        <div className="text-ink-50">
          <AlertCenter variant="sidebar" />
        </div>

        <button
          onClick={logout}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-300 hover:bg-white/5 hover:text-negative transition-all duration-200"
          aria-label="Sair"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
