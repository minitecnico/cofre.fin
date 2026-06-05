import { useEffect, useRef, useState } from 'react';
import { Plus, ArrowLeftRight, HandCoins } from 'lucide-react';
import { useDisclosure } from '../hooks/useDisclosure';
import Modal from './Modal';
import TransactionForm from './TransactionForm';
import BatchTransactionForm from './BatchTransactionForm';
import CobrancaQuickForm from './CobrancaQuickForm';

const MOBILE_FAB_TOP_KEY = 'cofre:mobile-fab-top';
const MOBILE_FAB_SIZE = 56;
const MOBILE_HEADER_CLEARANCE = 72;
const MOBILE_BOTTOM_CLEARANCE = 82;

function clampMobileTop(top) {
  const maxTop = Math.max(
    MOBILE_HEADER_CLEARANCE,
    window.innerHeight - MOBILE_BOTTOM_CLEARANCE - MOBILE_FAB_SIZE
  );
  return Math.min(Math.max(top, MOBILE_HEADER_CLEARANCE), maxTop);
}

function readMobileTop() {
  try {
    return Number(window.localStorage.getItem(MOBILE_FAB_TOP_KEY));
  } catch {
    return null;
  }
}

function storeMobileTop(top) {
  try {
    window.localStorage.setItem(MOBILE_FAB_TOP_KEY, String(top));
  } catch {
    // O botão continua reposicionável durante a sessão se o storage estiver bloqueado.
  }
}

export default function FloatingAddButton({ onAdded }) {
  const { isOpen, open, close } = useDisclosure();
  const [mode, setMode] = useState('single'); // 'single' | 'batch' | 'cobranca'
  const [kind, setKind] = useState('transacao'); // 'transacao' | 'cobranca' (aba do topo)
  const [batchType, setBatchType] = useState('expense'); // tipo do batch
  const [mobileTop, setMobileTop] = useState(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    function restorePosition() {
      if (window.innerWidth >= 768) return;

      const savedTop = readMobileTop();
      if (Number.isFinite(savedTop) && savedTop > 0) {
        setMobileTop(clampMobileTop(savedTop));
      }
    }

    function handleResize() {
      setMobileTop((currentTop) => (
        currentTop == null || window.innerWidth >= 768
          ? currentTop
          : clampMobileTop(currentTop)
      ));
    }

    restorePosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function handleOpen() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    setMode('single');
    setKind('transacao');
    open();
  }

  function handleClose() {
    close();
    setMode('single'); // reset pro próximo abrir
    setKind('transacao');
  }

  function switchToBatch(typeFromForm) {
    setBatchType(typeFromForm || 'expense');
    setMode('batch');
  }

  function handlePointerDown(event) {
    if (window.innerWidth >= 768 || event.pointerType === 'mouse') return;

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      initialTop: event.currentTarget.getBoundingClientRect().top,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) > 4) drag.moved = true;
    if (!drag.moved) return;

    setMobileTop(clampMobileTop(drag.initialTop + deltaY));
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    if (!drag.moved) return;

    suppressClickRef.current = event.type !== 'pointercancel';
    setMobileTop((currentTop) => {
      const nextTop = clampMobileTop(currentTop ?? drag.initialTop);
      storeMobileTop(nextTop);
      return nextTop;
    });
  }

  return (
    <>
      <button
        onClick={handleOpen}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="fab group"
        aria-label="Adicionar transação"
        title="Adicionar transação. No celular, arraste para reposicionar."
        data-tour="add-button"
        style={mobileTop == null ? undefined : {
          '--fab-mobile-top': `${mobileTop}px`,
          '--fab-mobile-bottom': 'auto',
        }}
      >
        <Plus
          className="w-6 h-6 md:w-7 md:h-7 text-ink-900 group-hover:rotate-90 transition-transform duration-300"
          strokeWidth={2.5}
        />
      </button>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={
          mode === 'batch'
            ? `Lançamento em massa — ${batchType === 'income' ? 'Receitas' : 'Despesas'}`
            : kind === 'cobranca' ? 'Nova cobrança' : 'Novo lançamento'
        }
        size={mode === 'batch' ? 'lg' : 'md'}
      >
        {/* Abas: Transação | Cobrança (só no modo single) */}
        {mode === 'single' && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-ink-100 rounded-xl mb-4">
            <button
              type="button"
              onClick={() => setKind('transacao')}
              className={`flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg text-sm font-bold transition-colors ${
                kind === 'transacao' ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" /> Transação
            </button>
            <button
              type="button"
              onClick={() => setKind('cobranca')}
              className={`flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg text-sm font-bold transition-colors ${
                kind === 'cobranca' ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              <HandCoins className="w-4 h-4" /> Cobrança
            </button>
          </div>
        )}

        {mode === 'batch' ? (
          <BatchTransactionForm
            type={batchType}
            onSaved={(count) => { handleClose(); onAdded?.(count); }}
            onCancel={handleClose}
          />
        ) : kind === 'cobranca' ? (
          <CobrancaQuickForm
            onSaved={() => { handleClose(); onAdded?.(); }}
            onCancel={handleClose}
          />
        ) : (
          <TransactionForm
            onSaved={() => { handleClose(); onAdded?.(); }}
            onCancel={handleClose}
            onSwitchToBatch={switchToBatch}
          />
        )}
      </Modal>
    </>
  );
}
