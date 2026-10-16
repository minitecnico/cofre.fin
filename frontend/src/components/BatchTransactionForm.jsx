import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { categoryService, transactionService, cardService } from '../services';
import { parseAmount, formatCurrency, splitInstallmentAmount } from '../utils/format';
import { useMonth } from '../context/MonthContext';

/**
 * Lançamento em massa de transações.
 * --------------------------------------------------------------
 * Permite adicionar múltiplas linhas (despesas ou receitas) e salvar
 * todas de uma vez.
 *
 * Suporta PARCELAMENTO por linha (apenas para despesas no cartão).
 * Cada linha pode ser:
 *   - À vista (1x): cria 1 transação no mês da data efetiva
 *   - Parcelada (Nx): cria N transações em N meses, mesmo dia
 *
 * Comportamento "herdar e sobrescrever":
 *   - 1ª linha define data e cartão padrão
 *   - Linhas subsequentes herdam por padrão
 *   - Cada linha pode sobrescrever data/cartão/parcelas
 */

function emptyItem(defaults = {}) {
  return {
    id: crypto.randomUUID(),
    description: '',
    amount: '',
    categoryId: defaults.categoryId || '',
    dateOverride: null,
    paymentMethodOverride: null,
    creditCardIdOverride: null,
    installmentCount: 1, // 1 = à vista
    expanded: false,
  };
}

export default function BatchTransactionForm({ type = 'expense', onSaved, onCancel }) {
  const isIncome = type === 'income';
  const { isCurrentMonth, startDate: monthStart } = useMonth();

  const initialDate = isCurrentMonth ? new Date().toISOString().slice(0, 10) : monthStart;

  // Configuração comum
  const [commonDate, setCommonDate] = useState(initialDate);
  const [commonPaymentMethod, setCommonPaymentMethod] = useState(isIncome ? 'account' : 'card');
  const [commonCreditCardId, setCommonCreditCardId] = useState('');

  const [items, setItems] = useState([emptyItem(), emptyItem()]);

  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    categoryService.list(type).then(setCategories).catch(() => setCategories([]));
    if (!isIncome) {
      cardService.list().then(setCards).catch(() => setCards([]));
    }
  }, [type, isIncome]);

  useEffect(() => {
    if (categories.length === 0) return;
    setItems((prev) =>
      prev.map((it) => (it.categoryId ? it : { ...it, categoryId: categories[0].id }))
    );
  }, [categories]);

  useEffect(() => {
    if (cards.length > 0 && !commonCreditCardId) {
      setCommonCreditCardId(cards[0].card.id);
    }
  }, [cards, commonCreditCardId]);

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addItem() {
    const lastCategoryId = items[items.length - 1]?.categoryId || categories[0]?.id || '';
    setItems((prev) => [...prev, emptyItem({ categoryId: lastCategoryId })]);
  }

  function removeItem(id) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // Calcula resumo: total, linhas válidas e transações criadas.
  // Também detecta linhas "parcialmente preenchidas" (algo digitado mas faltando algo)
  // pra dar feedback útil ao usuário no botão.
  const summary = useMemo(() => {
    let total = 0;
    let validLines = 0;
    let totalTransactions = 0;
    let missingDescription = 0; // linhas com valor mas sem descrição
    let missingAmount = 0;      // linhas com descrição mas sem valor

    for (const it of items) {
      const amt = parseAmount(it.amount);
      const desc = it.description.trim();
      const hasAmount = amt > 0;
      const hasDesc = !!desc;

      if (hasAmount && hasDesc) {
        total += amt;
        validLines++;
        totalTransactions += it.installmentCount || 1;
      } else if (hasAmount && !hasDesc) {
        missingDescription++;
      } else if (!hasAmount && hasDesc) {
        missingAmount++;
      }
    }
    return { total, validLines, totalTransactions, missingDescription, missingAmount };
  }, [items]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const validItems = items.filter(
      (it) => it.description.trim() && parseAmount(it.amount) > 0 && it.categoryId
    );

    if (validItems.length === 0) {
      setError('Adicione pelo menos uma transação preenchida (descrição, valor e categoria).');
      return;
    }

    setSubmitting(true);

    try {
      // Separa linhas em 2 grupos:
      //   - À vista (1x): vão em batch único (mais rápido)
      //   - Parceladas (Nx): cada uma chama createInstallments separadamente
      const oneTimeRows = [];
      const installmentItems = [];

      for (const it of validItems) {
        const date = it.dateOverride || commonDate;
        const method = it.paymentMethodOverride || commonPaymentMethod;
        const cardId = it.creditCardIdOverride
          || (method === 'card' && !it.paymentMethodOverride ? commonCreditCardId : null);

        // Validação: parcelamento exige cartão
        if (it.installmentCount > 1 && !cardId) {
          throw new Error(
            `"${it.description}" está parcelada em ${it.installmentCount}x mas não tem cartão selecionado.`
          );
        }
        if (!isIncome && method === 'card' && !cardId) {
          throw new Error(`"${it.description}" exige cartão selecionado.`);
        }

        const baseData = {
          type,
          totalAmount: parseAmount(it.amount),
          startDate: date,
          description: it.description.trim(),
          category_id: it.categoryId,
          credit_card_id: !isIncome && method === 'card' ? cardId : null,
        };

        if (it.installmentCount > 1) {
          installmentItems.push({ ...baseData, installmentCount: it.installmentCount });
        } else {
          oneTimeRows.push({
            type,
            amount: parseAmount(it.amount),
            description: it.description.trim(),
            date,
            category_id: it.categoryId,
            credit_card_id: baseData.credit_card_id,
          });
        }
      }

      // Cria à vista em batch (1 só request)
      let totalCreated = 0;
      if (oneTimeRows.length > 0) {
        const { count } = await transactionService.createBatch(oneTimeRows);
        totalCreated += count;
      }

      // Cria parceladas individualmente (cada uma gera N transações)
      for (const item of installmentItems) {
        const result = await transactionService.createInstallments(item);
        totalCreated += result.transactions.length;
      }

      onSaved?.(totalCreated);
    } catch (err) {
      setError(err.message || 'Erro ao salvar lançamentos');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
      {/* Cabeçalho informativo */}
      <div className="px-3 py-2.5 bg-accent/20 rounded-xl text-xs md:text-sm">
        <Layers className="w-4 h-4 inline mr-1" />
        <strong>Lançamento em massa.</strong> Cadastre várias {isIncome ? 'receitas' : 'despesas'} de uma vez.
        {!isIncome && ' Para parcelar uma compra, expanda a linha (▼).'}
      </div>

      {/* Configurações comuns */}
      <div className="card-flat p-3 md:p-4 space-y-3">
        <p className="text-[10px] uppercase font-bold tracking-widest text-ink-600">
          Aplicar a todas
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label !mb-1">Data</label>
            <input
              type="date"
              value={commonDate}
              onChange={(e) => setCommonDate(e.target.value)}
              className="input-field !min-h-[40px] !py-2"
            />
          </div>

          {!isIncome && (
            <div>
              <label className="label !mb-1">Forma de pagamento</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setCommonPaymentMethod('account')}
                  className={`flex-1 px-2 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    commonPaymentMethod === 'account'
                      ? 'bg-gradient-dark text-white shadow-soft'
                      : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                  }`}
                >
                  Conta
                </button>
                <button
                  type="button"
                  onClick={() => setCommonPaymentMethod('card')}
                  className={`flex-1 px-2 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    commonPaymentMethod === 'card'
                      ? 'bg-gradient-dark text-white shadow-soft'
                      : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                  }`}
                >
                  Cartão
                </button>
              </div>
            </div>
          )}
        </div>

        {!isIncome && commonPaymentMethod === 'card' && (
          <div>
            <label className="label !mb-1">Cartão</label>
            <select
              value={commonCreditCardId}
              onChange={(e) => setCommonCreditCardId(e.target.value)}
              className="input-field !min-h-[40px] !py-2"
            >
              <option value="">Selecione um cartão</option>
              {cards.map(({ card }) => (
                <option key={card.id} value={card.id}>{card.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Linhas */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold tracking-widest text-ink-600">
          {isIncome ? 'Receitas' : 'Despesas'} ({items.length})
        </p>

        {items.map((item, idx) => (
          <BatchItemRow
            key={item.id}
            item={item}
            index={idx}
            categories={categories}
            cards={cards}
            isIncome={isIncome}
            commonDate={commonDate}
            commonPaymentMethod={commonPaymentMethod}
            commonCreditCardId={commonCreditCardId}
            onChange={(patch) => updateItem(item.id, patch)}
            onRemove={() => removeItem(item.id)}
            canRemove={items.length > 1}
          />
        ))}

        <button
          type="button"
          onClick={addItem}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-dashed border-ink-300 hover:border-ink-900 hover:bg-accent/10 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-ink-600 hover:text-ink-900"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Adicionar outra {isIncome ? 'receita' : 'despesa'}
        </button>
      </div>

      {/* Resumo */}
      {summary.validLines > 0 && (
        <div className="px-4 py-3 bg-gradient-dark text-ink-50 rounded-2xl shadow-soft-md flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-accent font-bold">
              {summary.validLines} {summary.validLines === 1 ? 'lançamento' : 'lançamentos'}
              {summary.totalTransactions !== summary.validLines && (
                <span> · {summary.totalTransactions} transações</span>
              )}
            </p>
            <p className="font-display font-bold text-2xl mt-0.5">{formatCurrency(summary.total)}</p>
          </div>
        </div>
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
        <button
          type="submit"
          disabled={submitting || summary.validLines === 0}
          className="btn-accent flex-1 disabled:opacity-60"
        >
          {submitting
            ? 'Salvando…'
            : summary.validLines === 0
              ? (() => {
                  // Mensagem útil: diz o que falta especificamente
                  if (summary.missingDescription > 0 && summary.missingAmount === 0) {
                    return `⚠ Falta descrição em ${summary.missingDescription} ${summary.missingDescription === 1 ? 'linha' : 'linhas'}`;
                  }
                  if (summary.missingAmount > 0 && summary.missingDescription === 0) {
                    return `⚠ Falta valor em ${summary.missingAmount} ${summary.missingAmount === 1 ? 'linha' : 'linhas'}`;
                  }
                  if (summary.missingDescription > 0 && summary.missingAmount > 0) {
                    return '⚠ Complete descrição e valor';
                  }
                  return 'Preencha descrição e valor';
                })()
              : `Salvar ${summary.validLines} ${summary.validLines === 1 ? (isIncome ? 'receita' : 'despesa') : (isIncome ? 'receitas' : 'despesas')}`}
        </button>
      </div>
    </form>
  );
}

/**
 * Linha individual no lançamento em massa.
 * Mostra dados básicos compactos + painel expansível com:
 *   - Parcelas (apenas despesa no cartão)
 *   - Data desta linha
 *   - Forma de pagamento desta linha
 *   - Cartão desta linha
 */
function BatchItemRow({
  item,
  index,
  categories,
  cards,
  isIncome,
  commonDate,
  commonPaymentMethod,
  commonCreditCardId,
  onChange,
  onRemove,
  canRemove,
}) {
  const effectiveDate = item.dateOverride || commonDate;
  const effectiveMethod = item.paymentMethodOverride || commonPaymentMethod;
  const effectiveCardId = item.creditCardIdOverride
    || (effectiveMethod === 'card' && !item.paymentMethodOverride ? commonCreditCardId : null);

  const isInstallment = item.installmentCount > 1;
  const canShowInstallments = !isIncome && effectiveMethod === 'card';

  const hasOverride = !!(
    item.dateOverride ||
    item.paymentMethodOverride ||
    item.creditCardIdOverride ||
    isInstallment
  );

  // Detecta linhas "parcialmente preenchidas" — algo digitado mas falta complementar.
  // Ajuda o usuário a saber EXATAMENTE qual linha precisa atenção.
  const desc = item.description.trim();
  const amountValue = parseAmount(item.amount);
  const hasDescription = !!desc;
  const hasAmount = amountValue > 0;
  const isPartiallyFilled = (hasDescription && !hasAmount) || (!hasDescription && hasAmount);
  const isComplete = hasDescription && hasAmount;

  // Preview de parcelas
  const installmentPreview = useMemo(() => {
    const total = parseAmount(item.amount);
    if (item.installmentCount < 2 || total <= 0) return null;
    const parts = splitInstallmentAmount(total, item.installmentCount);
    return parts[0];
  }, [item.amount, item.installmentCount]);

  function toggleExpand() {
    onChange({ expanded: !item.expanded });
  }

  function clearOverrides() {
    onChange({
      dateOverride: null,
      paymentMethodOverride: null,
      creditCardIdOverride: null,
      installmentCount: 1,
      expanded: false,
    });
  }

  return (
    <div className={`rounded-xl bg-white transition-all duration-200 ${
      isPartiallyFilled ? 'border-2 border-warn shadow-soft bg-yellow-50/30' :
      isComplete && hasOverride ? 'border-2 border-ink-900 shadow-soft' :
      isComplete ? 'border-2 border-positive/40 shadow-soft' :
      hasOverride ? 'border-2 border-ink-900 shadow-soft' : 'border border-ink-200'
    }`}>
      {/* Linha principal */}
      <div className="flex items-stretch gap-1 p-2">
        <div className="flex items-center justify-center w-7 text-xs font-mono font-bold text-ink-500">
          {index + 1}
        </div>

        <input
          type="text"
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Descrição (ex: Tênis novo)"
          className="flex-1 min-w-0 px-2 py-2 bg-transparent border-0 focus:outline-none text-sm placeholder:text-ink-400 rounded-lg"
          maxLength={100}
        />

        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-500 font-mono">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={item.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="0,00"
            className="w-24 sm:w-28 pl-7 pr-2 py-2 bg-transparent border-0 focus:outline-none text-sm font-mono font-bold text-right rounded-lg"
          />
        </div>

        <select
          value={item.categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
          className="w-28 sm:w-36 px-1.5 py-2 bg-transparent border-0 focus:outline-none text-xs cursor-pointer rounded-lg"
          aria-label="Categoria"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={toggleExpand}
          className={`w-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
            hasOverride ? 'text-ink-900 bg-accent/30' : 'text-ink-400 hover:text-ink-900 hover:bg-ink-100'
          }`}
          title="Personalizar (parcelas, data, cartão)"
          aria-label="Personalizar"
        >
          {item.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-9 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50 transition-all duration-200"
            aria-label="Remover linha"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Aviso visual quando linha está parcialmente preenchida */}
      {isPartiallyFilled && (
        <div className="px-3 pb-2 text-[10px] text-yellow-800 font-bold flex items-center gap-1">
          <span>⚠</span>
          {hasDescription && !hasAmount && <span>Falta digitar o valor.</span>}
          {!hasDescription && hasAmount && <span>Falta digitar a descrição.</span>}
        </div>
      )}

      {/* Resumo compacto quando há override mas não está expandido */}
      {!item.expanded && hasOverride && (
        <div className="px-3 pb-2 text-[10px] text-ink-500 flex flex-wrap gap-x-3 gap-y-1 font-medium">
          {isInstallment && (
            <span className="text-ink-900 font-bold">
              📦 {item.installmentCount}x
              {installmentPreview && ` de ${formatCurrency(installmentPreview)}`}
            </span>
          )}
          {item.dateOverride && (
            <span>📅 {new Date(item.dateOverride + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
          )}
          {item.paymentMethodOverride && (
            <span>💳 {item.paymentMethodOverride === 'card' ? 'Cartão personalizado' : 'Conta'}</span>
          )}
        </div>
      )}

      {/* Painel expandido */}
      {item.expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-ink-100 bg-ink-50/50 rounded-b-xl">
          {/* Parcelas — primeira coisa (mais usado) */}
          {canShowInstallments && (
            <div>
              <label className="label !mb-1 !text-[9px]">Parcelas</label>
              <select
                value={item.installmentCount}
                onChange={(e) => onChange({ installmentCount: parseInt(e.target.value, 10) })}
                className="input-field !min-h-[36px] !py-1.5 !text-xs"
              >
                <option value={1}>À vista</option>
                <optgroup label="Parcelado">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 24].map((n) => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </optgroup>
                <optgroup label="Empréstimo / Financiamento">
                  {[36, 48, 60, 72, 84, 96, 120, 180, 240].map((n) => (
                    <option key={n} value={n}>{n}x · {Math.round(n / 12 * 10) / 10} anos</option>
                  ))}
                </optgroup>
              </select>
              {installmentPreview && (
                <p className="text-[10px] text-ink-600 mt-1.5">
                  <strong>{item.installmentCount}x</strong> de{' '}
                  <span className="font-mono font-bold text-ink-900">
                    {formatCurrency(installmentPreview)}
                  </span>
                  <span className="text-ink-400"> · cria {item.installmentCount} transações</span>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label !mb-1 !text-[9px]">
                {isInstallment ? 'Data da 1ª parcela' : 'Data desta linha'}
              </label>
              <input
                type="date"
                value={item.dateOverride || effectiveDate}
                onChange={(e) =>
                  onChange({ dateOverride: e.target.value === commonDate ? null : e.target.value })
                }
                className="input-field !min-h-[36px] !py-1.5 !text-xs"
              />
            </div>

            {!isIncome && !isInstallment && (
              <div>
                <label className="label !mb-1 !text-[9px]">Pagamento desta linha</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        paymentMethodOverride: 'account',
                        creditCardIdOverride: null,
                      })
                    }
                    className={`flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg transition-all duration-200 ${
                      effectiveMethod === 'account'
                        ? 'bg-gradient-dark text-white'
                        : 'bg-ink-100 text-ink-600'
                    }`}
                  >
                    Conta
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ paymentMethodOverride: 'card' })}
                    className={`flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg transition-all duration-200 ${
                      effectiveMethod === 'card'
                        ? 'bg-gradient-dark text-white'
                        : 'bg-ink-100 text-ink-600'
                    }`}
                  >
                    Cartão
                  </button>
                </div>
              </div>
            )}
          </div>

          {!isIncome && effectiveMethod === 'card' && (
            <div>
              <label className="label !mb-1 !text-[9px]">Cartão desta linha</label>
              <select
                value={effectiveCardId || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({
                    creditCardIdOverride: v === commonCreditCardId ? null : v,
                  });
                }}
                className="input-field !min-h-[36px] !py-1.5 !text-xs"
              >
                <option value="">Selecione</option>
                {cards.map(({ card }) => (
                  <option key={card.id} value={card.id}>{card.name}</option>
                ))}
              </select>
            </div>
          )}

          {hasOverride && (
            <button
              type="button"
              onClick={clearOverrides}
              className="text-xs underline text-ink-500 hover:text-ink-900 font-medium"
            >
              Limpar personalização (voltar a usar configuração comum)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
