import { Minus, Plus } from 'lucide-react';

/**
 * Stepper numérico (− valor +) — substitui o feio input[type=number] nativo.
 * Alvos de toque 44px (mobile). Mantém o valor dentro de [min, max].
 *
 * @param {number} value
 * @param {(n:number)=>void} onChange
 * @param {number} [min=1] @param {number} [max=99] @param {number} [step=1]
 * @param {string} [suffix] ex: 'x' → "6x"
 */
export default function Stepper({ value, onChange, min = 1, max = 99, step = 1, suffix = '' }) {
  const clamp = (n) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="w-11 h-11 rounded-xl bg-ink-100 text-ink-700 flex items-center justify-center hover:bg-ink-200 transition-colors disabled:opacity-40 flex-shrink-0"
        aria-label="Diminuir"
      >
        <Minus className="w-4 h-4" strokeWidth={2.5} />
      </button>

      <input
        className="input-field text-center font-bold flex-1"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(String(e.target.value).replace(/\D/g, ''));
          if (n) onChange(clamp(n));
        }}
        aria-label="Quantidade"
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="w-11 h-11 rounded-xl bg-ink-100 text-ink-700 flex items-center justify-center hover:bg-ink-200 transition-colors disabled:opacity-40 flex-shrink-0"
        aria-label="Aumentar"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
      </button>

      {suffix && <span className="text-sm font-bold text-ink-500 w-4">{suffix}</span>}
    </div>
  );
}
