import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, Bot, CreditCard, Repeat, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

const links = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/incomes', label: 'Receitas', icon: ArrowUpCircle },
  { to: '/expenses', label: 'Despesas', icon: ArrowDownCircle },
  { to: '/cards', label: 'Cartões', icon: CreditCard },
  { to: '/recurring', label: 'Recorr.', icon: Repeat },
  { to: '/goals', label: 'Metas', icon: Sparkles },
  { to: '/ai', label: 'IA', icon: Bot },
];

export default function BottomNav() {
  const reduce = useReducedMotion();

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
              {/* Indicador ativo: desliza suavemente entre abas via layoutId */}
              {isActive && (
                <motion.span
                  layoutId="bottomnav-indicator"
                  className="absolute top-0 left-0 right-0 mx-auto w-8 h-0.5 bg-accent rounded-full"
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: 'spring', damping: 30, stiffness: 400 }
                  }
                />
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
