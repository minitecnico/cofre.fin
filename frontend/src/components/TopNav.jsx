import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, ArrowDownCircle, ArrowUpCircle, CreditCard, Tag, LogOut, Wallet, Repeat, Settings,
  Car, ShieldCheck, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AlertCenter from './AlertCenter';

// Itens diretos e grupos com menu (11 páginas não cabem numa linha só).
const NAV = [
  { to: '/', label: 'Início', icon: Home },
  {
    label: 'Finanças',
    items: [
      { to: '/incomes', label: 'Receitas', icon: ArrowUpCircle, hint: 'Entradas do mês' },
      { to: '/expenses', label: 'Despesas', icon: ArrowDownCircle, hint: 'Contas e gastos' },
      { to: '/recurring', label: 'Recorrências', icon: Repeat, hint: 'Aluguel, assinaturas' },
      { to: '/cards', label: 'Cartões', icon: CreditCard, hint: 'Faturas e limite' },
    ],
  },
  { to: '/cobrancas', label: 'Cobranças' },
  { to: '/goals', label: 'Objetivos' },
  {
    label: 'Mais',
    items: [
      { to: '/categories', label: 'Categorias', icon: Tag, hint: 'Receitas e despesas' },
      { to: '/fipe', label: 'Tabela FIPE', icon: Car, hint: 'Preço de veículos' },
    ],
  },
];

// Só aparece pra quem é admin (o banco também barra as RPCs do painel).
const ADMIN_ITEM = { to: '/admin', label: 'Admin', icon: ShieldCheck, hint: 'Central do administrador' };

const ITEM = 'relative h-14 px-3 inline-flex items-center gap-1.5 text-sm font-medium transition-colors';
const ACTIVE = 'text-white after:absolute after:left-3 after:right-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent';
const IDLE = 'text-ink-300 hover:text-white';

/**
 * Navegação do desktop (md+): barra no topo, mesmas cores da antiga sidebar.
 * Logo à esquerda, páginas no centro (grupos abrem menu no clique), sino e
 * conta à direita. No celular quem navega é MobileHeader + BottomNav.
 */
export default function TopNav() {
  const { user, logout, isAdmin } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(null); // label do menu aberto
  const barRef = useRef(null);

  // Fecha ao trocar de página, clicar fora ou apertar Esc.
  useEffect(() => { setOpen(null); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!barRef.current?.contains(e.target)) setOpen(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (label) => setOpen((cur) => (cur === label ? null : label));
  const isActive = (to) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <header ref={barRef} className="hidden md:block sticky top-0 z-30 bg-gradient-dark text-ink-50 shadow-soft-md">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-8 h-14 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <NavLink to="/" className="flex items-center gap-2.5 min-w-0 justify-self-start">
          <span className="w-9 h-9 bg-gradient-accent rounded-xl flex items-center justify-center shadow-soft-md flex-shrink-0">
            <Wallet className="w-[18px] h-[18px] text-ink-900" strokeWidth={2.5} />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">Cofre</span>
        </NavLink>

        <nav className="flex items-center" aria-label="Principal">
          {NAV.map((entry) => {
            if (entry.to) {
              const Icon = entry.icon;
              return (
                <NavLink key={entry.to} to={entry.to} end={entry.to === '/'} className={({ isActive: a }) => `${ITEM} ${a ? ACTIVE : IDLE}`}>
                  {Icon && <Icon className="w-4 h-4" strokeWidth={2.25} />}
                  {entry.label}
                </NavLink>
              );
            }
            const items = entry.label === 'Mais' && isAdmin ? [...entry.items, ADMIN_ITEM] : entry.items;
            const groupActive = items.some((i) => isActive(i.to));
            return (
              <div key={entry.label} className="relative">
                <button
                  type="button"
                  onClick={() => toggle(entry.label)}
                  aria-expanded={open === entry.label}
                  aria-haspopup="menu"
                  className={`${ITEM} ${groupActive ? ACTIVE : open === entry.label ? 'text-white' : IDLE}`}
                >
                  {entry.label}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open === entry.label ? 'rotate-180' : ''}`} />
                </button>
                {open === entry.label && (
                  <Panel className="left-1/2 -translate-x-1/2">
                    {items.map((i) => <PanelLink key={i.to} {...i} active={isActive(i.to)} />)}
                  </Panel>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 justify-self-end">
          <AlertCenter variant="sidebar" />
          <div className="relative">
            <button
              type="button"
              onClick={() => toggle('conta')}
              aria-expanded={open === 'conta'}
              aria-haspopup="menu"
              className="h-10 pl-1 pr-2 rounded-full flex items-center gap-1.5 hover:bg-white/10 transition-colors"
              title={user?.email}
            >
              <span className="w-8 h-8 bg-gradient-accent text-ink-900 rounded-full flex items-center justify-center font-bold text-sm shadow-soft-md">
                {user?.name?.[0]?.toUpperCase()}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-ink-300 transition-transform ${open === 'conta' ? 'rotate-180' : ''}`} />
            </button>
            {open === 'conta' && (
              <Panel className="right-0">
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold text-ink-900 truncate">{user?.name}</p>
                  <p className="text-xs text-ink-500 truncate">{user?.email}</p>
                </div>
                <div className="my-1 border-t border-ink-100" />
                <PanelLink to="/settings" label="Ajustes" icon={Settings} active={isActive('/settings')} />
                <button
                  type="button"
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-700 hover:bg-red-50 hover:text-negative transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center flex-shrink-0">
                    <LogOut className="w-4 h-4" />
                  </span>
                  Sair
                </button>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Panel({ className = '', children }) {
  return (
    <div role="menu" className={`absolute top-full mt-2 w-64 p-2 bg-white rounded-2xl border border-hairline-light shadow-soft-xl animate-fade-in ${className}`}>
      {children}
    </div>
  );
}

function PanelLink({ to, label, icon: Icon, hint, active }) {
  return (
    <NavLink
      to={to}
      role="menuitem"
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${active ? 'bg-accent/20' : 'hover:bg-ink-50'}`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-ink-900 text-accent' : 'bg-ink-100 text-ink-700'}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        {hint && <span className="block text-xs text-ink-500 truncate">{hint}</span>}
      </span>
    </NavLink>
  );
}
