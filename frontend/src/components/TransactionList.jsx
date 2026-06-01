import { useRef, useState } from 'react';
import { Pencil, Trash2, CreditCard as CardIcon, Check, Repeat, Layers, Percent } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatDate, parseAmortization } from '../utils/format';
import Modal from './Modal';
import TransactionForm from './TransactionForm';
import { transactionService } from '../services';

export default function TransactionList({
  items,
  loading,
  onChange,
  onDelete,
  onTogglePaid,
  emptyMessage = 'Nenhuma transação encontrada',
}) {
  const [editing, setEditing] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(null); // {id, description, groupId, total}
  const [deletingSingle, setDeletingSingle] = useState(null); // {id, description}

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 md:h-16 bg-ink-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card-flat p-8 md:p-12 text-center">
        <p className="text-ink-500 font-medium text-sm md:text-base">{emptyMessage}</p>
      </div>
    );
  }

  // Decide o que fazer ao clicar em "excluir":
  //  - Se for parcelamento: abre modal perguntando "só essa ou todas?"
  //  - Se for transação simples: confirm padrão e exclui
  function handleDeleteClick(t) {
    const isInstallment = !!t.installment_group_id;
    if (isInstallment) {
      setDeletingGroup({
        id: t.id,
        description: t.description,
        groupId: t.installment_group_id,
        total: t.installment_total,
      });
    } else {
      setDeletingSingle({ id: t.id, description: t.description });
    }
  }

  function handleDeleteSingle() {
    onDelete(deletingSingle.id);
    setDeletingSingle(null);
  }

  async function handleDeleteOnlyThis() {
    onDelete(deletingGroup.id);
    setDeletingGroup(null);
  }

  async function handleDeleteAll() {
    try {
      await transactionService.removeGroup(deletingGroup.groupId);
      setDeletingGroup(null);
      onChange?.(); // refaz fetch
    } catch (err) {
      alert('Erro ao excluir parcelas: ' + (err.message || 'desconhecido'));
    }
  }

  return (
    <>
      <p className="md:hidden mb-2 text-[11px] text-ink-500">
        Dica: arraste um lançamento para a esquerda para excluir.
      </p>
      <div className="bg-white border-2 border-ink-900 shadow-flat-sm md:shadow-flat divide-y-2 divide-ink-100">
        <AnimatePresence initial={false}>
        {items.map((t, index) => {
          const isIncome = t.type === 'income';
          const isExpense = !isIncome;
          const isPaid = !!t.paid;
          const cat = t.category || {};
          const card = t.credit_card || null;
          const isInstallment = !!t.installment_group_id && t.installment_total > 1;
          const amortization = parseAmortization(t.notes);

          return (
            <SwipeableTransactionRow
              key={t.id}
              itemId={t.id}
              index={index}
              faded={isExpense && isPaid}
              onDelete={() => handleDeleteClick(t)}
            >
              {/* Indicador de cor categoria */}
              <div
                className="w-1 flex-shrink-0"
                style={{ backgroundColor: cat.color || '#64748b' }}
              />

              {/* Checkbox de pago — apenas em despesas */}
              {isExpense && (
                <button
                  type="button"
                  onClick={() => onTogglePaid?.(t.id, isPaid)}
                  className={`flex items-center justify-center w-12 md:w-14 flex-shrink-0 border-r-2 border-ink-100 transition-colors ${
                    isPaid
                      ? 'bg-positive text-white hover:bg-green-700'
                      : 'bg-ink-50 hover:bg-accent text-ink-400 hover:text-ink-900'
                  }`}
                  aria-label={isPaid ? 'Marcar como pendente' : 'Marcar como pago'}
                  aria-pressed={isPaid}
                  title={isPaid ? 'Pago — clique para desmarcar' : 'Pendente — clique para marcar como pago'}
                >
                  <Check
                    className={`w-5 h-5 transition-transform ${
                      isPaid ? 'scale-100' : 'scale-0 group-hover:scale-100'
                    }`}
                    strokeWidth={3}
                  />
                </button>
              )}

              {/* Conteúdo */}
              <div className="flex-1 min-w-0 p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4
                      className={`font-medium text-ink-900 text-sm md:text-base truncate ${
                        isExpense && isPaid ? 'line-through' : ''
                      }`}
                    >
                      {t.description}
                    </h4>
                    {isInstallment && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider bg-ink-100 text-ink-900 border border-ink-900 whitespace-nowrap"
                        title={`Parcela ${t.installment_number} de ${t.installment_total}`}
                      >
                        <Layers className="w-3 h-3" strokeWidth={2.5} />
                        {t.installment_number}/{t.installment_total}
                      </span>
                    )}
                    {t.recurring_id && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider bg-ink-900 text-accent whitespace-nowrap"
                        title="Esta é uma transação recorrente"
                      >
                        <Repeat className="w-3 h-3" strokeWidth={2.5} /> Recorrente
                      </span>
                    )}
                    {card && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-white whitespace-nowrap"
                        style={{ backgroundColor: card.color || '#1e293b' }}
                      >
                        <CardIcon className="w-3 h-3" /> {card.name}
                      </span>
                    )}
                    {isExpense && isPaid && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-white bg-positive whitespace-nowrap">
                        <Check className="w-3 h-3" strokeWidth={3} /> Pago
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-500 flex-wrap">
                    {cat.name ? (
                      <span className="font-medium" style={{ color: cat.color || '#71717a' }}>
                        {cat.name}
                      </span>
                    ) : (
                      <span className="font-medium italic text-ink-400">Sem categoria</span>
                    )}
                    <span>·</span>
                    <span>{formatDate(t.date, 'long')}</span>
                  </div>

                  {/* Badge de amortização: original riscado → pago + desconto% */}
                  {amortization && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/15 border border-accent/40 text-[11px] font-semibold w-fit max-w-full"
                      title={amortization.date ? `Amortizado em ${amortization.date}` : 'Amortizado'}
                    >
                      <Percent className="w-3 h-3 text-positive flex-shrink-0" strokeWidth={2.5} />
                      <span className="font-mono text-ink-500 line-through whitespace-nowrap">
                        {formatCurrency(amortization.original)}
                      </span>
                      <span className="text-ink-400">→</span>
                      <span className="font-mono text-ink-900 whitespace-nowrap">
                        {formatCurrency(amortization.paid)}
                      </span>
                      <span className="text-positive whitespace-nowrap">
                        −{amortization.percent.toFixed(1).replace('.', ',')}%
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between md:justify-end gap-2 md:gap-4 mt-1 md:mt-0">
                  <div
                    className={`stat-number text-base md:text-lg font-semibold whitespace-nowrap ${
                      isIncome ? 'text-positive' : 'text-negative'
                    } ${isExpense && isPaid ? 'line-through' : ''}`}
                  >
                    {isIncome ? '+' : '−'} {formatCurrency(t.amount)}
                  </div>

                  <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditing(t)}
                      className="w-9 h-9 flex items-center justify-center -translate-y-1 md:translate-y-0 hover:bg-ink-200 transition-colors"
                      aria-label="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(t)}
                      className="hidden md:flex w-9 h-9 items-center justify-center text-negative hover:bg-red-50 transition-colors"
                      aria-label="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </SwipeableTransactionRow>
          );
        })}
        </AnimatePresence>
      </div>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Editar transação">
        {editing && (
          <TransactionForm
            initial={editing}
            onSaved={() => {
              setEditing(null);
              onChange?.();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Modal de exclusão de compra parcelada — escolha do escopo */}
      <Modal
        isOpen={!!deletingGroup}
        onClose={() => setDeletingGroup(null)}
        title="Excluir parcela"
      >
        {deletingGroup && (
          <div className="space-y-4">
            <p className="text-sm text-ink-900">
              <strong>"{deletingGroup.description}"</strong> faz parte de uma compra
              parcelada em <strong>{deletingGroup.total}x</strong>. O que fazer?
            </p>

            <button
              onClick={handleDeleteOnlyThis}
              className="w-full text-left px-4 py-3.5 rounded-2xl border border-hairline-light hover:border-ink-300 hover:bg-surface-soft transition-colors"
            >
              <p className="font-bold text-sm text-ink-900">Excluir só esta parcela</p>
              <p className="text-xs text-ink-600 mt-0.5">
                As outras parcelas continuam normais.
              </p>
            </button>

            <button
              onClick={handleDeleteAll}
              className="w-full text-left px-4 py-3.5 rounded-2xl border border-negative/30 bg-red-50 hover:bg-red-100 transition-colors"
            >
              <p className="font-bold text-sm text-negative">
                Excluir todas as {deletingGroup.total} parcelas
              </p>
              <p className="text-xs text-ink-700 mt-0.5">
                Cancela a compra inteira em todos os meses. Não dá pra desfazer.
              </p>
            </button>

            <button onClick={() => setDeletingGroup(null)} className="btn-ghost w-full">
              Cancelar
            </button>
          </div>
        )}
      </Modal>

      {/* Modal de exclusão de transação simples (substitui o confirm nativo) */}
      <Modal
        isOpen={!!deletingSingle}
        onClose={() => setDeletingSingle(null)}
        title="Excluir transação"
      >
        {deletingSingle && (
          <div className="space-y-4">
            <p className="text-sm text-ink-900">
              Excluir <strong>"{deletingSingle.description}"</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button onClick={() => setDeletingSingle(null)} className="btn-ghost sm:flex-1">
                Cancelar
              </button>
              <button onClick={handleDeleteSingle} className="btn-danger-solid sm:flex-1">
                Sim, excluir
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function SwipeableTransactionRow({ itemId, index, faded, onDelete, children }) {
  const ACTION_WIDTH = 92;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  const dragRef = useRef(null);

  function updateOffset(nextOffset) {
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse') return;
    setDragging(true);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialOffset: offset,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;

    updateOffset(Math.max(-ACTION_WIDTH, Math.min(0, drag.initialOffset + deltaX)));
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    updateOffset(offsetRef.current <= -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0);
  }

  function handleDelete() {
    updateOffset(0);
    onDelete();
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ delay: index * 0.04 }}
      className={`group relative overflow-hidden ${faded ? 'opacity-60' : ''}`}
      data-transaction-id={itemId}
    >
      <button
        type="button"
        onClick={handleDelete}
        className="md:hidden absolute inset-y-0 right-0 w-[92px] bg-negative text-white flex flex-col items-center justify-center gap-1 font-bold text-xs"
        aria-label="Excluir transação"
      >
        <Trash2 className="w-5 h-5" />
        Excluir
      </button>

      <div
        className={`relative z-[1] flex items-stretch bg-white hover:bg-ink-50 ${
          dragging ? '' : 'transition-transform duration-200'
        }`}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {children}
      </div>
    </motion.div>
  );
}
