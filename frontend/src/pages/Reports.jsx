import { useState, useCallback } from 'react';
import {
  FileText, Download, Share2, MessageCircle, Loader2, CheckCircle2,
  TrendingUp, TrendingDown, Wallet, Clock, Link2, Copy, Check,
} from 'lucide-react';
import MonthSelector from '../components/MonthSelector';
import { useMonth } from '../context/MonthContext';
import { formatCurrency } from '../utils/format';
import {
  buildReportData,
  generatePdf,
  buildWhatsappText,
  shareReportFile,
  openWhatsappText,
  downloadPdf,
  uploadReportAndGetLink,
} from '../services/reports';

/**
 * Página de Relatórios.
 *
 * Dois campos (como pedido):
 *   1. GERAR — escolhe o mês (MonthSelector) e gera o relatório → preview + PDF.
 *   2. ENVIAR — manda o relatório via WhatsApp (PDF anexo via Web Share,
 *               com fallback de resumo em texto via wa.me).
 */
export default function Reports() {
  const { month, label } = useMonth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null); // dados agregados
  const [pdf, setPdf] = useState(null);        // { blob, filename }
  const [phone, setPhone] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [link, setLink] = useState('');         // URL assinada do PDF no Storage
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [copied, setCopied] = useState(false);

  // ── Campo 1: gerar ──────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError('');
    setReport(null);
    setPdf(null);
    setSendMsg('');
    setLink('');
    setLinkError('');
    setCopied(false);
    try {
      const data = await buildReportData(month);
      const file = generatePdf(data);
      setReport(data);
      setPdf(file);
    } catch (err) {
      console.error(err);
      setError('Não foi possível gerar o relatório. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  function handleDownload() {
    if (pdf) downloadPdf(pdf.blob, pdf.filename);
  }

  // ── Campo 2: enviar via WhatsApp ────────────────────────────
  const handleSend = useCallback(async () => {
    if (!report || !pdf) return;
    setSendMsg('');
    const text = buildWhatsappText(report);

    // 1ª tentativa: compartilhar o PDF anexo via menu nativo (mobile/PWA)
    const result = await shareReportFile({ blob: pdf.blob, filename: pdf.filename, text });

    if (result === 'shared') {
      setSendMsg('Relatório compartilhado. ✓');
      return;
    }
    if (result === 'cancelled') {
      return; // usuário fechou o menu — não faz nada
    }
    // Fallback: abre o WhatsApp só com o resumo em texto + baixa o PDF pra anexar
    downloadPdf(pdf.blob, pdf.filename);
    openWhatsappText(text, phone);
    setSendMsg('Abrimos o WhatsApp com o resumo. O PDF foi baixado — anexe na conversa.');
  }, [report, pdf, phone]);

  // ── Campo 2b: gerar link do PDF (Storage) e enviar ──────────
  const handleGenerateLink = useCallback(async () => {
    if (!report || !pdf) return;
    setLinkLoading(true);
    setLinkError('');
    setCopied(false);
    try {
      const { url } = await uploadReportAndGetLink({ blob: pdf.blob, month: report.month });
      setLink(url);
    } catch (err) {
      console.error(err);
      setLinkError('Não foi possível gerar o link. Confirme se o Storage está configurado.');
    } finally {
      setLinkLoading(false);
    }
  }, [report, pdf]);

  async function handleCopyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard indisponível */ }
  }

  function handleSendLink() {
    if (!link || !report) return;
    const text = `${buildWhatsappText(report)}\n\n📄 Baixar relatório (PDF): ${link}`;
    openWhatsappText(text, phone);
  }

  return (
    <div className="space-y-5 pb-6 animate-fade-in">
      {/* Cabeçalho */}
      <div data-tour="page-header">
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-ink-500 text-sm mt-1">
          Gere o resumo financeiro de um mês e envie pelo WhatsApp.
        </p>
      </div>

      {/* ── CAMPO 1: GERAR ───────────────────────────────────── */}
      <section className="card-flat p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-accent/20 flex items-center justify-center">
            <FileText className="w-5 h-5 text-ink-900" strokeWidth={2.25} />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg tracking-tight">1. Gerar relatório</h2>
            <p className="text-xs text-ink-500">Escolha o mês e gere o documento.</p>
          </div>
        </div>

        <MonthSelector />

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Gerando…</>
            : <><FileText className="w-5 h-5" /> Gerar relatório de {label}</>}
        </button>

        {error && (
          <p className="text-sm text-negative font-medium">{error}</p>
        )}

        {/* Preview dos KPIs */}
        {report && (
          <div className="space-y-4 animate-slide-up">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Receitas" value={formatCurrency(report.kpis.income)} icon={TrendingUp} tone="positive" />
              <KpiTile label="Despesas" value={formatCurrency(report.kpis.expense)} icon={TrendingDown} tone="negative" />
              <KpiTile label="Saldo do mês" value={formatCurrency(report.kpis.balance)} icon={Wallet} tone={report.kpis.balance >= 0 ? 'positive' : 'negative'} />
              <KpiTile label="Lançamentos" value={String(report.kpis.txCount)} icon={FileText} tone="neutral" />
            </div>

            {report.kpis.unpaidCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-warn bg-yellow-50 rounded-xl px-3 py-2">
                <Clock className="w-4 h-4 flex-shrink-0" strokeWidth={2.25} />
                <span className="font-medium text-yellow-800">
                  {report.kpis.unpaidCount} despesa(s) pendente(s) — {formatCurrency(report.kpis.unpaidTotal)}
                </span>
              </div>
            )}

            <button
              onClick={handleDownload}
              className="btn-ghost w-full min-h-[44px] flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Baixar PDF
            </button>
          </div>
        )}
      </section>

      {/* ── CAMPO 2: ENVIAR ──────────────────────────────────── */}
      <section className={`card-flat p-4 md:p-5 space-y-4 transition-opacity ${report ? '' : 'opacity-50 pointer-events-none'}`}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-positive/15 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-positive" strokeWidth={2.25} />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg tracking-tight">2. Enviar via WhatsApp</h2>
            <p className="text-xs text-ink-500">
              {report ? 'Compartilha o PDF (mobile) ou abre o resumo no WhatsApp.' : 'Gere um relatório primeiro.'}
            </p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="phone">Telefone (opcional)</label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ex: (11) 91234-5678"
            className="input-field"
          />
          <p className="text-[11px] text-ink-400 mt-1">
            Deixe vazio pra escolher o contato na hora. No celular, o PDF vai anexado.
          </p>
        </div>

        <button
          onClick={handleSend}
          disabled={!report}
          className="btn-accent w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Share2 className="w-5 h-5" /> Enviar pelo WhatsApp
        </button>

        {sendMsg && (
          <p className="text-sm text-positive font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {sendMsg}
          </p>
        )}

        {/* Separador */}
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 h-px bg-ink-100" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">ou por link</span>
          <div className="flex-1 h-px bg-ink-100" />
        </div>

        {!link ? (
          <button
            onClick={handleGenerateLink}
            disabled={!report || linkLoading}
            className="btn-ghost w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {linkLoading
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Gerando link…</>
              : <><Link2 className="w-5 h-5" /> Gerar link do PDF</>}
          </button>
        ) : (
          <div className="space-y-2 animate-slide-up">
            <div className="flex items-center gap-2 bg-ink-50 rounded-xl p-2">
              <Link2 className="w-4 h-4 text-ink-400 flex-shrink-0 ml-1" />
              <span className="text-xs text-ink-600 truncate flex-1">{link}</span>
              <button
                onClick={handleCopyLink}
                className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-white text-ink-700 font-bold text-xs hover:bg-ink-100 flex items-center gap-1 flex-shrink-0 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-positive" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="text-[11px] text-ink-400">
              Link válido por ~90 dias. Quem abrir baixa o PDF — não precisa de login.
            </p>
            <button
              onClick={handleSendLink}
              className="btn-accent w-full min-h-[48px] flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" /> Enviar link no WhatsApp
            </button>
          </div>
        )}

        {linkError && (
          <p className="text-sm text-negative font-medium">{linkError}</p>
        )}
      </section>
    </div>
  );
}

/** Mini-card de KPI no preview. */
function KpiTile({ label, value, icon: Icon, tone }) {
  const toneClass = {
    positive: 'text-positive',
    negative: 'text-negative',
    neutral: 'text-ink-900',
  }[tone] || 'text-ink-900';

  return (
    <div className="bg-ink-50 rounded-2xl p-3">
      <div className="flex items-center gap-1.5 text-ink-500">
        <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`font-display font-bold text-lg mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}
