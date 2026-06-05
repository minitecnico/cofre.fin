import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, CreditCard, Repeat, Sparkles, FileText } from 'lucide-react';

const links = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/incomes', label: 'Receitas', icon: ArrowUpCircle },
  { to: '/expenses', label: 'Despesas', icon: ArrowDownCircle },
  { to: '/cards', label: 'Cartões', icon: CreditCard },
  { to: '/recurring', label: 'Recorr.', icon: Repeat },
  { to: '/goals', label: 'Metas', icon: Sparkles },
  { to: '/reports', label: 'Relat.', icon: FileText },
];

export default function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-gradient-dark text-ink-50 grid grid-cols-7 shadow-soft-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {links.map(({ to, label, icon: Icon, end }) => (
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
              <span className={`text-[10px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
