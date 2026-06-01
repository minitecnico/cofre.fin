import { useState, useRef, useMemo } from 'react';
import {
  FileSpreadsheet, Download, Upload, FileDown, AlertCircle,
  CheckCircle2, AlertTriangle, FileText, ArrowLeft, Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  generateTemplateXLSX,
  exportTransactionsXLSX,
  parseImportSpreadsheet,
  importValidRows,
  loadImportContext,
  downloadBlob,
} from '../services/importExport';
import { requestAiTask } from '../services/ai';
import { useMonth } from '../context/MonthContext';
import { formatCurrency } from '../utils/format';

/**
 * Página: Importar / Exportar transações via CSV.
 * --------------------------------------------------------------
 * 3 ações principais:
 *   1. Baixar planilha em branco (template)
 *   2. Baixar transações atuais (export)
 *   3. Subir planilha preenchida → preview → confirmar import
 */
export default function ImportExport() {
  const { month, label, startDate, endDate } = useMonth();
  const fileRef = useRef(null);

  const [exportingTemplate, setExportingTemplate] = useState(false);
  const [exportingMonth, setExportingMonth] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const [importStep, setImportStep] = useState('idle'); // idle | parsing | preview | importing | done
  const [preview, setPreview] = useState(null);
  const [importContext, setImportContext] = useState(null);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  // ─────────────────────────────────────────────────────
  // Ações de DOWNLOAD
  // ─────────────────────────────────────────────────────
  async function handleDownloadTemplate() {
    setExportingTemplate(true);
    setError(null);
    try {
      const blob = await generateTemplateXLSX();
      downloadBlob(blob, 'cofre-modelo-importacao.xlsx');
    } catch (err) {
      setError({ kind: 'error', text: 'Erro ao gerar modelo: ' + err.message });
    } finally {
      setExportingTemplate(false);
    }
  }

  async function handleExportMonth() {
    setExportingMonth(true);
    setError(null);
    try {
      const { blob, count } = await exportTransactionsXLSX({ startDate, endDate });
      downloadBlob(blob, `cofre-${month}.xlsx`);
      if (count === 0) {
        setError({ kind: 'info', text: 'Nenhuma transação no mês — arquivo gerado com cabeçalho apenas.' });
      }
    } catch (err) {
      setError({ kind: 'error', text: 'Erro ao exportar: ' + err.message });
    } finally {
      setExportingMonth(false);
    }
  }

  async function handleExportAll() {
    setExportingAll(true);
    setError(null);
    try {
      const { blob } = await exportTransactionsXLSX();
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `cofre-completo-${today}.xlsx`);
    } catch (err) {
      setError({ kind: 'error', text: 'Erro ao exportar: ' + err.message });
    } finally {
      setExportingAll(false);
    }
  }

  // ─────────────────────────────────────────────────────
  // Ações de UPLOAD
  // ─────────────────────────────────────────────────────
  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStep('parsing');
    setError(null);
    setPreview(null);

    try {
      const ctx = await loadImportContext();
      const result = await parseImportSpreadsheet(file, ctx);
      setImportContext(ctx);
      setPreview(result);
      setImportStep('preview');
    } catch (err) {
      setError({ kind: 'error', text: err.message || 'Não foi possível ler o arquivo.' });
      setImportStep('idle');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleConfirmImport() {
    if (!preview) return;
    setImportStep('importing');
    setError(null);
    try {
      const result = await importValidRows(preview.rows);
      setImportResult(result);
      setImportStep('done');
    } catch (err) {
      setError({ kind: 'error', text: 'Erro durante a importação: ' + err.message });
      setImportStep('preview');
    }
  }

  function resetImport() {
    setImportStep('idle');
    setPreview(null);
    setImportResult(null);
    setError(null);
    setImportContext(null);
  }

  async function handleAiClassify() {
    if (!preview || !importContext) return;
    const candidates = preview.rows.filter((row) =>
      row.parsed.description && row.parsed.type && !row.parsed.category_id
    );
    if (!candidates.length) {
      setError({ kind: 'info', text: 'Não há categorias pendentes para a IA sugerir.' });
      return;
    }

    setClassifying(true);
    setError(null);
    try {
      const result = await requestAiTask('import_categories', '', {
        itens: candidates.map((row) => ({
          index: row.lineNumber,
          tipo: row.parsed.type,
          descricao: row.parsed.description,
        })),
        categoriasDisponiveis: importContext.categories.map(({ id, name, type }) => ({ id, name, type })),
      });
      setPreview(applyAiCategorySuggestions(preview, result.suggestions, importContext.categories));
    } catch (err) {
      setError({ kind: 'error', text: 'A IA não conseguiu sugerir categorias: ' + err.message });
    } finally {
      setClassifying(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 max-w-4xl">
      {/* Header */}
      <div className="space-y-1">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-ink-500 hover:text-ink-900 font-bold mb-1 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Ajustes
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight tracking-tight flex items-center gap-2 md:gap-3">
          <FileSpreadsheet className="w-7 h-7 md:w-10 md:h-10 flex-shrink-0" strokeWidth={2.25} />
          <span>Importar e Exportar</span>
        </h1>
        <p className="text-sm md:text-base text-ink-500">
          Baixe seus dados em CSV ou suba uma planilha preenchida para criar várias transações de uma vez.
        </p>
      </div>

      {/* Erro / aviso global */}
      {error && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium flex items-start gap-3 ${
            error.kind === 'error'
              ? 'bg-red-50 border border-negative text-negative'
              : 'bg-yellow-50 border border-warn text-yellow-900'
          }`}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error.text}</span>
          <button onClick={() => setError(null)} className="text-xs underline opacity-70 hover:opacity-100">
            ok
          </button>
        </div>
      )}

      {importStep === 'idle' && (
        <>
          {/* SEÇÃO 1: Download (3 cards) */}
          <section>
            <h2 className="font-display text-lg md:text-xl font-bold mb-3 tracking-tight">
              📥 Baixar dados
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ActionCard
                title="Modelo Excel"
                description="Planilha .xlsx com cabeçalhos certos, suas categorias e cartões em abas separadas."
                icon={FileText}
                buttonLabel={exportingTemplate ? 'Gerando…' : 'Baixar modelo'}
                onClick={handleDownloadTemplate}
                disabled={exportingTemplate}
                variant="accent"
              />
              <ActionCard
                title={`Transações de ${label}`}
                description="Exporta apenas o mês selecionado como Excel, com tudo já preenchido."
                icon={Download}
                buttonLabel={exportingMonth ? 'Exportando…' : 'Baixar mês'}
                onClick={handleExportMonth}
                disabled={exportingMonth}
              />
              <ActionCard
                title="Histórico completo"
                description="Todas as transações já cadastradas em Excel. Útil pra backup."
                icon={FileDown}
                buttonLabel={exportingAll ? 'Exportando…' : 'Baixar tudo'}
                onClick={handleExportAll}
                disabled={exportingAll}
              />
            </div>
          </section>

          {/* SEÇÃO 2: Upload */}
          <section>
            <h2 className="font-display text-lg md:text-xl font-bold mb-3 tracking-tight">
              📤 Subir planilha preenchida
            </h2>

            <div className="card-flat p-5 md:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/30 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-ink-900" strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-bold text-base md:text-lg tracking-tight">
                    Como funciona
                  </h3>
                  <ul className="text-xs md:text-sm text-ink-600 mt-1 space-y-1 list-disc list-inside">
                    <li><strong>Aceita Excel (.xlsx, .xls) e CSV</strong> — preferência por Excel pra evitar problemas com acentos</li>
                    <li><strong>Categorias e cartões</strong>: aceitamos nomes aproximados (ex: "alimentacao" vira "Alimentação")</li>
                    <li><strong>Datas</strong>: formato BR (04/05/2026) ou ISO (2026-05-04). No Excel, use a coluna como Data mesmo</li>
                    <li><strong>Parcelas</strong>: coluna "Parcelas" com 8 cria 8 transações automaticamente</li>
                    <li><strong>Duplicatas</strong>: se a mesma data + descrição + valor já existir, a linha é ignorada</li>
                    <li><strong>Preview antes de importar</strong>: você revisa tudo antes de confirmar</li>
                  </ul>
                </div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={handleFileSelected}
                className="hidden"
              />

              <button
                onClick={() => fileRef.current?.click()}
                className="w-full px-4 py-6 min-h-[100px] border-2 border-dashed border-ink-300 hover:border-ink-900 hover:bg-accent/10 rounded-xl text-sm font-semibold transition-all duration-200 flex flex-col items-center justify-center gap-2 text-ink-600 hover:text-ink-900"
              >
                <Upload className="w-7 h-7" strokeWidth={2.25} />
                <div>
                  <p className="font-bold text-base">Clique para escolher um arquivo</p>
                  <p className="text-xs text-ink-500 mt-0.5 font-medium">
                    Aceita Excel (.xlsx, .xls) ou CSV
                  </p>
                </div>
              </button>
            </div>
          </section>
        </>
      )}

      {importStep === 'parsing' && (
        <div className="card-flat p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full border-4 border-ink-200 border-t-accent animate-spin" />
          <p className="font-display font-bold text-lg">Analisando arquivo…</p>
          <p className="text-sm text-ink-500 mt-1">Verificando categorias, cartões e duplicatas.</p>
        </div>
      )}

      {importStep === 'preview' && preview && (
        <ImportPreview
          preview={preview}
          onCancel={resetImport}
          onConfirm={handleConfirmImport}
          onAiClassify={handleAiClassify}
          classifying={classifying}
        />
      )}

      {importStep === 'importing' && (
        <div className="card-flat p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full border-4 border-ink-200 border-t-accent animate-spin" />
          <p className="font-display font-bold text-lg">Importando…</p>
          <p className="text-sm text-ink-500 mt-1">Não feche essa página.</p>
        </div>
      )}

      {importStep === 'done' && importResult && (
        <ImportResult result={importResult} onReset={resetImport} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────────

function ActionCard({ title, description, icon: Icon, buttonLabel, onClick, disabled, variant }) {
  const isAccent = variant === 'accent';
  return (
    <div className={`card-flat p-4 md:p-5 flex flex-col ${isAccent ? '!bg-gradient-accent !border-transparent' : ''}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
        isAccent ? 'bg-ink-900/15 text-ink-900' : 'bg-ink-100 text-ink-700'
      }`}>
        <Icon className="w-5 h-5" strokeWidth={2.25} />
      </div>
      <h3 className={`font-display font-bold text-base md:text-lg tracking-tight ${
        isAccent ? 'text-ink-900' : 'text-ink-900'
      }`}>
        {title}
      </h3>
      <p className={`text-xs md:text-sm mt-1 mb-4 flex-1 ${
        isAccent ? 'text-ink-800' : 'text-ink-500'
      }`}>
        {description}
      </p>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`px-4 py-2.5 min-h-[40px] font-bold rounded-xl text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-60 ${
          isAccent
            ? 'bg-ink-900 text-white hover:shadow-soft-md'
            : 'bg-ink-900 text-white hover:bg-ink-800 shadow-soft hover:shadow-soft-md'
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function ImportPreview({ preview, onCancel, onConfirm, onAiClassify, classifying }) {
  const { rows, summary } = preview;
  const importableCount = summary.ok + summary.warn;
  const [filter, setFilter] = useState('all'); // all | ok | warn | error | duplicate

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const totalAmount = useMemo(() => {
    return rows
      .filter((r) => r.status === 'ok' || r.status === 'warn')
      .reduce((s, r) => s + (r.parsed.amount || 0), 0);
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="card-flat p-5 md:p-6">
        <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight mb-1">
          📋 Pré-visualização
        </h2>
        <p className="text-sm text-ink-500 mb-4">
          Confira os dados antes de importar. Linhas com erro serão ignoradas automaticamente.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryStat label="Prontas" value={summary.ok} colorClass="text-positive" />
          <SummaryStat label="Avisos" value={summary.warn} colorClass="text-warn" />
          <SummaryStat label="Erros" value={summary.error} colorClass="text-negative" />
          <SummaryStat label="Duplicadas" value={summary.duplicate} colorClass="text-ink-500" />
        </div>

        <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-500 font-bold">
              Total a importar
            </p>
            <p className="font-display text-2xl font-bold mt-0.5">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-ink-500 font-bold">
              Linhas
            </p>
            <p className="font-display text-2xl font-bold mt-0.5">
              {importableCount} <span className="text-sm text-ink-400">/ {summary.total}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        {[
          { id: 'all', label: `Todas (${summary.total})` },
          { id: 'ok', label: `Prontas (${summary.ok})`, hide: summary.ok === 0 },
          { id: 'warn', label: `Avisos (${summary.warn})`, hide: summary.warn === 0 },
          { id: 'error', label: `Erros (${summary.error})`, hide: summary.error === 0 },
          { id: 'duplicate', label: `Duplicadas (${summary.duplicate})`, hide: summary.duplicate === 0 },
        ].filter((f) => !f.hide).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
              filter === f.id
                ? 'bg-gradient-dark text-white shadow-soft'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        {summary.error > 0 && (
          <button
            type="button"
            onClick={onAiClassify}
            disabled={classifying}
            className="btn-pill-sm !bg-accent disabled:opacity-60"
          >
            <Sparkles className={`w-3.5 h-3.5 ${classifying ? 'animate-pulse' : ''}`} />
            {classifying ? 'Analisando...' : 'Sugerir categorias com IA'}
          </button>
        )}
      </div>

      {/* Linhas */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {filteredRows.map((row) => (
          <RowPreview key={row.lineNumber} row={row} />
        ))}
      </div>

      {/* Ações */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 sticky bottom-4 bg-gradient-card p-3 rounded-2xl shadow-soft-lg border border-ink-200">
        <button onClick={onCancel} className="btn-ghost flex-shrink-0">
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={importableCount === 0}
          className="btn-accent flex-1 disabled:opacity-60"
        >
          {importableCount === 0
            ? 'Nenhuma linha válida'
            : `Importar ${importableCount} ${importableCount === 1 ? 'linha' : 'linhas'}`}
        </button>
      </div>
    </div>
  );
}

function normalizeCategoryName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function applyAiCategorySuggestions(preview, suggestions = [], categories = []) {
  const suggestionMap = new Map((suggestions || []).map((suggestion) => [Number(suggestion.index), suggestion]));
  const rows = preview.rows.map((row) => {
    const suggestion = suggestionMap.get(Number(row.lineNumber));
    if (!suggestion || row.parsed.category_id) return row;

    const category = categories.find((item) =>
      item.type === row.parsed.type &&
      normalizeCategoryName(item.name) === normalizeCategoryName(suggestion.categoryName)
    );
    if (!category) return row;

    const messages = row.messages
      .filter((message) => !message.text.startsWith('Categoria '))
      .concat({ level: 'warn', text: `IA sugeriu a categoria "${category.name}": ${suggestion.reason || 'categoria compatível com a descrição'}.` });
    const hasError = messages.some((message) => message.level === 'error');

    return {
      ...row,
      status: hasError ? 'error' : 'warn',
      parsed: { ...row.parsed, category_id: category.id, categoryName: category.name },
      messages,
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      ok: rows.filter((row) => row.status === 'ok').length,
      warn: rows.filter((row) => row.status === 'warn').length,
      error: rows.filter((row) => row.status === 'error').length,
      duplicate: rows.filter((row) => row.status === 'duplicate').length,
    },
  };
}

function SummaryStat({ label, value, colorClass }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3 text-center">
      <p className="text-[10px] uppercase tracking-widest text-ink-500 font-bold">{label}</p>
      <p className={`font-display text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
    </div>
  );
}

function RowPreview({ row }) {
  const { status, lineNumber, parsed, messages } = row;

  const statusConfig = {
    ok: { color: 'border-positive/30 bg-white', icon: CheckCircle2, iconColor: 'text-positive', label: 'OK' },
    warn: { color: 'border-warn/40 bg-yellow-50/40', icon: AlertTriangle, iconColor: 'text-warn', label: 'Aviso' },
    error: { color: 'border-negative/30 bg-red-50/40', icon: AlertCircle, iconColor: 'text-negative', label: 'Erro' },
    duplicate: { color: 'border-ink-200 bg-ink-50 opacity-70', icon: AlertTriangle, iconColor: 'text-ink-500', label: 'Duplicada' },
  };

  const cfg = statusConfig[status] || statusConfig.ok;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border-2 ${cfg.color} p-3 transition-colors`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${cfg.iconColor}`}>
          <Icon className="w-5 h-5" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest font-bold text-ink-500">
              Linha {lineNumber}
            </span>
            <span className={`text-[10px] uppercase font-bold tracking-widest ${cfg.iconColor}`}>
              · {cfg.label}
            </span>
          </div>

          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-sm md:text-base text-ink-900 truncate">
              {parsed.description || <span className="text-ink-400 italic">sem descrição</span>}
            </span>
            {parsed.amount != null && (
              <span className={`font-mono font-bold text-sm whitespace-nowrap ${
                parsed.type === 'income' ? 'text-positive' : 'text-negative'
              }`}>
                {parsed.type === 'income' ? '+' : '−'} {formatCurrency(parsed.amount)}
              </span>
            )}
          </div>

          <div className="mt-1 text-xs text-ink-500 flex flex-wrap gap-x-3 gap-y-0.5">
            {parsed.date && <span>📅 {parsed.date.split('-').reverse().join('/')}</span>}
            {parsed.categoryName && <span>🏷️ {parsed.categoryName}</span>}
            {parsed.cardName && <span>💳 {parsed.cardName}</span>}
            {parsed.installments > 1 && <span>📦 {parsed.installments}x</span>}
            {parsed.paid && <span className="text-positive font-semibold">✓ Pago</span>}
          </div>

          {messages.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {messages.map((m, i) => (
                <li
                  key={i}
                  className={`text-xs ${
                    m.level === 'error' ? 'text-negative' :
                    m.level === 'warn' ? 'text-yellow-800' : 'text-ink-500'
                  }`}
                >
                  • {m.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportResult({ result, onReset }) {
  const { simpleCreated, installmentTransactionsCreated, total, skipped } = result;

  return (
    <div className="card-flat p-6 md:p-8 text-center bg-gradient-accent">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-ink-900/15 flex items-center justify-center">
        <CheckCircle2 className="w-7 h-7 text-ink-900" strokeWidth={2.5} />
      </div>
      <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-ink-900">
        Importação concluída!
      </h2>
      <p className="text-ink-800 mt-2 font-medium">
        {total} {total === 1 ? 'transação criada' : 'transações criadas'} com sucesso.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-md mx-auto">
        <div className="rounded-xl bg-ink-900/10 p-3">
          <p className="text-[10px] uppercase tracking-widest font-bold text-ink-800">Simples</p>
          <p className="font-display text-2xl font-bold text-ink-900 mt-1">{simpleCreated}</p>
        </div>
        <div className="rounded-xl bg-ink-900/10 p-3">
          <p className="text-[10px] uppercase tracking-widest font-bold text-ink-800">Parcelas</p>
          <p className="font-display text-2xl font-bold text-ink-900 mt-1">{installmentTransactionsCreated}</p>
        </div>
        <div className="rounded-xl bg-ink-900/10 p-3">
          <p className="text-[10px] uppercase tracking-widest font-bold text-ink-800">Ignoradas</p>
          <p className="font-display text-2xl font-bold text-ink-900 mt-1">{skipped}</p>
        </div>
      </div>

      <button
        onClick={onReset}
        className="mt-6 px-5 py-3 min-h-[44px] bg-ink-900 text-white font-bold rounded-xl shadow-soft-md hover:shadow-soft-lg active:scale-[0.98] transition-all duration-200"
      >
        Importar outra planilha
      </button>
    </div>
  );
}
