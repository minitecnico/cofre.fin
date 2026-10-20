import { useState, useEffect, useMemo } from 'react';
import { Repeat, CreditCard as CardIcon, Percent, X } from 'lucide-react';
import { transactionService, cardService, recurringService } from '../services';
import { parseAmount, formatCurrency, splitInstallmentAmount } from '../utils/format';
import { useMonth } from '../context/MonthContext';
import CategorySelect from './CategorySelect';

/**
 * Formulário de transação com:
 *  - Receita ou despesa
 *  - Pagamento via conta ou cartão
 *  - Recorrência mensal (cria modelo)
 *  - Parcelamento (apenas para despesas no cartão)
 *
 * Recorrência e parcelamento são MUTUAMENTE EXCLUSIVOS — uma compra parcelada
 * já cria múltiplas transações; recorrente é um modelo separado.
 */
export default function TransactionForm({ initial = null, onSaved, onCancel, onSwitchToBatch, defaultType = 'expense' }) {
  const isEdit = !!initial;
  const { isCurrentMonth, startDate: monthStart, month: currentMonthString } = useMonth();

  const defaultDate = initial?.date
    || (isCurrentMonth ? new Date().toISOString().slice(0, 10) : monthStart);

  const [type, setType] = useState(initial?.type || defaultType);
  const [amount, setAmount] = useState(initial?.amount?.toString().replace('.', ',') || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [date, setDate] = useState(defaultDate);
  const [categoryId, setCategoryId] = useState(initial?.category?.id || '');
  const [creditCardId, setCreditCardId] = useState(initial?.credit_card?.id || '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.credit_card ? 'card' : 'account');

  // Amortização — disponível só em modo edit + parcelado.
  // O usuário digita o desconto recebido (do banco/financeira); o valor da
  // parcela é recalculado automaticamente (originalAmount - desconto).
  // Não muda nada se o usuário não interagir.
  const isInstallment = isEdit && (initial?.installment_total || 0) > 1;
  const originalAmount = Number(initial?.amount) || 0;
  const [showAmortization, setShowAmortization] = useState(false);
  const [discount, setDiscount] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(1);

  const [cards, setCards] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (type === 'expense') {
      cardService.list().then(setCards).catch(() => setCards([]));
    }
  }, [type]);

  // Reset parcelamento se trocar de pagamento ou tipo
  useEffect(() => {
    if (paymentMethod !== 'card' || type !== 'expense') {
      setInstallmentCount(1);
    }
  }, [paymentMethod, type]);

  // Amortização: recalcula o valor da parcela toda vez que o desconto muda
  // (só quando o painel está aberto — senão o usuário edita o valor livre).
  useEffect(() => {
    if (!showAmortization) return;
    const d = parseAmount(discount);
    const newAmount = Math.max(0, originalAmount - d);
    // Formato pt-BR com vírgula
    setAmount(newAmount.toFixed(2).replace('.', ','));
  }, [discount, showAmortization, originalAmount]);

  // Fecha o painel de amortização e restaura o valor original
  function resetAmortization() {
    setShowAmortization(false);
    setDiscount('');
    setAmount(originalAmount.toString().replace('.', ','));
  }

  // Recorrência e parcelamento são exclusivos
  useEffect(() => {
    if (installmentCount > 1) setIsRecurring(false);
  }, [installmentCount]);

  useEffect(() => {
    if (isRecurring) setInstallmentCount(1);
  }, [isRecurring]);

  // Calcula valor por parcela em tempo real (preview)
  const installmentPreview = useMemo(() => {
    const total = parseAmount(amount);
    if (installmentCount < 2 || total <= 0) return null;
    const parts = splitInstallmentAmount(total, installmentCount);
    return {
      perInstallment: parts[0],
      hasRounding: parts[0] !== parts[parts.length - 1],
    };
  }, [amount, installmentCount]);

  // Pode parcelar? Só despesas no cartão, com valor > 0, não sendo edição
  const canShowInstallments = !isEdit && type === 'expense' && paymentMethod === 'card';

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const parsedAmount = parseAmount(amount);
      const trimmedDesc = description.trim();
      const cardIdToUse = type === 'expense' && paymentMethod === 'card' ? creditCardId : null;

      if (!parsedAmount || parsedAmount <= 0) throw new Error('Informe um valor válido');
      if (!trimmedDesc) throw new Error('Informe uma descrição');
      if (!categoryId) throw new Error('Selecione uma categoria');
      if (type === 'expense' && paymentMethod === 'card' && !creditCardId) {
        throw new Error('Selecione um cartão');
      }
      if (installmentCount > 1 && (!cardIdToUse)) {
        throw new Error('Parcelamento exige cartão de crédito');
      }

      // Edição (sempre uma transação só)
      if (isEdit) {
        // Se aplicou amortização (desconto > 0), grava nota detalhada
        // preservando notes antigas. Padrão "[Amortização]" pra audit.
        const discountNum = showAmortization ? parseAmount(discount) : 0;
        let notes = undefined; // undefined = não toca no campo
        if (discountNum > 0) {
          const stamp = new Date().toLocaleDateString('pt-BR');
          const line = `[Amortização ${stamp}] Original ${formatCurrency(originalAmount)} · Desconto ${formatCurrency(discountNum)} · Pago ${formatCurrency(parsedAmount)}`;
          notes = initial?.notes ? `${initial.notes}\n${line}` : line;
        }

        await transactionService.update(initial.id, {
          type,
          amount: parsedAmount,
          description: trimmedDesc,
          date,
          category_id: categoryId,
          credit_card_id: cardIdToUse,
          notes,
        });
      }
      // Recorrência (modelo + 1 transação no mês atual)
      else if (isRecurring) {
        const dayOfMonth = new Date(date + 'T00:00:00').getDate();
        const startMonth = `${currentMonthString}-01`;
        const recurring = await recurringService.create({
          type,
          amount: parsedAmount,
          description: trimmedDesc,
          category_id: categoryId,
          credit_card_id: cardIdToUse,
          day_of_month: dayOfMonth,
          start_month: startMonth,
        });
        const { supabase } = await import('../services/supabase');
        const { data: { user } } = await supabase.auth.getUser();
        const { error: txErr } = await supabase.from('transactions').insert({
          user_id: user.id,
          type,
          amount: parsedAmount,
          description: trimmedDesc,
          date,
          category_id: categoryId,
          credit_card_id: cardIdToUse,
          recurring_id: recurring.id,
          paid: type === 'income',
        });
        if (txErr) throw txErr;
      }
      // Parcelamento (cria N transações em meses diferentes)
      else if (installmentCount > 1) {
        await transactionService.createInstallments({
          type,
          totalAmount: parsedAmount,
          installmentCount,
          startDate: date,
          description: trimmedDesc,
          category_id: categoryId,
          credit_card_id: cardIdToUse,
        });
      }
      // Transação simples
      else {
        await transactionService.create({
          type,
          amount: parsedAmount,
          description: trimmedDesc,
          date,
          category_id: categoryId,
          credit_card_id: cardIdToUse,
        });
      }

      onSaved?.();
    } catch (err) {
      setError(err.message || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
      {/* Toggle Receita/Despesa */}
      {!isEdit && (
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-ink-100">
          <button
            type="button"
            onClick={() => setType('income')}
            className={`py-3 min-h-[44px] rounded-lg font-semibold text-sm uppercase tracking-wider transition-colors ${
              type === 'income' ? 'bg-accent text-ink-900 shadow-soft' : 'text-ink-500 hover:bg-white/70'
            }`}
          >
            ↑ Receita
          </button>
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`py-3 min-h-[44px] rounded-lg font-semibold text-sm uppercase tracking-wider transition-colors ${
              type === 'expense' ? 'bg-ink-900 text-white shadow-soft' : 'text-ink-500 hover:bg-white/70'
            }`}
          >
            ↓ Despesa
          </button>
        </div>
      )}

      <div>
        <label className="label">
          {installmentCount > 1 ? `Valor TOTAL da compra` : 'Valor'}
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-ink-500">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="input-field pl-12 text-xl md:text-2xl font-mono font-semibold"
            autoFocus
          />
        </div>
        {installmentPreview && (
          <p className="text-xs text-ink-600 mt-2">
            <strong>{installmentCount}x</strong> de{' '}
            <span className="font-mono font-semibold text-ink-900">
              {formatCurrency(installmentPreview.perInstallment)}
            </span>
            {installmentPreview.hasRounding && (
              <span className="text-ink-500"> (com ajuste de centavos)</span>
            )}
          </p>
        )}

        {/* Amortização — só em modo edit + parcela. Clean: botão em pill com
            destaque accent (sutil mas notável), que expande um campo único de
            desconto. Valor da parcela é recalculado automaticamente. */}
        {isInstallment && !showAmortization && (
          <button
            type="button"
            onClick={() => setShowAmortization(true)}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-full bg-accent/15 hover:bg-accent/30 border border-accent/50 text-sm font-bold text-ink-900 transition-all duration-200 active:scale-[0.98]"
          >
            <Percent className="w-4 h-4 text-positive" strokeWidth={2.75} />
            Aplicar desconto de amortização
          </button>
        )}

        {isInstallment && showAmortization && (
          <div className="mt-3 p-3 bg-surface-soft border border-hairline-light rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-700 inline-flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5" strokeWidth={2.5} />
                Desconto de amortização
              </p>
              <button
                type="button"
                onClick={resetAmortization}
                className="w-7 h-7 flex items-center justify-center rounded-full text-ink-500 hover:text-ink-900 hover:bg-ink-200 transition-colors"
                aria-label="Cancelar desconto"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-ink-600 leading-relaxed">
              Original: <strong className="font-mono text-ink-900">{formatCurrency(originalAmount)}</strong>
              {' · '}quanto o banco deu de desconto?
            </p>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0,00"
                className="input-field pl-11 font-mono text-right"
                autoFocus
              />
            </div>

            {(() => {
              const d = parseAmount(discount);
              if (d <= 0) return null;
              if (d > originalAmount) {
                return (
                  <p className="text-xs text-negative font-semibold">
                    Desconto maior que a parcela. Ajuste pra não pagar negativo.
                  </p>
                );
              }
              const pct = (d / originalAmount) * 100;
              const final = originalAmount - d;
              return (
                <p className="text-xs text-ink-700 leading-snug">
                  Você vai pagar{' '}
                  <strong className="font-mono text-ink-900">{formatCurrency(final)}</strong>
                  {' '}— economia de{' '}
                  <strong className="font-mono text-positive">{pct.toFixed(1).replace('.', ',')}%</strong>.
                </p>
              );
            })()}
          </div>
        )}
      </div>

      <div>
        <label className="label">Descrição</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={type === 'income' ? 'Ex: Salário' : 'Ex: Tênis novo'}
          className="input-field"
          maxLength={100}
        />
      </div>

      <div>
        <label className="label">{installmentCount > 1 ? 'Data da 1ª parcela' : 'Data'}</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input-field"
        />
      </div>

      <div>
        <label className="label">Categoria</label>
        <CategorySelect
          type={type}
          value={categoryId}
          onChange={setCategoryId}
        />
      </div>

      {/* Forma de pagamento — apenas para despesas */}
      {type === 'expense' && (
        <div>
          <label className="label">Forma de pagamento</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('account')}
              className={`px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-medium border transition-all ${
                paymentMethod === 'account'
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
              }`}
            >
              Conta / dinheiro
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-medium border transition-all ${
                paymentMethod === 'card'
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
              }`}
            >
              Cartão de crédito
            </button>
          </div>
          {paymentMethod === 'card' && (
            <select
              value={creditCardId}
              onChange={(e) => setCreditCardId(e.target.value)}
              className="input-field mt-3"
            >
              <option value="">Selecione um cartão</option>
              {cards.map(({ card }) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Parcelamento — apenas para despesa no cartão */}
      {canShowInstallments && (
        <div>
          <label className="label flex items-center gap-2">
            <CardIcon className="w-3.5 h-3.5" />
            Parcelas
          </label>
          <select
            value={installmentCount}
            onChange={(e) => setInstallmentCount(parseInt(e.target.value, 10))}
            className="input-field"
          >
            <option value={1}>À vista</option>
            <optgroup label="Parcelado (curto prazo)">
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 24].map((n) => (
                <option key={n} value={n}>{n}x</option>
              ))}
            </optgroup>
            <optgroup label="Empréstimo / Financiamento (longo prazo)">
              {[36, 48, 60, 72, 84, 96, 120, 180, 240].map((n) => (
                <option key={n} value={n}>{n}x · {Math.round(n / 12 * 10) / 10} anos</option>
              ))}
            </optgroup>
          </select>
          {installmentCount > 1 && (
            <p className="text-xs text-ink-600 mt-2 px-3 py-2.5 bg-accent/20 rounded-xl">
              ✨ Vamos criar <strong>{installmentCount} parcelas</strong>{' '}
              {installmentCount >= 36 && (
                <span>(≈ {Math.round(installmentCount / 12 * 10) / 10} anos)</span>
              )}{' '}
              automaticamente, uma em cada mês. Você pode editar ou excluir parcelas individuais depois.
            </p>
          )}
        </div>
      )}

      {/* Recorrência — só em criação, e não pode ter parcelamento */}
      {!isEdit && installmentCount === 1 && (
        <label
          className={`flex items-start gap-3 p-3 md:p-4 rounded-xl border cursor-pointer transition-colors ${
            isRecurring ? 'border-ink-900 bg-accent/20' : 'border-ink-200 hover:border-ink-400 bg-white'
          }`}
        >
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-ink-900 cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Repeat className="w-4 h-4" strokeWidth={2.5} />
              É recorrente?
            </div>
            <p className="text-xs text-ink-600 mt-0.5">
              {isRecurring
                ? `Será criada automaticamente todo mês no dia ${
                    new Date(date + 'T00:00:00').getDate()
                  }.`
                : 'Marque para repetir essa transação todos os meses.'}
            </p>
          </div>
        </label>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={submitting} className="btn-accent flex-1 disabled:opacity-60">
          {submitting
            ? 'Salvando…'
            : isEdit
              ? 'Salvar alterações'
              : isRecurring
                ? 'Criar recorrência'
                : installmentCount > 1
                  ? `Criar ${installmentCount} parcelas`
                  : 'Adicionar transação'}
        </button>
      </div>

      {/* Atalho para lançamento em massa — só em modo criação, e quando não está em modos especiais */}
      {!isEdit && !isRecurring && installmentCount === 1 && onSwitchToBatch && (
        <button
          type="button"
          onClick={() => onSwitchToBatch(type)}
          className="w-full text-xs text-ink-500 hover:text-ink-900 underline decoration-2 decoration-accent underline-offset-4 pt-2"
        >
          + Quero lançar várias {type === 'income' ? 'receitas' : 'despesas'} de uma vez
        </button>
      )}
    </form>
  );
}
