import { CreditCard } from 'lucide-react';

/**
 * Tarja do cartão de crédito: faixa colorida (cor do cartão) + nome. Comunica
 * de relance em qual cartão a despesa/cobrança foi feita, sem hover. Mesmo
 * padrão visual da lista de transações.
 */
export function CardTag({ card, className = '' }) {
  if (!card?.name) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-soft ${className}`}
      style={{ backgroundColor: card.color || '#1e293b' }}
      title={`Cartão: ${card.name}`}
    >
      <CreditCard className="w-2.5 h-2.5" /> {card.name}
    </span>
  );
}

/**
 * Select de cartão (opcional). Não renderiza nada se o usuário não tem cartão
 * cadastrado — não polui o form. `value`/`onChange` lidam com o id ('' = nenhum).
 */
export function CardSelect({ cards, value, onChange, label = 'Cartão (opcional)' }) {
  if (!cards?.length) return null;
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        <CreditCard className="w-3.5 h-3.5" /> {label}
      </label>
      <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Nenhum</option>
        {cards.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
