import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  // Detecta desktop pra escolher a variante de entrada (slide-up no mobile,
  // fade+scale no desktop). matchMedia evita um render extra com viewport errado.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const sizes = {
    sm: 'md:max-w-sm',
    md: 'md:max-w-md',
    lg: 'md:max-w-2xl',
  };

  const contentVariants = isDesktop
    ? {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit:    { opacity: 0, scale: 0.95 },
      }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit:    { y: '100%' },
      };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          // !mt-0: dentro de um pai com space-y-*, o fixo herdava a margem do topo e
          // o fundo começava 24px abaixo (a barra do topo ficava sem escurecer).
          className="fixed inset-0 z-50 !mt-0 flex items-end md:items-center justify-center md:p-4"
          onClick={onClose}
        >
          {/* Backdrop com blur moderno — fade independente do conteúdo */}
          <motion.div
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          {/* Conteúdo — feature card light com hairline + headline tight */}
          <motion.div
            className={`relative bg-white w-full
                        max-h-[95vh] md:max-h-[90vh] overflow-y-auto
                        rounded-t-3xl md:rounded-3xl
                        ${sizes[size]}
                        border border-hairline-light shadow-soft-xl`}
            onClick={(e) => e.stopPropagation()}
            initial={contentVariants.initial}
            animate={contentVariants.animate}
            exit={contentVariants.exit}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md flex items-center justify-between px-6 md:px-7 py-4 md:py-5 border-b border-hairline-light">
              <h2 className="font-display text-xl md:text-2xl font-bold truncate pr-4 tracking-display-tight">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-surface-soft transition-all duration-200 flex-shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 md:p-7">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
