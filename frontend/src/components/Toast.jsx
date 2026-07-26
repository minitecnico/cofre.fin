import { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

/**
 * Toast flutuante — desaparece após N segundos.
 * Posicionado no topo (mobile) ou canto superior direito (desktop).
 * Entrada/saída animadas via AnimatePresence (respeita prefers-reduced-motion).
 */
export default function Toast({ message, onClose, duration = 4500, icon: Icon = Sparkles }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  return (
    <AnimatePresence>
      {/*
        O `top` com safe-area existe por causa do APK: no Android 15 o app desenha
        edge-to-edge, e um `top-4` cru colocaria o toast por baixo do relógio.
        No desktop o `md:top-6` continua mandando; no navegador o env() vira 0.
      */}
      {message && (
        <motion.div
          className="fixed z-50 left-4 right-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] md:left-auto md:right-6 md:top-6 md:max-w-sm
                     bg-accent rounded-2xl shadow-soft-lg
                     p-3 md:p-4 flex items-start gap-3"
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.96 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
          transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        >
          <div className="w-9 h-9 rounded-xl bg-ink-900 text-accent flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <p className="flex-1 text-sm font-semibold text-ink-900 leading-snug">{message}</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-ink-900/10 transition-colors flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
