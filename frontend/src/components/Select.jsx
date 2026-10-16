import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

/**
 * Seletor (substitui o <select> nativo) — mesmo visual do `input-field`.
 *
 * Por que não o nativo: não aceita ícone/logo por opção, e a lista do sistema
 * no mobile esconde o contexto do form. Aqui a lista abre EM LINHA, logo abaixo
 * do campo (empurra o conteúdo em vez de flutuar) — nunca fica cortada dentro
 * do bottom-sheet do Modal, que tem overflow próprio.
 *
 * Inteligente sem configurar: com muitas opções aparece uma busca (ignora
 * acento/maiúscula); teclado ↑ ↓ Enter Esc; fecha ao clicar fora.
 *
 * @param {Array<{ value: string, label: string, icon?: React.ReactNode, hint?: string }>} options
 */
export default function Select({
  value, onChange, options, label, icon: LabelIcon, placeholder = 'Selecione…',
  searchable = options.length > 7,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const id = useId();

  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => normalize(`${o.label} ${o.hint || ''}`).includes(q));
  }, [options, query]);

  // Ao abrir: limpa a busca, posiciona no item atual e foca a busca (se houver).
  // Depende só de `open` de propósito: re-render com o painel aberto não deve
  // resetar a busca nem a posição.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    if (searchable) searchRef.current?.focus();
  }, [open]);

  // Fecha ao clicar/tocar fora.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Mantém o item ativo visível ao navegar pelo teclado.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(option) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
  }

  return (
    <div ref={rootRef} onKeyDown={onKeyDown}>
      {label && (
        <label htmlFor={id} className="label flex items-center gap-1.5">
          {LabelIcon && <LabelIcon className="w-3.5 h-3.5" />} {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input-field flex items-center gap-2.5 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected?.icon}
        <span className={`flex-1 truncate ${selected ? 'text-ink-900' : 'text-ink-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-ink-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1.5 rounded-xl border border-hairline-light bg-white shadow-soft-md overflow-hidden animate-fade-in">
          {searchable && (
            <div className="flex items-center gap-2 px-3 border-b border-hairline-light">
              <Search className="w-4 h-4 text-ink-400 flex-shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                placeholder="Buscar…"
                className="w-full py-2.5 text-base md:text-sm bg-transparent focus:outline-none"
              />
            </div>
          )}
          <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-sm text-ink-400 text-center">Nada encontrado</li>
            )}
            {filtered.map((o, i) => {
              const isSel = o.value === value;
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSel}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={`min-h-[44px] px-3 flex items-center gap-2.5 text-sm cursor-pointer transition-colors ${
                    i === active ? 'bg-ink-50' : ''
                  }`}
                >
                  {o.icon}
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate ${isSel ? 'font-bold text-ink-900' : 'text-ink-800'}`}>{o.label}</span>
                    {o.hint && <span className="block truncate text-[11px] text-ink-400">{o.hint}</span>}
                  </span>
                  {isSel && <Check className="w-4 h-4 text-ink-900 flex-shrink-0" strokeWidth={2.5} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
