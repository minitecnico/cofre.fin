import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowDownZA, Search, Check } from 'lucide-react';

/**
 * Filtros estilo Excel pra tabela da Cotação: menu de cada coluna (ordenar +
 * marcar valores) e menu de colunas visíveis. Os menus abrem num portal com
 * posição fixa — dentro do quadro da tabela (overflow) eles seriam cortados.
 * No celular viram folha de baixo: ancorados no cabeçalho, ficariam espremidos.
 */

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** '1.234,56' / 'R$ 10,00' / '120' → número; resto → null. */
function toNumber(v) {
  const s = String(v).replace(/^R\$\s*/, '').trim();
  if (!/^-?[\d.]+(,\d+)?$/.test(s)) return null;
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

const MONEY = /R\$\s?(-?\d{1,3}(?:\.\d{3})+|-?\d+)(?:,(\d+))?/g;

/**
 * Valores em reais sempre com 2 casas: 'R$ 0,0960 a R$ 0,1440' → 'R$ 0,10 a
 * R$ 0,14'; 'R$ 10' → 'R$ 10,00'. Só pra exibir — o texto da planilha fica
 * intacto (ordenar e filtrar usam o valor exato).
 */
export function formatCell(text) {
  return String(text).replace(MONEY, (_, int, dec) => {
    const n = Number(`${int.replace(/\./g, '')}.${dec || '0'}`);
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  });
}

/** Ordem do Excel: números como números, texto em ordem alfabética, vazio por último. */
export function compareCells(a, b) {
  if (!a !== !b) return a ? -1 : 1;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return collator.compare(a, b);
}

function Popover({ anchor, onClose, width = 288, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [sheet] = useState(() => window.innerWidth < 640);

  useLayoutEffect(() => {
    if (sheet) return undefined;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 16);
      setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8), width: w });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, width, sheet]);

  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  if (sheet) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end">
        <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm animate-fade-in" aria-hidden="true" />
        <div
          ref={ref}
          role="dialog"
          className="relative w-full max-h-[80vh] flex flex-col bg-white rounded-t-3xl shadow-soft-xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-ink-900 animate-slide-up"
        >
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `calc(100vh - ${pos.top + 12}px)` }}
      className="fixed z-50 flex flex-col bg-white rounded-2xl border border-hairline-light shadow-soft-xl p-2 text-ink-900 animate-fade-in"
    >
      {children}
    </div>,
    document.body,
  );
}

function CheckRow({ checked, onChange, children, count }) {
  return (
    <label className="flex items-center gap-2.5 px-2 min-h-[36px] rounded-lg hover:bg-ink-50 cursor-pointer text-sm">
      <span className={`w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-ink-900 text-white' : 'border-2 border-ink-300'}`}>
        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count != null && <span className="text-xs text-ink-400 tabular-nums">{count}</span>}
    </label>
  );
}

const LIST_LIMIT = 500;

/**
 * Menu de uma coluna: ordenar e escolher valores (aplica no OK, como no
 * Excel). `values` = valores distintos [{ value, count }] dos itens que passam
 * nos filtros das OUTRAS colunas; `selected` = Set atual ou null (sem filtro).
 */
export function ColumnFilterMenu({ anchor, title, values, selected, sortDir, onSort, onApply, onClose }) {
  const [term, setTerm] = useState('');
  const [draft, setDraft] = useState(() => new Set(selected ?? values.map((v) => v.value)));

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? values.filter((v) => (formatCell(v.value) || '(vazias)').toLowerCase().includes(t)) : values;
  }, [values, term]);
  const allChecked = shown.length > 0 && shown.every((v) => draft.has(v.value));
  // Com busca, valem só os marcados entre os encontrados (igual ao Excel).
  const chosen = (term.trim() ? shown : values).filter((v) => draft.has(v.value));

  function flip(value) {
    setDraft((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  function flipAll() {
    setDraft((prev) => {
      const next = new Set(prev);
      shown.forEach((v) => (allChecked ? next.delete(v.value) : next.add(v.value)));
      return next;
    });
  }

  function apply() {
    onApply(chosen.length === values.length ? null : new Set(chosen.map((v) => v.value)));
  }

  const sortBtn = (dir, Icon, label) => (
    <button
      type="button"
      onClick={() => onSort(sortDir === dir ? null : dir)}
      className={`w-full flex items-center gap-2.5 px-2 min-h-[36px] rounded-lg text-sm transition-colors ${sortDir === dir ? 'bg-accent/30 font-semibold' : 'hover:bg-ink-50'}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <Popover anchor={anchor} onClose={onClose}>
      <p className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-widest font-semibold text-ink-500 truncate">{title}</p>
      {sortBtn('asc', ArrowDownAZ, 'Ordenar A → Z')}
      {sortBtn('desc', ArrowDownZA, 'Ordenar Z → A')}
      <div className="my-2 border-t border-ink-100" />
      <div className="relative mb-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Pesquisar"
          className="w-full pl-8 pr-2 min-h-[36px] rounded-lg border border-hairline-light text-base md:text-sm focus:outline-none focus:border-ink-900"
          autoFocus
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto max-h-64">
        <CheckRow checked={allChecked} onChange={flipAll}>
          <b>{term.trim() ? '(Selecionar resultados)' : '(Selecionar tudo)'}</b>
        </CheckRow>
        {shown.slice(0, LIST_LIMIT).map((v) => (
          <CheckRow key={v.value} checked={draft.has(v.value)} onChange={() => flip(v.value)} count={v.count}>
            {formatCell(v.value) || <i className="text-ink-400">(Vazias)</i>}
          </CheckRow>
        ))}
        {shown.length > LIST_LIMIT && (
          <p className="px-2 py-1.5 text-[11px] text-ink-400">Mostrando {LIST_LIMIT} de {shown.length} — use a pesquisa.</p>
        )}
      </div>
      <div className="flex gap-2 pt-2 mt-1 border-t border-ink-100">
        <button type="button" onClick={() => onApply(null)} className="flex-1 min-h-[40px] rounded-full text-sm font-semibold text-ink-600 hover:bg-ink-100 transition-colors">
          Limpar filtro
        </button>
        <button type="button" onClick={apply} disabled={chosen.length === 0} className="flex-1 min-h-[40px] rounded-full bg-ink-900 text-white text-sm font-bold hover:bg-ink-800 transition-colors disabled:opacity-40">
          OK
        </button>
      </div>
    </Popover>
  );
}

/** Quais colunas aparecem (pelo menos uma fica). */
export function ColumnsMenu({ anchor, columns, hidden, onChange, onClose }) {
  const visibleCount = columns.length - hidden.size;
  function flip(i) {
    const next = new Set(hidden);
    if (next.has(i)) next.delete(i);
    else if (visibleCount > 1) next.add(i);
    onChange(next);
  }
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <p className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-widest font-semibold text-ink-500">Colunas visíveis</p>
      <div className="min-h-0 flex-1 overflow-y-auto max-h-80">
        {columns.map((c, i) => (
          <CheckRow key={i} checked={!hidden.has(i)} onChange={() => flip(i)}>{c}</CheckRow>
        ))}
      </div>
      {hidden.size > 0 && (
        <button type="button" onClick={() => onChange(new Set())} className="mt-2 pt-2 border-t border-ink-100 w-full min-h-[40px] rounded-lg text-sm font-semibold text-ink-700 hover:bg-ink-50">
          Mostrar todas
        </button>
      )}
    </Popover>
  );
}
