import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Upload, Search, X, Trash2, Loader2, Star, Eraser, Filter, FilterX, Columns3, ArrowUp, ArrowDown, Lock,
} from 'lucide-react';
import { quoteService, parseSpreadsheet } from '../services/quotes';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  ColumnFilterMenu, ColumnsMenu, ColumnPickerMenu, compareCells, columnKinds, displayCell,
} from '../components/SheetFilters';

/** Colunas escondidas, por cotação — preferência deste aparelho. */
const hiddenKey = (id) => `cofre_cotacao_colunas_${id}`;
function loadHidden(id) {
  try { return new Set(JSON.parse(localStorage.getItem(hiddenKey(id))) || []); } catch { return new Set(); }
}

/** A linha passa nos filtros de coluna, menos o da coluna `except` (pro menu dela). */
function passesFilters(values, filters, except) {
  return Object.entries(filters).every(([c, set]) => Number(c) === except || set.has(values[c] ?? ''));
}

/**
 * Cotação — a planilha do cliente com os itens destacados.
 *
 * Envia .xlsx/.xls/.csv (lido e limpo no navegador), toca na linha pra
 * destacar e pronto: cada planilha vira uma cotação salva e cada destaque é
 * gravado na hora. Várias pessoas na mesma conta podem marcar juntas — os
 * destaques dos outros aparecem ao vivo (Realtime) e ninguém apaga o de ninguém.
 * Item marcado fica TRAVADO: desmarcar (ou limpar todos) pede confirmação,
 * pra ninguém soltar sem querer o que outra pessoa marcou.
 *
 * Filtros como os do Excel: em cada coluna, ordenar e marcar quais valores
 * aparecem (a lista respeita os filtros das outras colunas); e escolher quais
 * colunas mostrar.
 */
export default function Cotacao() {
  const [quotes, setQuotes] = useState(null);   // lista (sem as linhas)
  const [current, setCurrent] = useState(null); // cotação aberta (com linhas)
  const [highlighted, setHighlighted] = useState(new Set());
  const [search, setSearch] = useState('');
  const [onlyHighlighted, setOnlyHighlighted] = useState(false);
  const [busy, setBusy] = useState(''); // 'upload' | 'open'
  const [error, setError] = useState('');
  const [confirmReq, setConfirmReq] = useState(null);
  const [filters, setFilters] = useState({}); // coluna → Set dos valores que aparecem
  const [sort, setSort] = useState(null);     // { col, dir: 'asc' | 'desc' }
  const [hidden, setHidden] = useState(new Set());
  const [menu, setMenu] = useState(null);     // { type: 'filter' | 'columns', col?, anchor }

  useEffect(() => {
    quoteService.list()
      .then((list) => { setQuotes(list); if (list[0]) open(list[0].id); })
      .catch((err) => {
        console.error(err);
        setQuotes([]);
        setError(err?.code === '42P01' || err?.code === 'PGRST205'
          ? 'Falta rodar a migration supabase/migration_quotes.sql no Supabase.'
          : 'Não foi possível carregar as cotações.');
      });
  }, []);

  // Destaques feitos em outros aparelhos (mesma conta) entram na hora.
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return undefined;
    return quoteService.subscribe(currentId, (index, on) => {
      setHighlighted((prev) => {
        if (prev.has(index) === on) return prev;
        const next = new Set(prev);
        on ? next.add(index) : next.delete(index);
        return next;
      });
    });
  }, [currentId]);

  async function open(id) {
    // A contagem do chip da cotação que está saindo fica com o valor atual.
    if (current) setQuotes((list) => list.map((q) => (q.id === current.id ? { ...q, marks: highlighted.size } : q)));
    setBusy('open');
    setError('');
    try {
      const q = await quoteService.get(id);
      setCurrent(q);
      setHighlighted(new Set(q.highlighted));
      resetView(q.id);
    } catch (err) {
      console.error(err);
      setError('Não foi possível abrir a cotação.');
    } finally {
      setBusy('');
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('upload');
    setError('');
    try {
      const { columns, rows } = await parseSpreadsheet(file);
      const q = await quoteService.create({ name: file.name, columns, rows });
      setQuotes((list) => [{ ...q, marks: 0 }, ...(list || [])]);
      setCurrent(q);
      setHighlighted(new Set());
      resetView(q.id);
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a cotação.');
    } finally {
      setBusy('');
    }
  }

  function resetView(quoteId) {
    setSearch('');
    setOnlyHighlighted(false);
    setFilters({});
    setSort(null);
    setMenu(null);
    setHidden(loadHidden(quoteId));
  }

  function changeHidden(next) {
    setHidden(next);
    try { localStorage.setItem(hiddenKey(current.id), JSON.stringify([...next])); } catch { /* só não lembra */ }
  }

  function applyFilter(col, values) {
    setFilters((prev) => {
      const next = { ...prev };
      if (values) next[col] = values; else delete next[col];
      return next;
    });
    setMenu(null);
  }

  function openMenu(e, type, col) {
    const { currentTarget } = e;
    setMenu((m) => (m?.type === type && m.col === col ? null : { type, col, anchor: currentTarget }));
  }

  /**
   * Marcar é imediato; item marcado fica travado — desmarcar pede confirmação.
   * (Mesma conta pra todos: o banco não sabe quem marcou, então vale pra todos.)
   */
  function toggle(index, values) {
    if (!highlighted.has(index)) { setMark(index, true); return; }
    setConfirmReq({
      title: 'Desmarcar item?',
      message: (
        <>
          <b className="text-ink-900">{values.filter(Boolean).slice(0, 2).join(' · ') || 'Este item'}</b> está marcado e travado.
          {' '}Ele volta a ficar livre para todos.
        </>
      ),
      confirmLabel: 'Desmarcar',
      onConfirm: () => setMark(index, false),
    });
  }

  /** Na tela na hora; no banco só aquela linha (desfaz se falhar). */
  async function setMark(index, on) {
    const flip = (value) => setHighlighted((prev) => {
      const next = new Set(prev);
      value ? next.add(index) : next.delete(index);
      return next;
    });
    flip(on);
    try {
      await quoteService.mark(current.id, index, on);
    } catch {
      flip(!on);
      setError('Não foi possível salvar o destaque. Tente de novo.');
    }
  }

  function askClearAll() {
    const n = highlighted.size;
    setConfirmReq({
      title: 'Limpar todos os destaques?',
      message: <><b className="text-ink-900">{n} {n === 1 ? 'item marcado volta' : 'itens marcados voltam'}</b> a ficar livres para todos.</>,
      confirmLabel: 'Limpar destaques',
      tone: 'danger',
      onConfirm: clearAll,
    });
  }

  async function clearAll() {
    const before = highlighted;
    setHighlighted(new Set());
    try {
      await quoteService.clearMarks(current.id);
    } catch {
      setHighlighted(before);
      setError('Não foi possível limpar os destaques.');
    }
  }

  function askRemove() {
    const q = current;
    setConfirmReq({
      title: 'Excluir cotação?',
      message: <><b className="text-ink-900">{q.name}</b> e os itens destacados serão apagados.</>,
      confirmLabel: 'Excluir',
      tone: 'danger',
      onConfirm: async () => {
        await quoteService.remove(q.id);
        const rest = quotes.filter((x) => x.id !== q.id);
        setQuotes(rest);
        setCurrent(null);
        if (rest[0]) open(rest[0].id);
      },
    });
  }

  const kinds = useMemo(() => (current ? columnKinds(current.columns, current.rows) : []), [current]);

  const visibleRows = useMemo(() => {
    if (!current) return [];
    const term = search.trim().toLowerCase();
    const rows = current.rows
      .map((values, index) => ({ values, index }))
      .filter((r) => (!onlyHighlighted || highlighted.has(r.index))
        && (!term || r.values.some((v, i) => displayCell(v, kinds[i]).toLowerCase().includes(term)))
        && passesFilters(r.values, filters, -1));
    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      rows.sort((a, b) => dir * compareCells(a.values[sort.col] ?? '', b.values[sort.col] ?? ''));
    }
    return rows;
  }, [current, kinds, search, onlyHighlighted, highlighted, filters, sort]);

  // Valores distintos da coluna do menu aberto, com contagem.
  const menuValues = useMemo(() => {
    if (menu?.type !== 'filter' || !current) return [];
    const counts = new Map();
    for (const values of current.rows) {
      if (!passesFilters(values, filters, menu.col)) continue;
      const v = values[menu.col] ?? '';
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => compareCells(a.value, b.value));
  }, [menu, current, filters]);

  const cols = current ? current.columns.map((_, i) => i).filter((i) => !hidden.has(i)) : [];
  // Cartão do celular: o texto mais descritivo vira o título; o resto, campos.
  const titleCol = cols.find((i) => kinds[i] === 'long') ?? cols.find((i) => kinds[i] === 'text') ?? cols[0];
  const isNumeric = (i) => kinds[i] === 'money' || kinds[i] === 'number';
  const filtering = Object.keys(filters).length > 0 || !!sort;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">Ferramentas</p>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight tracking-tight flex items-center gap-2 md:gap-3">
            <ClipboardList className="w-7 h-7 md:w-10 md:h-10 flex-shrink-0" strokeWidth={2.25} />
            Cotação
          </h1>
          <p className="text-sm md:text-base text-ink-500 mt-1">Envie a planilha do cliente e toque nos itens para marcar. Item marcado fica travado e tudo fica salvo.</p>
        </div>
        <label className={`btn-accent self-stretch sm:self-end flex-shrink-0 ${busy === 'upload' ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}>
          {busy === 'upload' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          {busy === 'upload' ? 'Lendo planilha…' : 'Enviar planilha'}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="sr-only" disabled={busy === 'upload'} />
        </label>
      </div>

      {error && <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>}

      {/* Cotações salvas */}
      {quotes === null ? (
        <div className="h-12 bg-ink-100 animate-pulse rounded-2xl" />
      ) : quotes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          {quotes.map((q) => {
            const active = current?.id === q.id;
            return (
              <button
                key={q.id}
                onClick={() => !active && open(q.id)}
                className={`flex-shrink-0 max-w-[260px] px-4 min-h-[44px] rounded-full text-left text-sm font-semibold flex items-center gap-2 transition-colors ${
                  active ? 'bg-gradient-dark text-white shadow-soft' : 'bg-white border border-hairline-light text-ink-700 hover:bg-ink-50'
                }`}
                title={q.name}
              >
                <span className="truncate">{q.name}</span>
                {(active ? highlighted.size : q.marks) > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${active ? 'bg-accent text-ink-900' : 'bg-accent/30 text-ink-900'}`}>
                    {active ? highlighted.size : q.marks}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {busy === 'open' && !current ? (
        <div className="h-72 bg-ink-100 animate-pulse rounded-2xl" />
      ) : current ? (
        <div className="card-flat p-4 md:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display font-bold text-base md:text-lg text-ink-900 truncate">{current.name}</p>
              <p className="text-xs text-ink-500">
                {visibleRows.length} de {current.rows.length} itens · <b className="text-ink-900">{highlighted.size}</b> {highlighted.size === 1 ? 'destacado' : 'destacados'}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {highlighted.size > 0 && (
                <button onClick={askClearAll} className="btn-pill-sm !min-h-[36px]" title="Tirar todos os destaques">
                  <Eraser className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Limpar destaques</span>
                </button>
              )}
              <button onClick={askRemove} className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50 transition-colors" title="Excluir cotação" aria-label="Excluir cotação">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar item…"
                className="input-field !min-h-[44px] !py-2 pl-10 pr-10"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100" aria-label="Limpar busca">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setOnlyHighlighted((v) => !v)}
              aria-pressed={onlyHighlighted}
              className={`flex-1 sm:flex-none whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 min-h-[44px] rounded-full text-xs font-bold transition-colors ${
                onlyHighlighted ? 'bg-gradient-dark text-white shadow-soft' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
              }`}
            >
              <Star className="w-3.5 h-3.5" /> Só destacados
            </button>
            <button
              onClick={(e) => openMenu(e, 'picker')}
              aria-expanded={menu?.type === 'picker'}
              className="md:hidden flex-1 sm:flex-none whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 min-h-[44px] rounded-full text-xs font-bold bg-ink-100 text-ink-600 hover:bg-ink-200 transition-colors"
            >
              <Filter className="w-3.5 h-3.5" /> Filtrar
              {Object.keys(filters).length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-ink-900 text-white text-[10px]">{Object.keys(filters).length}</span>}
            </button>
            <button
              onClick={(e) => openMenu(e, 'columns')}
              aria-expanded={menu?.type === 'columns'}
              className="flex-1 sm:flex-none whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 min-h-[44px] rounded-full text-xs font-bold bg-ink-100 text-ink-600 hover:bg-ink-200 transition-colors"
            >
              <Columns3 className="w-3.5 h-3.5" /> Colunas
              {hidden.size > 0 && <span className="px-1.5 py-0.5 rounded-full bg-ink-900 text-white text-[10px]">{cols.length}/{current.columns.length}</span>}
            </button>
            {filtering && (
              <button
                onClick={() => { setFilters({}); setSort(null); }}
                className="flex-1 sm:flex-none whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 min-h-[44px] rounded-full text-xs font-bold bg-accent/30 text-ink-900 hover:bg-accent/50 transition-colors"
              >
                <FilterX className="w-3.5 h-3.5" /> Limpar filtros
              </button>
            )}
            </div>
          </div>

          {/* Celular: um cartão por item, sem rolar pro lado */}
          <ul className="md:hidden rounded-xl border border-ink-200 divide-y divide-ink-100 overflow-hidden">
            {visibleRows.map(({ values, index }) => {
              const on = highlighted.has(index);
              return (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => toggle(index, values)}
                    aria-pressed={on}
                    className={`w-full text-left p-3 transition-colors ${on ? 'bg-accent/30 shadow-[inset_4px_0_0_#9bc92e]' : 'active:bg-ink-50'}`}
                  >
                    <span className="flex items-start gap-2">
                      {on && <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-ink-700" strokeWidth={2.5} aria-label="Travado" />}
                      <span className={`text-sm text-ink-900 ${on ? 'font-bold' : 'font-semibold'}`}>{displayCell(values[titleCol], kinds[titleCol]) || '—'}</span>
                    </span>
                    <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {cols.filter((i) => i !== titleCol).map((i) => (
                        <span key={i} className="min-w-0">
                          <span className="block text-[10px] uppercase tracking-wide text-ink-400 truncate">{current.columns[i]}</span>
                          <span className={`block text-xs text-ink-800 break-words ${isNumeric(i) ? 'tabular-nums' : ''}`}>{displayCell(values[i], kinds[i]) || '—'}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Desktop: tabela; números e reais alinhados à direita, como no Excel */}
          <div className="hidden md:block overflow-auto max-h-[70vh] rounded-xl border border-ink-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky top-0 z-[1] bg-ink-50 w-10 border-b border-ink-200" aria-label="Travado" />
                  {cols.map((i) => {
                    const active = !!filters[i] || sort?.col === i;
                    const SortIcon = sort?.dir === 'asc' ? ArrowUp : ArrowDown;
                    return (
                      <th key={i} className="sticky top-0 z-[1] bg-ink-50 px-3 py-2 align-bottom text-xs font-semibold text-ink-600 border-b border-ink-200">
                        <span className={`flex items-end gap-1.5 ${isNumeric(i) ? 'justify-end text-right' : 'text-left'}`}>
                          <span className="line-clamp-2 max-w-[11rem]" title={current.columns[i]}>{current.columns[i]}</span>
                          <button
                            type="button"
                            onClick={(e) => openMenu(e, 'filter', i)}
                            aria-label={`Filtrar ${current.columns[i]}`}
                            aria-expanded={menu?.type === 'filter' && menu.col === i}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                              active ? 'bg-ink-900 text-accent' : 'text-ink-400 hover:bg-ink-200 hover:text-ink-900'
                            }`}
                          >
                            {sort?.col === i && !filters[i] ? <SortIcon className="w-3.5 h-3.5" /> : <Filter className="w-3.5 h-3.5" />}
                          </button>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ values, index }) => {
                  const on = highlighted.has(index);
                  return (
                    <tr
                      key={index}
                      onClick={() => toggle(index, values)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(index, values); } }}
                      tabIndex={0}
                      aria-pressed={on}
                      className={`cursor-pointer border-b border-ink-100 last:border-0 transition-colors outline-none focus-visible:bg-ink-50 ${
                        on ? 'bg-accent/30 font-semibold shadow-[inset_4px_0_0_#9bc92e] hover:bg-accent/40' : 'hover:bg-ink-50'
                      }`}
                    >
                      <td className="pl-3 py-2.5 align-top w-10">
                        {on && <Lock className="w-3.5 h-3.5 mt-0.5 text-ink-700" strokeWidth={2.5} aria-label="Travado" />}
                      </td>
                      {cols.map((i) => (
                        <td
                          key={i}
                          className={`px-3 py-2.5 text-ink-800 align-top ${
                            isNumeric(i) ? 'text-right tabular-nums whitespace-nowrap'
                              : kinds[i] === 'long' ? 'min-w-[16rem]' : 'whitespace-nowrap'
                          }`}
                        >
                          {displayCell(values[i], kinds[i])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleRows.length === 0 && (
            <p className="p-6 text-sm text-ink-500 text-center">
              {filtering ? 'Nenhum item com esses filtros.' : onlyHighlighted ? 'Nenhum item destacado ainda.' : 'Nenhum item encontrado.'}
            </p>
          )}
        </div>
      ) : quotes?.length === 0 && !error && (
        <div className="card-flat p-8 md:p-12 text-center">
          <ClipboardList className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 text-ink-300" strokeWidth={1.75} />
          <p className="font-display text-lg md:text-xl font-bold mb-1">Nenhuma cotação ainda</p>
          <p className="text-sm text-ink-500">Envie a planilha do cliente (.xlsx, .xls ou .csv). Depois é só tocar nas linhas para destacar.</p>
        </div>
      )}

      {menu?.type === 'filter' && current && (
        <ColumnFilterMenu
          key={menu.col}
          anchor={menu.anchor}
          title={current.columns[menu.col]}
          format={(v) => displayCell(v, kinds[menu.col])}
          values={menuValues}
          selected={filters[menu.col] || null}
          sortDir={sort?.col === menu.col ? sort.dir : null}
          onSort={(dir) => { setSort(dir ? { col: menu.col, dir } : null); setMenu(null); }}
          onApply={(values) => applyFilter(menu.col, values)}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.type === 'picker' && current && (
        <ColumnPickerMenu
          anchor={menu.anchor}
          columns={current.columns}
          cols={cols}
          active={(i) => !!filters[i] || sort?.col === i}
          onPick={(col) => setMenu({ type: 'filter', col, anchor: menu.anchor })}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.type === 'columns' && current && (
        <ColumnsMenu anchor={menu.anchor} columns={current.columns} hidden={hidden} onChange={changeHidden} onClose={() => setMenu(null)} />
      )}

      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />
    </div>
  );
}
