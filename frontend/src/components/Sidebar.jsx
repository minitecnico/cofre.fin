import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, Bot, CreditCard, Tag, LogOut, Wallet, Repeat, Settings, Sparkles, FileText, HandCoins } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AlertCenter from './AlertCenter';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/incomes', label: 'Receitas', icon: ArrowUpCircle },
  { to: '/expenses', label: 'Despesas', icon: ArrowDownCircle },
  { to: '/recurring', label: 'Recorrências', icon: Repeat },
  { to: '/cards', label: 'Cartões', icon: CreditCard },
  { to: '/cobrancas', label: 'Cobranças', icon: HandCoins },
  { to: '/goals', label: 'Objetivos', icon: Sparkles },
  { to: '/ai', label: 'Assistente IA', icon: Bot },
  { to: '/reports', label: 'Relatórios', icon: FileText },
  { to: '/categories', label: 'Categorias', icon: Tag },
  { to: '/settings', label: 'Ajustes', icon: Settings },
];

/**
 * Sidebar — visível apenas em telas md+ (≥768px).
 * Visual moderno: gradiente escuro suave + ícones com glow.
 */
export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="hidden md:flex w-60 lg:w-64 min-h-screen bg-gradient-dark text-ink-50 flex-col sticky top-0 shadow-soft-lg">
      {/* Logo */}
      <div className="p-6 lg:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 lg:w-11 lg:h-11 bg-gradient-accent rounded-xl flex items-center justify-center shadow-soft-md flex-shrink-0">
              <Wallet className="w-5 h-5 text-ink-900" strokeWidth={2.5} />
            </div>
            <h1 className="font-display text-2xl lg:text-3xl font-bold leading-none tracking-tight">
              Cofre
            </h1>
          </div>
          {/* Sino de alertas — text-ink-50 pra adaptar à sidebar escura */}
          <div className="text-ink-50 flex-shrink-0">
            <AlertCenter variant="sidebar" />
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-accent text-ink-900 shadow-soft-md'
                  : 'text-ink-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-4 mx-3 mb-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-gradient-accent text-ink-900 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-soft-md">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-xs text-ink-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-ink-300 hover:bg-white/5 hover:text-negative transition-all duration-200 font-medium"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
