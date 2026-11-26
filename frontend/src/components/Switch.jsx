/**
 * Interruptor liga/desliga com rótulo e descrição. Alvo de toque ≥ 44px.
 */
export default function Switch({ checked, onChange, label, description, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 text-left min-h-[44px] disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        {description && <span className="block text-xs text-ink-500 mt-0.5">{description}</span>}
      </span>
      <span className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-ink-950' : 'bg-ink-200'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}
