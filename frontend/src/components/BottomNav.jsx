import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ArrowDownCircle, ArrowUpCircle, CreditCard,
  MoreHorizontal, Repeat, Sparkles, FileText, HandCoins, Tag, Settings, X,
} from 'lucide-react';

// Itens fixos na barra inferior (mobile) — só os de uso diário.
const primary = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/incomes', label: 'Receitas', icon: ArrowUpCircle },
  { to: '/expenses', label: 'Despesas', icon: ArrowDownCircle },
  { to: '/cards', label: 'Cartões', icon: CreditCard },
];

// Itens secundários — abrem na folha "Mais" (resolve a falta de espaço e
// dá acesso mobile a páginas que antes só existiam na sidebar do desktop).
const secondary = [
  { to: '/cobrancas', label: 'Cobranças', icon: HandCoins },
  { to: '/recurring', label: 'Recorrências', icon: Repeat },
  { to: '/goals', label: 'Objetivos', icon: Sparkles },
  { to: '/reports', label: 'Relatórios', icon: FileText },
  { to: '/categories', label: 'Categorias', icon: Tag },
  { to: '/settings', label: 'Ajustes', icon: Settings },
];

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-gradient-dark text-ink-50 grid grid-cols-5 shadow-soft-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primary.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[58px] transition-all duration-200 ${
                isActive ? 'text-accent' : 'text-ink-400 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full" />
                )}
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[10px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Botão "Mais" */}
        <button
          onClick={() => setMoreOpen(true)}
          className="relative flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[58px] text-ink-400 hover:text-white transition-all duration-200"
        >
          <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
          <span className="text-[10px] tracking-wide font-medium">Mais</span>
        </button>
      </nav>

      {/* Folha "Mais" */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-label="Mais opções">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-4 pb-8 shadow-soft-xl animate-slide-up"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-lg tracking-tight">Mais</h3>
              <button onClick={() => setMoreOpen(false)} className="w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {secondary.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-1.5 p-3 min-h-[80px] rounded-2xl transition-colors ${
                      isActive ? 'bg-accent/20 text-ink-900' : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" strokeWidth={2.25} />
                  <span className="text-xs font-semibold text-center leading-tight">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
