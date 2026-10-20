import { useEffect, useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { categoryService } from '../services';

/**
 * Select de categoria com criação inline.
 * --------------------------------------------------------------
 * Mostra um <select> + botão "+". Clicando no "+", o controle vira um
 * mini-form inline (nome + cor) que cria a categoria via categoryService
 * e, ao salvar, seleciona automaticamente a recém-criada.
 *
 * Usa AnimatePresence + motion.div pra animar a troca select <-> form.
 *
 * Props:
 *  - type:     'income' | 'expense'  (filtra categorias)
 *  - value:    UUID da categoria atual
 *  - onChange: (id) => void
 *  - autoSelectFirst (default true): se value não estiver na lista, seleciona o primeiro
 */

const PRESET_COLORS = [
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#ec4899', '#ef4444', '#f59e0b', '#eab308',
];

export default function CategorySelect({ type, value, onChange, autoSelectFirst = true }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estado do mini-form de criação
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function load(selectId = null) {
    setLoading(true);
    try {
      const data = await categoryService.list(type);
      setCategories(data);
      if (selectId) {
        onChange(selectId);
      } else if (autoSelectFirst && data.length > 0 && !data.find((c) => c.id === value)) {
        onChange(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  function resetCreate() {
    setCreating(false);
    setNewName('');
    setNewColor(PRESET_COLORS[0]);
    setError(null);
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('Informe um nome para a categoria');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await categoryService.create({
        name: trimmed,
        type,
        color: newColor,
      });
      // Recarrega + seleciona a nova
      await load(created.id);
      resetCreate();
    } catch (err) {
      setError(err.message || 'Erro ao criar categoria');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {creating ? (
        <motion.div
          key="create"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="p-3 md:p-4 bg-surface-soft border border-hairline-light rounded-xl space-y-3"
        >
          {/* Cabeçalho compacto: título + X */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-700 truncate">
              Nova categoria · {type === 'income' ? 'receita' : 'despesa'}
            </p>
            <button
              type="button"
              onClick={resetCreate}
              disabled={submitting}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-ink-500 hover:text-ink-900 hover:bg-ink-200 transition-colors disabled:opacity-60"
              aria-label="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Input do nome — full width, mesma altura do select pra alinhar */}
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex.: Mercado, Pet, Bônus…"
            className="input-field"
            autoFocus
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                resetCreate();
              }
            }}
          />

          {/* Paleta de cores — grid responsivo: 8 cols num linha só, sem wrap descontrolado */}
          <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`aspect-square w-full rounded-full transition-transform ${
                  newColor === c
                    ? 'ring-2 ring-ink-950 ring-offset-2 ring-offset-surface-soft scale-110'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-negative/30 text-negative text-xs rounded-xl">
              {error}
            </div>
          )}

          {/* CTA único — full width pra alinhar com o input acima */}
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || !newName.trim()}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-full text-sm font-bold bg-accent text-ink-950 hover:bg-accent-light transition-colors disabled:opacity-60"
          >
            <Check className="w-4 h-4" strokeWidth={2.5} />
            {submitting ? 'Criando…' : 'Criar e usar'}
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="select"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="flex gap-2"
        >
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input-field flex-1 min-w-0"
            disabled={loading}
          >
            {loading && <option value="">— Carregando —</option>}
            {!loading && categories.length === 0 && (
              <option value="">Nenhuma categoria — clique em + pra criar</option>
            )}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex-shrink-0 w-12 min-h-[48px] flex items-center justify-center rounded-xl bg-surface-soft hover:bg-ink-200 text-ink-900 transition-colors"
            title="Criar nova categoria"
            aria-label="Criar nova categoria"
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
