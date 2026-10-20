import { useEffect, useState } from 'react';
import { Plus, Tag, Trash2, Pencil } from 'lucide-react';
import { categoryService } from '../services';
import Modal from '../components/Modal';
import { useDisclosure } from '../hooks/useDisclosure';

const PRESET_COLORS = [
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#ec4899', '#ef4444', '#f59e0b', '#eab308',
  '#14b8a6', '#6366f1', '#64748b', '#0ea5e9',
];

function CategoryForm({ initial, onSaved, onCancel }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name || '',
    type: initial?.type || 'expense',
    color: initial?.color || PRESET_COLORS[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) await categoryService.update(initial.id, form);
      else await categoryService.create(form);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nome</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="input-field"
          required
          autoFocus
        />
      </div>

      <div>
        <label className="label">Tipo</label>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-ink-100">
          <button
            type="button"
            onClick={() => setForm({ ...form, type: 'income' })}
            className={`py-3 min-h-[44px] rounded-lg font-semibold text-sm uppercase tracking-wider transition-colors ${
              form.type === 'income' ? 'bg-accent text-ink-900 shadow-soft' : 'text-ink-500 hover:bg-white/70'
            }`}
          >
            Receita
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, type: 'expense' })}
            className={`py-3 min-h-[44px] rounded-lg font-semibold text-sm uppercase tracking-wider transition-colors ${
              form.type === 'expense' ? 'bg-ink-900 text-white shadow-soft' : 'text-ink-500 hover:bg-white/70'
            }`}
          >
            Despesa
          </button>
        </div>
      </div>

      <div>
        <label className="label">Cor</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={`w-11 h-11 rounded-xl shadow-soft transition-all ${
                form.color === c ? 'ring-2 ring-ink-900 ring-offset-2 scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      </div>

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
          {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </form>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null); // categoria pendente de confirmação
  const [deletingError, setDeletingError] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const { isOpen, open, close } = useDisclosure();

  async function load() {
    setLoading(true);
    try {
      const data = await categoryService.list();
      setCategories(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    setDeletingError(null);
    try {
      await categoryService.remove(deleting.id);
      setDeleting(null);
      load();
    } catch (err) {
      // Se o backend ainda barrar (migration não rodada), avisa de forma clara
      setDeletingError(
        err.message?.includes('foreign key') || err.code === '23503'
          ? 'Esta categoria tem transações vinculadas. Rode a migration migration_category_set_null.sql no Supabase para permitir a exclusão.'
          : (err.message || 'Erro ao excluir.')
      );
    } finally {
      setDeletingBusy(false);
    }
  }

  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 md:gap-4">
        <div>
          <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">
            Organização
          </p>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight">
            Categorias
          </h1>
        </div>

        <button onClick={() => { setEditing(null); open(); }} className="btn-accent self-start flex-shrink-0">
          <Plus className="w-5 h-5" /> Nova categoria
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
          <div className="h-56 md:h-64 bg-ink-100 animate-pulse rounded-2xl" />
          <div className="h-56 md:h-64 bg-ink-100 animate-pulse rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
          {[
            { title: 'Receitas', items: incomeCategories, accent: 'bg-accent' },
            { title: 'Despesas', items: expenseCategories, accent: 'bg-ink-900 text-white' },
          ].map(({ title, items, accent }) => (
            <div key={title} className="card-flat overflow-hidden">
              <div className={`px-4 md:px-6 py-3 md:py-4 ${accent} font-display text-lg md:text-xl font-bold`}>
                {title} <span className="text-xs md:text-sm font-mono opacity-70">({items.length})</span>
              </div>
              <div className="divide-y divide-ink-100">
                {items.length === 0 ? (
                  <p className="p-4 md:p-6 text-center text-sm text-ink-500">Nenhuma categoria</p>
                ) : (
                  items.map((c) => (
                    <div key={c.id} className="group flex items-center gap-3 p-3 md:p-4 hover:bg-ink-50">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: c.color }}
                      >
                        <Tag className="w-4 h-4 text-white" />
                      </div>
                      <span className="flex-1 font-medium text-sm md:text-base truncate">{c.name}</span>
                      {/* No mobile, ações sempre visíveis */}
                      <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditing(c); open(); }}
                          className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-ink-200 transition-colors"
                          aria-label="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setDeleting(c); setDeletingError(null); }}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-negative hover:bg-red-50 transition-colors"
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={close} title={editing ? 'Editar categoria' : 'Nova categoria'}>
        <CategoryForm
          initial={editing}
          onSaved={() => { close(); load(); }}
          onCancel={close}
        />
      </Modal>

      {/* Modal de confirmação de exclusão */}
      <Modal
        isOpen={!!deleting}
        onClose={() => { if (!deletingBusy) { setDeleting(null); setDeletingError(null); } }}
        title="Excluir categoria"
      >
        {deleting && (
          <div className="space-y-5">
            <div className="px-4 py-4 bg-red-50 border border-negative/20 rounded-2xl space-y-2">
              <p className="text-sm text-ink-900">
                Excluir a categoria{' '}
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-white text-xs font-bold"
                  style={{ backgroundColor: deleting.color }}
                >
                  {deleting.name}
                </span>
                ?
              </p>
              <p className="text-xs text-ink-700">
                ✓ <strong>Histórico preservado:</strong> as transações que usavam essa categoria continuam existindo — vão aparecer como <em>"Sem categoria"</em>.
              </p>
              <p className="text-xs text-ink-700">
                ⚠ Não há como desfazer.
              </p>
            </div>

            {deletingError && (
              <div className="px-4 py-3 bg-red-50 border border-negative/30 text-negative text-xs rounded-xl">
                {deletingError}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={() => { setDeleting(null); setDeletingError(null); }}
                disabled={deletingBusy}
                className="btn-ghost disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletingBusy}
                className="btn-danger-solid flex-1 disabled:opacity-60"
              >
                {deletingBusy ? 'Excluindo…' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
