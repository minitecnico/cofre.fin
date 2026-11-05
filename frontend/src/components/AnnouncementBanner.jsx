import { Megaphone, X, ArrowRight } from 'lucide-react';

/**
 * Faixa de aviso publicada na central do administrador. Só apresentação: o
 * Layout liga no useAnnouncements e a central usa como prévia.
 */
export default function AnnouncementBanner({ announcement, onDismiss, onOpen }) {
  const { title, body, url } = announcement;
  return (
    <div role="status" className="card-flat p-3 md:p-4 flex items-start gap-3 animate-slide-up">
      <span className="w-10 h-10 rounded-xl bg-gradient-accent text-ink-900 flex items-center justify-center flex-shrink-0">
        <Megaphone className="w-5 h-5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-display font-bold text-sm md:text-base text-ink-900 leading-snug break-words">{title}</p>
        {body && <p className="text-xs md:text-sm text-ink-600 mt-0.5 whitespace-pre-line break-words">{body}</p>}
        {url && (
          <button type="button" onClick={onOpen} className="btn-pill-sm mt-2">
            Ver agora <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 flex-shrink-0"
        aria-label="Fechar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
