import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CircleAlert, Database, MessageCircle, RefreshCw, Send, Sparkles, Trash2, User, WandSparkles } from 'lucide-react';
import MonthSelector from '../components/MonthSelector';
import AiTools from '../components/AiTools';
import { cardService, dashboardService, loanService, transactionService } from '../services';
import { sendAiMessage } from '../services/ai';
import { useMonth } from '../context/MonthContext';

const STARTERS = [
  'Analise minha saúde financeira neste mês.',
  'Onde posso economizar sem comprometer o essencial?',
  'Me ajude a organizar minhas prioridades da semana.',
];

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
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part
  );
}

function MessageContent({ content }) {
  return String(content).split('\n').map((line, index) => {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    const bullet = line.match(/^[-*•]\s+(.+)/);
    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);

    if (!line.trim()) return <span key={index} className="block h-2" />;
    if (heading) return <strong key={index} className="block mt-2 mb-1 text-ink-900">{inlineContent(heading[1])}</strong>;
    if (bullet) return <span key={index} className="block pl-3 before:content-['•'] before:-ml-3 before:mr-1.5">{inlineContent(bullet[1])}</span>;
    if (numbered) return <span key={index} className="block pl-5 -indent-5">{numbered[1]}. {inlineContent(numbered[2])}</span>;
    return <span key={index} className="block">{inlineContent(line)}</span>;
  });
}

export default function AiAssistant() {
  const { month, label, startDate, endDate } = useMonth();
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState('');
  const [loadingContext, setLoadingContext] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeMode, setActiveMode] = useState('chat');
  const bottomRef = useRef(null);
  const contextRequestRef = useRef(0);

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

  const canSend = useMemo(
    () => input.trim() && context && !loadingContext && !sending,
    [input, context, loadingContext, sending]
  );

  async function submit(text = input) {
    const content = text.trim();
    if (!content || !context || sending) return;

    const nextMessages = [
      ...messages.filter((message) => message.kind !== 'error'),
      { role: 'user', content },
    ];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const answer = await sendAiMessage(nextMessages, context);
      setMessages((current) => [...current, { role: 'assistant', content: answer, kind: 'answer' }]);
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

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl">
      <MonthSelector />

      <section className="feature-card-dark overflow-hidden">
        <div className="p-5 md:p-7 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-accent text-ink-950 flex items-center justify-center flex-shrink-0">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <span className="badge-accent mb-2">Cofre IA</span>
              <h1 className="text-xl md:text-2xl">Seu assistente pessoal</h1>
              <p className="text-sm text-ink-300 mt-1">
                Converse livremente ou use automações com contexto financeiro de {label.toLowerCase()}.
              </p>
            </div>
          </div>
          <button type="button" onClick={loadContext} className="btn-soft flex-shrink-0" disabled={loadingContext}>
            <RefreshCw className={`w-4 h-4 ${loadingContext ? 'animate-spin' : ''}`} />
            Atualizar dados
          </button>
        </div>
      </section>

      <div className="feature-card p-1.5 grid grid-cols-2 gap-1.5">
        {[
          { id: 'chat', label: 'Conversa', description: 'Pergunte qualquer coisa', icon: MessageCircle },
          { id: 'tools', label: 'Ferramentas', description: 'Automatize tarefas', icon: WandSparkles },
        ].map(({ id, label: modeLabel, description, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveMode(id)}
            className={`rounded-xl px-3 py-3 text-left transition-all ${
              activeMode === id ? 'bg-ink-950 text-white shadow-soft' : 'text-ink-600 hover:bg-surface-soft'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-bold"><Icon className="w-4 h-4" /> {modeLabel}</span>
            <span className={`text-[11px] mt-0.5 block ${activeMode === id ? 'text-ink-300' : 'text-ink-500'}`}>{description}</span>
          </button>
        ))}
      </div>

      {contextError && (
        <div className="rounded-xl border border-warn/30 bg-yellow-50 px-3 py-2.5 flex items-start gap-2 text-xs text-yellow-900">
          <CircleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{contextError}</span>
        </div>
      )}

      {!loadingContext && context && (
        <p className="text-[11px] text-ink-500 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5" />
          Contexto atualizado: {context.lancamentosDoMes.length} lançamentos do mês disponíveis para análise.
        </p>
      )}

      <div className={activeMode === 'tools' ? '' : 'hidden'}>
        <AiTools financialContext={context} onDataChanged={loadContext} />
      </div>

      <section className={`feature-card overflow-hidden ${activeMode === 'chat' ? '' : 'hidden'}`}>
        {!!messages.length && (
          <div className="border-b border-hairline-light px-4 py-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-ink-500">Conversa com o Cofre IA</p>
            <button type="button" onClick={() => setMessages([])} className="text-xs text-ink-500 hover:text-negative flex items-center gap-1 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Limpar
            </button>
          </div>
        )}
        <div className="min-h-[360px] max-h-[58vh] overflow-y-auto p-4 md:p-6 space-y-4">
          {!messages.length && (
            <div className="max-w-2xl mx-auto py-8 text-center">
              <Sparkles className="w-8 h-8 text-accent-dark mx-auto mb-3" />
              <h2 className="text-lg text-ink-900">Por onde começamos?</h2>
              <p className="text-sm text-ink-500 mt-1 mb-5">
                Pergunte livremente ou escolha uma análise rápida.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    className="btn-pill-sm text-left"
                    onClick={() => submit(starter)}
                    disabled={!context || loadingContext || sending}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-accent text-ink-950 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'bg-ink-950 text-white'
                  : message.kind === 'error'
                    ? 'bg-red-50 border border-negative/20 text-negative'
                    : 'bg-surface-soft text-ink-800'
              }`}>
                {message.role === 'assistant'
                  ? <MessageContent content={message.content} />
                  : message.content}
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

        <form onSubmit={handleSubmit} className="border-t border-hairline-light p-3 md:p-4">
          <div className="flex items-end gap-2">
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
              className="input-field resize-none"
              placeholder={loadingContext ? 'Preparando seu assistente...' : 'Pergunte qualquer coisa...'}
              disabled={loadingContext || !context}
            />
            <button type="submit" className="btn-accent px-4" disabled={!canSend} aria-label="Enviar mensagem">
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-ink-400 mt-2">
            A IA pode cometer erros. Confirme decisões financeiras importantes antes de agir.
          </p>
        </form>
      </section>
    </div>
  );
}
