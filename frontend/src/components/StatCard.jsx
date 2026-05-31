import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'motion/react';
import { formatCurrency } from '../utils/format';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

/**
 * Card de estatística com gradientes modernos.
 * variant: 'balance' (escuro) | 'income' (verde) | 'expense' (branco)
 */
export default function StatCard({ label, value, variant = 'balance', icon: Icon, trend, sublabel }) {
  const variantClasses = {
    balance: 'bg-gradient-balance text-ink-50',
    income:  'bg-gradient-accent text-ink-900',
    expense: 'bg-gradient-card text-ink-900 border border-ink-200/80',
  };

  const labelColor = {
    balance: 'text-ink-300',
    income:  'text-ink-800',
    expense: 'text-ink-500',
  };

  const sublabelColor = {
    balance: 'text-ink-400',
    income:  'text-ink-700/80',
    expense: 'text-ink-500',
  };

  const iconBg = {
    balance: 'bg-white/10 text-accent',
    income:  'bg-ink-900/10 text-ink-900',
    expense: 'bg-ink-100 text-ink-700',
  };

  const numColor =
    variant === 'expense'
      ? value < 0 ? 'text-negative' : 'text-ink-900'
      : value < 0 ? 'text-negative' : '';

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
          {trend > 0 ? (
            <ArrowUpRight className={`w-4 h-4 ${variant === 'expense' ? 'text-negative' : 'text-positive'} flex-shrink-0`} />
          ) : trend < 0 ? (
            <ArrowDownRight className={`w-4 h-4 ${variant === 'expense' ? 'text-positive' : 'text-negative'} flex-shrink-0`} />
          ) : null}
          <span
            className={`font-bold ${
              variant === 'expense'
                ? trend > 0 ? 'text-negative' : 'text-positive'
                : trend > 0 ? 'text-positive' : 'text-negative'
            }`}
          >
            {trend > 0 ? '+' : ''}{Math.abs(trend).toFixed(1)}%
          </span>
          <span className={`truncate font-medium ${sublabelColor[variant]}`}>
            vs mês anterior
          </span>
        </div>
      )}
    </motion.div>
  );
}
