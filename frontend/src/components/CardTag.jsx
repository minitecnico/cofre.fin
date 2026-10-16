import { CreditCard } from 'lucide-react';
import Select from './Select';
import BankLogo from './BankLogo';

/**
 * Tarja do cartão de crédito: faixa colorida (cor do cartão) + nome. Comunica
 * de relance em qual cartão a despesa/cobrança foi feita, sem hover. Mesmo
 * padrão visual da lista de transações. Se o nome do cartão indica um banco
 * conhecido ("Nubank", "Itaú Click"), a logo entra no lugar do ícone genérico.
 */
export function CardTag({ card, className = '' }) {
  if (!card?.name) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-soft ${className}`}
      style={{ backgroundColor: card.color || '#1e293b' }}
      title={`Cartão: ${card.name}`}
    >
      <BankLogo name={card.name} size={12} fallback={<CreditCard className="w-2.5 h-2.5" />} /> {card.name}
    </span>
  );
}

/** Ícone de uma opção de cartão: logo do banco, ou bolinha na cor do cartão. */
function CardOptionIcon({ card }) {
  return (
    <BankLogo
      name={card.name}
      size={22}
      fallback={<span className="w-[22px] h-[22px] rounded-md flex-shrink-0" style={{ backgroundColor: card.color || '#1e293b' }} />}
    />
  );
}

/**
 * Select de cartão (opcional). Não renderiza nada se o usuário não tem cartão
 * cadastrado — não polui o form. `value`/`onChange` lidam com o id ('' = nenhum).
 */
export function CardSelect({ cards, value, onChange, label = 'Cartão (opcional)' }) {
  if (!cards?.length) return null;
  const options = [
    { value: '', label: 'Nenhum', icon: <CreditCard className="w-[22px] h-[22px] p-0.5 text-ink-300 flex-shrink-0" /> },
    ...cards.map((c) => ({ value: c.id, label: c.name, icon: <CardOptionIcon card={c} /> })),
  ];
  return <Select label={label} icon={CreditCard} value={value} onChange={onChange} options={options} />;
}
