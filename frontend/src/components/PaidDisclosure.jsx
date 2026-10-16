import { useState } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../utils/format';

/**
 * Seção recolhida com o que já foi pago. Mantém a lista enxuta: o que está em
 * aberto fica visível; o histórico pago aparece só quando a pessoa toca.
 * Usado na tela de Cobranças (credor) e no extrato público (devedor).
 */
export default function PaidDisclosure({ count, total, label, className = '', children }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 min-h-[40px] text-xs font-semibold text-positive hover:bg-ink-50 transition-colors"
      >
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">{label} · {formatCurrency(total)}</span>
        <span className="text-[11px] text-ink-400 font-semibold">{open ? 'Ocultar' : 'Ver'}</span>
        <ChevronDown className={`w-4 h-4 text-ink-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="animate-fade-in">{children}</div>}
    </div>
  );
}
