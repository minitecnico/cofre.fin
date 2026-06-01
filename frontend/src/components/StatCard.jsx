import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'motion/react';
import { formatCurrency } from '../utils/format';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

/**
 * Card de estatística com gradientes modernos.
 * variant: 'balance' (escuro) | 'income' (verde) | 'expense' (branco)
 *
 * status (opcional): cor "inteligente" sobreposta ao visual base.
 *  - 'danger' → tons de atenção (vermelho): ex. saldo negativo ou despesas > receitas
 *  - 'safe'   → tons de tranquilidade (verde): ex. saldo positivo / despesas sob controle
 *  - undefined → usa o visual neutro do variant.
 * O motivo: o card deve "gritar" quando o usuário está gastando mais do que ganha.
 */
export default function StatCard({ label, value, variant = 'balance', icon: Icon, trend, sublabel, status }) {
  // Cada variant tem um estilo base (sem status) e overrides por status.
  // Quando há status, ele vence — é o sinal mais importante para o usuário.
  const STYLES = {
    balance: {
      base:   { card: 'bg-gradient-balance text-ink-50',  label: 'text-ink-300',   sub: 'text-ink-400',    icon: 'bg-white/10 text-accent', num: '' },
      safe:   { card: 'bg-gradient-balance text-ink-50',  label: 'text-ink-300',   sub: 'text-ink-400',    icon: 'bg-positive/20 text-positive', num: 'text-positive' },
      danger: { card: 'bg-gradient-negative text-white',  label: 'text-white/80',  sub: 'text-white/70',   icon: 'bg-white/15 text-white', num: 'text-white' },
    },
    income: {
      base:   { card: 'bg-gradient-accent text-ink-900',  label: 'text-ink-800',   sub: 'text-ink-700/80', icon: 'bg-ink-900/10 text-ink-900', num: '' },
    },
    expense: {
      base:   { card: 'bg-gradient-card text-ink-900 border border-ink-200/80', label: 'text-ink-500', sub: 'text-ink-500', icon: 'bg-ink-100 text-ink-700', num: 'text-ink-900' },
      safe:   { card: 'bg-gradient-card text-ink-900 border border-positive/40', label: 'text-ink-500', sub: 'text-ink-500', icon: 'bg-positive/15 text-positive', num: 'text-ink-900' },
      danger: { card: 'bg-gradient-negative text-white', label: 'text-white/80', sub: 'text-white/70', icon: 'bg-white/15 text-white', num: 'text-white' },
    },
  };

  const s = STYLES[variant]?.[status] || STYLES[variant].base;

  // Card vermelho (danger): texto já é branco; não pintar de vermelho por cima.
  const numColor = status === 'danger' ? s.num : (value < 0 ? 'text-negative' : s.num);

  const variantClasses = { [variant]: s.card };
  const labelColor = { [variant]: s.label };
  const sublabelColor = { [variant]: s.sub };
  const iconBg = { [variant]: s.icon };

  const reduce = useReducedMotion();

  // Anima o número do valor anterior (ou 0 no primeiro mount) até o atual.
  // useMotionValue preserva o último valor entre renders, então mudar `value`
  // (ex: ao trocar de mês) faz tween do valor anterior pro novo — não do zero.
  const motionValue = useMotionValue(0);
  const displayValue = useTransform(motionValue, (latest) => formatCurrency(latest));

  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.8, ease: 'easeOut' });
    return () => controls.stop();
  }, [value, motionValue]);

  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl shadow-soft p-5 md:p-6 transition-shadow duration-300 hover:shadow-soft-md ${variantClasses[variant]}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      whileHover={reduce ? undefined : { y: -3 }}
    >
      {/* Decorativo: círculo gradiente sutil no canto */}
      {variant === 'balance' && (
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      )}

      <div className="relative flex items-start justify-between mb-3 md:mb-4 gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] md:text-[11px] uppercase font-bold tracking-widest ${labelColor[variant]}`}>
            {label}
          </p>
          {sublabel && (
            <p className={`text-xs mt-0.5 truncate ${sublabelColor[variant]}`}>
              {sublabel}
            </p>
          )}
        </div>
        {Icon && (
          <div className={`w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg[variant]}`}>
            <Icon className="w-5 h-5" strokeWidth={2.25} />
          </div>
        )}
      </div>

      <motion.div className={`relative stat-number text-3xl sm:text-4xl md:text-[2.5rem] break-all leading-tight ${numColor}`}>
        {displayValue}
      </motion.div>

      {trend !== undefined && trend !== null && (
        <div className="relative mt-3 md:mt-4 flex items-center gap-1.5 text-xs md:text-sm">
          {(() => {
            // Em despesa, subir é ruim (invertido). No card vermelho (danger) o
            // texto é branco para manter contraste sobre o fundo.
            const isExpense = variant === 'expense';
            const good = isExpense ? trend < 0 : trend > 0;
            const arrowColor = status === 'danger' ? 'text-white' : good ? 'text-positive' : 'text-negative';
            const textColor = status === 'danger' ? 'text-white' : good ? 'text-positive' : 'text-negative';
            return (
              <>
                {trend > 0 ? (
                  <ArrowUpRight className={`w-4 h-4 ${arrowColor} flex-shrink-0`} />
                ) : trend < 0 ? (
                  <ArrowDownRight className={`w-4 h-4 ${arrowColor} flex-shrink-0`} />
                ) : null}
                <span className={`font-bold ${textColor}`}>
                  {/* Cap em 999+% — variações enormes (base minúscula) viram ruído */}
                  {Math.abs(trend) > 999
                    ? '999+%'
                    : `${trend > 0 ? '+' : ''}${Math.abs(trend).toFixed(1)}%`}
                </span>
              </>
            );
          })()}
          <span className={`truncate font-medium ${sublabelColor[variant]}`}>
            vs mês anterior
          </span>
        </div>
      )}
    </motion.div>
  );
}
