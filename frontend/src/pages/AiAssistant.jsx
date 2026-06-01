import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, RefreshCw, Send, Sparkles, User } from 'lucide-react';
import MonthSelector from '../components/MonthSelector';
import { cardService, dashboardService, loanService, transactionService } from '../services';
import { sendAiMessage } from '../services/ai';
import { useMonth } from '../context/MonthContext';

const STARTERS = [
  'Analise minha saúde financeira neste mês.',
  'Onde posso economizar sem comprometer o essencial?',
  'Quais despesas merecem minha atenção primeiro?',
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

export default function AiAssistant() {
  const { month, label, startDate, endDate } = useMonth();
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState('');
  const [loadingContext, setLoadingContext] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  async function loadContext() {
    setLoadingContext(true);
    setContextError('');

    try {
      const [summary, transactions, cards, forecast, loans] = await Promise.all([
        dashboardService.summary('month', month),
        transactionService.list({ startDate, endDate, limit: 300 }),
        cardService.list(),
        dashboardService.forecast(3),
        loanService.list(),
      ]);

      setContext({
        mesAnalisado: label,
        resumo: summary,
        lancamentosDoMes: summarizeTransactions(transactions.transactions),
        cartoes: cards.map(({ card, ...details }) => ({ nome: card.name, ...details })),
        projecao: forecast,
        emprestimosVigentes: loans.map(({ parcels, ...loan }) => loan),
      });
    } catch (error) {
      setContextError(error.message || 'Não foi possível carregar seus dados financeiros.');
    } finally {
      setLoadingContext(false);
    }
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

    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const answer = await sendAiMessage(nextMessages, context);
      setMessages((current) => [...current, { role: 'assistant', content: answer }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: error.message || 'Não consegui responder agora.' },
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
              <span className="badge-accent mb-2">Assistente IA</span>
              <h1 className="text-xl md:text-2xl">Converse sobre suas finanças</h1>
              <p className="text-sm text-ink-300 mt-1">
                A IA analisa os dados de {label.toLowerCase()} e ajuda a encontrar próximos passos.
              </p>
            </div>
          </div>
          <button type="button" onClick={loadContext} className="btn-soft flex-shrink-0" disabled={loadingContext}>
            <RefreshCw className={`w-4 h-4 ${loadingContext ? 'animate-spin' : ''}`} />
            Atualizar análise
          </button>
        </div>
      </section>

      <section className="feature-card overflow-hidden">
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
                message.role === 'user' ? 'bg-ink-950 text-white' : 'bg-surface-soft text-ink-800'
              }`}>
                {message.content}
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
              Analisando seus dados...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t border-hairline-light p-3 md:p-4">
          {contextError && <p className="text-sm text-negative mb-3">{contextError}</p>}
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
              placeholder={loadingContext ? 'Carregando seus dados...' : 'Pergunte algo sobre suas finanças...'}
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
