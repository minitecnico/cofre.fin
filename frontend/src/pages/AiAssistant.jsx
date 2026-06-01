import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, CircleAlert, Download, FileText, Loader2, Mic, MicOff, Paperclip,
  RefreshCw, Send, Sparkles, Trash2, User, X,
} from 'lucide-react';
import { cardService, dashboardService, loanService, transactionService } from '../services';
import { sendAiMessage } from '../services/ai';
import { downloadOriginal, downloadText, extractDocument, formatFileSize } from '../services/aiDocuments';
import { useMonth } from '../context/MonthContext';

const MAX_ATTACHMENTS = 4;

function safeFilename(value) {
  return String(value || 'resposta')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'resposta';
}

function summarizeTransactions(transactions) {
  return transactions.map((transaction) => ({
    tipo: transaction.type === 'income' ? 'receita' : 'despesa',
    descricao: transaction.description,
    valor: Number(transaction.amount) || 0,
    data: transaction.date,
    pago: Boolean(transaction.paid),
    categoria: transaction.category?.name || 'Sem categoria',
    cartao: transaction.credit_card?.name || null,
  }));
}

function inlineContent(text) {
  return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="px-1 py-0.5 rounded bg-ink-200/70 font-mono text-[0.92em]">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function isTableDivider(line) {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isNumericCell(value) {
  const cleaned = String(value).replace(/[*_`]/g, '').trim();
  return /^(?:R\$\s*)?[-+−]?\s*\d[\d.,]*(?:\s*%|\s*x)?$/.test(cleaned);
}

function renderTable(lines, key) {
  const headers = tableCells(lines[0]);
  const rows = lines.slice(2).map(tableCells);

  return (
    <div key={key} className="my-3 overflow-x-auto rounded-xl border border-hairline-light bg-white">
      <table className="min-w-full border-collapse text-xs md:text-sm">
        <thead className="bg-ink-950 text-white">
          <tr>
            {headers.map((header, index) => (
              <th key={index} className="px-3 py-2.5 text-left font-bold whitespace-nowrap">
                {inlineContent(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline-light">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="even:bg-surface-soft/70">
              {headers.map((_, cellIndex) => {
                const cell = row[cellIndex] || '';
                return (
                  <td
                    key={cellIndex}
                    className={`px-3 py-2 align-top ${isNumericCell(cell) ? 'text-right font-mono tabular-nums whitespace-nowrap' : ''}`}
                  >
                    {inlineContent(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessageContent({ content }) {
  const lines = String(content).split('\n');
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push(
        <div key={`code-${index}`} className="my-3 overflow-x-auto rounded-xl bg-ink-950 p-3 text-ink-100">
          {language && <p className="mb-2 text-[10px] uppercase tracking-widest text-ink-400">{language}</p>}
          <pre className="font-mono text-xs leading-relaxed"><code>{code.join('\n')}</code></pre>
        </div>
      );
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const table = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        table.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(table, `table-${index}`));
      index -= 1;
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)/);
    const bullet = line.match(/^[-*•]\s+(.+)/);
    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);

    if (!line.trim()) blocks.push(<span key={index} className="block h-2" />);
    else if (heading) blocks.push(<strong key={index} className="block mt-3 mb-1 text-ink-900">{inlineContent(heading[1])}</strong>);
    else if (bullet) blocks.push(<span key={index} className="block pl-3 before:content-['•'] before:-ml-3 before:mr-1.5">{inlineContent(bullet[1])}</span>);
    else if (numbered) blocks.push(<span key={index} className="block pl-5 -indent-5">{numbered[1]}. {inlineContent(numbered[2])}</span>);
    else blocks.push(<span key={index} className="block">{inlineContent(line)}</span>);
  }

  return blocks;
}

export default function AiAssistant() {
  const { month, label, startDate, endDate } = useMonth();
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState('');
  const [loadingContext, setLoadingContext] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const bottomRef = useRef(null);
  const contextRequestRef = useRef(0);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  async function loadContext() {
    const requestId = contextRequestRef.current + 1;
    contextRequestRef.current = requestId;
    setLoadingContext(true);
    setContextError('');

    const results = await Promise.allSettled([
      dashboardService.summary('month', month),
      transactionService.list({ startDate, endDate, limit: 300 }),
      cardService.list(),
      dashboardService.forecast(3, month),
      loanService.list(),
    ]);
    const [summary, transactions, cards, forecast, loans] = results;
    const unavailable = results
      .map((result, index) => result.status === 'rejected' ? ['resumo', 'lançamentos', 'cartões', 'projeção', 'empréstimos'][index] : null)
      .filter(Boolean);

    if (requestId !== contextRequestRef.current) return;

    setContext({
      mesAnalisado: label,
      resumo: summary.status === 'fulfilled' ? summary.value : null,
      lancamentosDoMes: transactions.status === 'fulfilled'
        ? summarizeTransactions(transactions.value.transactions)
        : [],
      cartoes: cards.status === 'fulfilled'
        ? cards.value.map(({ card, ...details }) => ({ nome: card.name, ...details }))
        : [],
      projecao: forecast.status === 'fulfilled' ? forecast.value : null,
      emprestimosVigentes: loans.status === 'fulfilled'
        ? loans.value.map(({ parcels, ...loan }) => loan)
        : [],
      fontesIndisponiveis: unavailable,
    });
    setContextError(unavailable.length
      ? `Alguns dados não puderam ser carregados (${unavailable.join(', ')}). Você ainda pode conversar normalmente.`
      : '');
    setLoadingContext(false);
  }

  useEffect(() => {
    loadContext();
  }, [month, startDate, endDate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const readyAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.status === 'ready'),
    [attachments]
  );
  const canSend = Boolean(
    (input.trim() || readyAttachments.length) &&
    context &&
    !loadingContext &&
    !sending &&
    !attachments.some((attachment) => attachment.status === 'reading')
  );

  async function submit(text = input) {
    const content = text.trim() || 'Analise os documentos anexados e apresente os principais pontos de forma organizada.';
    if (
      !content ||
      !context ||
      sending ||
      attachments.some((attachment) => attachment.status === 'reading') ||
      (!text.trim() && !readyAttachments.length)
    ) return;

    const documents = readyAttachments.map(({ name, type, text: documentText }) => ({
      name,
      type,
      text: documentText,
    }));
    const attachmentSummary = documents.length
      ? `\n\nAnexos: ${documents.map((document) => document.name).join(', ')}`
      : '';
    const nextMessages = [
      ...messages.filter((message) => message.kind !== 'error'),
      { role: 'user', content: `${content}${attachmentSummary}` },
    ];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const answer = await sendAiMessage(nextMessages, context, documents);
      setMessages((current) => [...current, { role: 'assistant', content: answer, kind: 'answer' }]);
      setAttachments([]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: error.message || 'Não consegui responder agora.', kind: 'error' },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    submit();
  }

  async function handleFiles(files) {
    const availableSlots = MAX_ATTACHMENTS - attachments.length;
    if (availableSlots <= 0) return;

    const selected = Array.from(files || []).slice(0, availableSlots);

    for (const file of selected) {
      const id = `${file.name}-${file.size}-${file.lastModified}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
      setAttachments((current) => [...current, {
        id,
        file,
        name: file.name,
        size: file.size,
        status: 'reading',
      }]);

      try {
        const extracted = await extractDocument(file);
        setAttachments((current) => current.map((attachment) => (
          attachment.id === id ? { ...attachment, ...extracted, status: 'ready' } : attachment
        )));
      } catch (error) {
        setAttachments((current) => current.map((attachment) => (
          attachment.id === id
            ? { ...attachment, status: 'error', error: error.message || 'Não foi possível ler o arquivo.' }
            : attachment
        )));
      }
    }
  }

  function removeAttachment(id) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function downloadConversation() {
    const content = messages
      .map((message) => `## ${message.role === 'user' ? 'Você' : 'Cofre IA'}\n\n${message.content}`)
      .join('\n\n---\n\n');
    downloadText(`# Conversa com o Cofre IA\n\n${content}\n`, 'cofre-ia-conversa.md');
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('O reconhecimento de voz não está disponível neste navegador.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setVoiceError('');
      setListening(true);
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) setInput(transcript);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setVoiceError(event.error === 'not-allowed'
        ? 'Permita o acesso ao microfone para usar comandos de voz.'
        : 'Não consegui entender o áudio. Tente novamente ou digite sua mensagem.');
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceError('Não foi possível iniciar o microfone. Tente novamente.');
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <section className="feature-card overflow-hidden min-h-[calc(100dvh-10.5rem)] md:min-h-[calc(100vh-4rem)] flex flex-col">
        <header className="border-b border-hairline-light px-4 py-3 md:px-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-accent text-ink-950 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base text-ink-950">Cofre IA</h1>
              <p className="text-[11px] text-ink-500 truncate">
                Assistente pessoal com contexto financeiro de {label.toLowerCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!!messages.length && (
              <button type="button" onClick={downloadConversation} className="w-9 h-9 rounded-full text-ink-500 hover:text-ink-950 hover:bg-surface-soft flex items-center justify-center transition-colors" aria-label="Baixar conversa">
                <Download className="w-4 h-4" />
              </button>
            )}
            {!!messages.length && (
              <button type="button" onClick={() => setMessages([])} className="w-9 h-9 rounded-full text-ink-500 hover:text-negative hover:bg-red-50 flex items-center justify-center transition-colors" aria-label="Limpar conversa">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={loadContext} className="w-9 h-9 rounded-full text-ink-500 hover:text-ink-950 hover:bg-surface-soft flex items-center justify-center transition-colors" disabled={loadingContext} aria-label="Atualizar contexto financeiro">
              <RefreshCw className={`w-4 h-4 ${loadingContext ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {contextError && (
          <div className="border-b border-warn/30 bg-yellow-50 px-4 py-2.5 flex items-start gap-2 text-xs text-yellow-900">
            <CircleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{contextError}</span>
          </div>
        )}

        {!!messages.length && (
          <p className="sr-only">Conversa com o Cofre IA</p>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
          {!messages.length && (
            <div className="max-w-md mx-auto h-full min-h-[300px] flex flex-col justify-center text-center">
              <Sparkles className="w-7 h-7 text-accent-dark mx-auto mb-3" />
              <h2 className="text-lg text-ink-900">Como posso ajudar?</h2>
              <p className="text-sm text-ink-500 mt-1">
                Pergunte qualquer coisa ou dê um comando. Quando fizer sentido, uso seus dados financeiros para responder melhor.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-accent text-ink-950 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div className={`max-w-[92%] md:max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'bg-ink-950 text-white'
                  : message.kind === 'error'
                    ? 'bg-red-50 border border-negative/20 text-negative'
                    : 'bg-surface-soft text-ink-800'
              }`}>
                {message.role === 'assistant'
                  ? <MessageContent content={message.content} />
                  : message.content}
                {message.role === 'assistant' && message.kind !== 'error' && (
                  <button
                    type="button"
                    onClick={() => downloadText(message.content, `${safeFilename(message.content.slice(0, 40))}.md`)}
                    className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-ink-500 hover:text-ink-950 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Baixar resposta
                  </button>
                )}
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-ink-200 text-ink-700 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <div className="w-8 h-8 rounded-full bg-accent text-ink-950 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              Pensando...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleFiles(event.dataTransfer.files);
          }}
          className="border-t border-hairline-light p-3 md:p-4 bg-white"
        >
          {!!attachments.length && (
            <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className={`rounded-xl border px-3 py-2 flex items-center gap-2 min-w-0 ${
                  attachment.status === 'error' ? 'border-negative/30 bg-red-50' : 'border-hairline-light bg-surface-soft'
                }`}>
                  {attachment.status === 'reading'
                    ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-ink-500" />
                    : <FileText className={`w-4 h-4 flex-shrink-0 ${attachment.status === 'error' ? 'text-negative' : 'text-accent-dark'}`} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-ink-800 truncate">{attachment.name}</p>
                    <p className={`text-[10px] truncate ${attachment.status === 'error' ? 'text-negative' : 'text-ink-500'}`}>
                      {attachment.status === 'reading'
                        ? 'Lendo arquivo...'
                        : attachment.status === 'error'
                          ? attachment.error
                          : `${attachment.detail} · ${formatFileSize(attachment.size)}${attachment.truncated ? ' · leitura resumida' : ''}`}
                    </p>
                  </div>
                  {attachment.status === 'ready' && (
                    <button type="button" onClick={() => downloadOriginal(attachment.file)} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-500 hover:bg-white hover:text-ink-950" aria-label={`Baixar ${attachment.name}`}>
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => removeAttachment(attachment.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-500 hover:bg-white hover:text-negative" aria-label={`Remover ${attachment.name}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5 md:gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) submit();
                }
              }}
              rows="2"
              className="input-field resize-none min-h-[56px] max-h-32"
              placeholder={listening ? 'Ouvindo...' : loadingContext ? 'Preparando seu assistente...' : 'Digite ou fale um comando...'}
              disabled={loadingContext || !context}
            />
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={toggleListening}
                className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-colors ${
                  listening ? 'bg-negative text-white animate-pulse' : 'bg-surface-soft text-ink-900 hover:bg-ink-200'
                }`}
                aria-label={listening ? 'Parar comando de voz' : 'Usar comando de voz'}
              >
                {listening ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
              </button>
              <button type="submit" className="btn-accent w-10 h-10 md:w-11 md:h-11 min-h-0 p-0" disabled={!canSend} aria-label="Enviar mensagem">
                <Send className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attachments.length >= MAX_ATTACHMENTS} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-950 disabled:opacity-40 transition-colors">
                <Paperclip className="w-3.5 h-3.5" /> Anexar documento
              </button>
              <span className="hidden sm:inline text-[10px] text-ink-400">PDF, Word, Excel, CSV ou TXT · até 8 MB</span>
            </div>
            {(voiceError || listening) && (
              <p className={`text-[11px] ${voiceError ? 'text-negative' : 'text-ink-500'}`}>
                {voiceError || 'Ouvindo seu comando...'}
              </p>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
