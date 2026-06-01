import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useDisclosure } from '../hooks/useDisclosure';
import Modal from './Modal';
import TransactionForm from './TransactionForm';
import BatchTransactionForm from './BatchTransactionForm';

export default function FloatingAddButton({ onAdded }) {
  const { isOpen, open, close } = useDisclosure();
  const [mode, setMode] = useState('single'); // 'single' | 'batch'
  const [batchType, setBatchType] = useState('expense'); // tipo do batch

  function handleOpen() {
    setMode('single');
    open();
  }

  function handleClose() {
    close();
    setMode('single'); // reset pro próximo abrir
  }

  function switchToBatch(typeFromForm) {
    setBatchType(typeFromForm || 'expense');
    setMode('batch');
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="fab group"
        aria-label="Adicionar transação"
        data-tour="add-button"
      >
        <Plus
          className="w-6 h-6 md:w-7 md:h-7 text-ink-900 group-hover:rotate-90 transition-transform duration-300"
          strokeWidth={2.5}
        />
      </button>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={mode === 'batch' ? `Lançamento em massa — ${batchType === 'income' ? 'Receitas' : 'Despesas'}` : 'Nova transação'}
        size={mode === 'batch' ? 'lg' : 'md'}
      >
        {mode === 'single' ? (
          <TransactionForm
            onSaved={() => { handleClose(); onAdded?.(); }}
            onCancel={handleClose}
            onSwitchToBatch={switchToBatch}
          />
        ) : (
          <BatchTransactionForm
            type={batchType}
            onSaved={(count) => {
              handleClose();
              onAdded?.(count);
            }}
            onCancel={handleClose}
          />
        )}
      </Modal>
    </>
  );
}
