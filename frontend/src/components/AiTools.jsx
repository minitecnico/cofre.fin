import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Lightbulb, Loader2, Mic, MicOff, Search, Sparkles, Target,
  TrendingUp, WalletCards, WandSparkles,
} from 'lucide-react';
import { cardService, categoryService, transactionService } from '../services';
import { goalService } from '../services/goals';
import { requestAiTask } from '../services/ai';
import { formatCurrency } from '../utils/format';

const TOOL_TABS = [
  { id: 'insights', label: 'Diagnóstico', description: 'Entenda seu mês', icon: Sparkles },
  { id: 'transaction', label: 'Novo lançamento', description: 'Digite ou fale uma movimentação', icon: WalletCards },
  { id: 'search', label: 'Busca inteligente', description: 'Encontre movimentações', icon: Search },
  { id: 'goal', label: 'Criar meta', description: 'Planeje um objetivo', icon: Target },
];

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function findNamed(items, name) {
  const expected = normalize(name);
  return items.find((item) => normalize(item.name) === expected) || null;
}

function ToolError({ message }) {
  if (!message) return null;
  return <p className="text-sm text-negative">{message}</p>;
}

function ToolButton({ children, busy, ...props }) {
  return (
    <button type="button" className="btn-accent disabled:opacity-60" disabled={busy} {...props}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
      {children}
    </button>
  );
}

export default function AiTools({ financialContext, onDataChanged }) {
  const [active, setActive] = useState('insights');
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    setCatalogLoading(true);
    Promise.all([categoryService.list(), cardService.list()])
      .then(([categoryItems, cardItems]) => {
        setCategories(categoryItems);
        setCards(cardItems.map(({ card }) => card));
        setCatalogError('');
      })
      .catch(() => {
        setCategories([]);
        setCards([]);
        setCatalogError('Não foi possível carregar categorias e cartões. Atualize a página antes de criar lançamentos.');
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  const taskContext = useMemo(() => ({
    hoje: new Date().toISOString().slice(0, 10),
    categoriasDisponiveis: categories.map(({ id, name, type }) => ({ id, name, type })),
    cartoesDisponiveis: cards.map(({ id, name }) => ({ id, name })),
    contextoFinanceiro: financialContext,
  }), [cards, categories, financialContext]);

  return (
    <section className="feature-card overflow-hidden">
      <div className="p-4 md:p-5 border-b border-hairline-light">
        <div className="flex items-center gap-2 mb-3">
          <WandSparkles className="w-5 h-5 text-accent-dark" />
          <div>
            <h2 className="font-display text-lg">Ferramentas inteligentes</h2>
            <p className="text-xs text-ink-500">A IA prepara; você revisa antes de salvar.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {TOOL_TABS.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`rounded-xl px-3 py-3 text-left border transition-all ${
                active === id
                  ? 'bg-ink-950 border-ink-950 text-white shadow-soft'
                  : 'bg-white border-hairline-light text-ink-700 hover:bg-surface-soft'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-bold"><Icon className="w-4 h-4" /> {label}</span>
              <span className={`text-[11px] mt-0.5 block ${active === id ? 'text-ink-300' : 'text-ink-500'}`}>{description}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 md:p-5">
        {active === 'transaction' && catalogError && <ToolError message={catalogError} />}
        {active === 'insights' && <InsightsTool context={taskContext} />}
        {active === 'transaction' && (
          <TransactionTool context={taskContext} categories={categories} cards={cards} catalogLoading={catalogLoading} onSaved={onDataChanged} />
        )}
        {active === 'search' && <SearchTool context={taskContext} />}
        {active === 'goal' && <GoalTool context={taskContext} />}
      </div>
    </section>
  );
}

function InsightsTool({ context }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true);
    setError('');
    try {
      setData(await requestAiTask('monthly_insights', '', context));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">Receba um panorama do mês com riscos, oportunidades e próximos passos.</p>
      <ToolButton busy={busy} onClick={generate}>{data ? 'Atualizar diagnóstico' : 'Gerar diagnóstico'}</ToolButton>
      <ToolError message={error} />
      {data && (
        <div className="space-y-3">
          <p className="rounded-xl bg-surface-soft p-3 text-sm text-ink-800">{data.summary}</p>
          <InsightList title="Destaques" items={data.highlights} icon={TrendingUp} />
          <InsightList title="Atenção" items={data.warnings} icon={AlertTriangle} />
          <InsightList title="Oportunidades" items={data.opportunities} icon={Lightbulb} />
          <InsightList title="Próximos passos" items={data.nextSteps} icon={Check} />
        </div>
      )}
    </div>
  );
}

function InsightList({ title, items = [], icon: Icon }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest text-ink-500 font-bold flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
      <ul className="mt-1.5 space-y-1 text-sm text-ink-700">
        {items.map((item, index) => <li key={index}>• {item}</li>)}
      </ul>
    </div>
  );
}

function TransactionTool({ context, categories, cards, catalogLoading, onSaved }) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const speechSupported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const category = preview ? findNamed(categories, preview.categoryName) : null;
  const card = preview ? findNamed(cards, preview.cardName) : null;
  const valid = preview && preview.amount > 0 && preview.description && preview.date && category
    && (Number(preview.installments) <= 1 || card);

  async function interpret() {
    if (!input.trim()) return;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      setPreview(await requestAiTask('transaction_parse', input, context));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!valid) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        type: preview.type === 'income' ? 'income' : 'expense',
        description: preview.description,
        category_id: category.id,
        credit_card_id: card?.id || null,
      };
      if (Number(preview.installments) > 1 && card) {
        await transactionService.createInstallments({
          ...payload,
          totalAmount: Number(preview.amount),
          installmentCount: Number(preview.installments),
          startDate: preview.date,
        });
      } else {
        const created = await transactionService.create({ ...payload, amount: Number(preview.amount), date: preview.date });
        if (preview.paid && created?.id) await transactionService.togglePaid(created.id, true);
      }
      setInput('');
      setPreview(null);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Seu navegador não oferece reconhecimento de voz. Digite o lançamento normalmente.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setError('');
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
      setError(event.error === 'not-allowed'
        ? 'Permita o acesso ao microfone para lançar por voz.'
        : 'Não consegui entender o áudio. Tente novamente ou digite o lançamento.');
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600">Ex.: “gastei 89 reais no mercado hoje” ou “recebi 2500 de freela ontem”. Digite ou use o microfone.</p>
      <div className="flex items-end gap-2">
        <textarea className="input-field resize-none" rows="2" value={input} onChange={(event) => setInput(event.target.value)} placeholder={listening ? 'Ouvindo...' : 'Descreva o lançamento...'} />
        <button
          type="button"
          onClick={toggleListening}
          className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center transition-all ${
            listening ? 'bg-negative text-white animate-pulse' : 'bg-surface-soft text-ink-900 hover:bg-ink-200'
          }`}
          aria-label={listening ? 'Parar reconhecimento de voz' : 'Lançar por voz'}
          title={speechSupported ? 'Lançar por voz' : 'Reconhecimento de voz indisponível neste navegador'}
        >
          {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
      </div>
      {listening && <p className="text-xs text-negative font-semibold">Ouvindo... fale o lançamento e aguarde a transcrição.</p>}
      <ToolButton busy={busy || catalogLoading} onClick={interpret}>
        {catalogLoading ? 'Carregando categorias...' : 'Interpretar lançamento'}
      </ToolButton>
      <ToolError message={error} />
      {preview && (
        <div className="rounded-xl border border-hairline-light bg-surface-soft p-4 space-y-2 text-sm">
          <p className="font-bold">Confira antes de salvar</p>
          <p>{preview.type === 'income' ? 'Receita' : 'Despesa'} de <strong>{formatCurrency(preview.amount)}</strong> em {preview.date}</p>
          <p>{preview.description} • {category?.name || <span className="text-negative">categoria não reconhecida</span>}</p>
          {preview.cardName && <p>Cartão: {card?.name || <span className="text-negative">{preview.cardName} não encontrado</span>}</p>}
          {Number(preview.installments) > 1 && <p>Parcelamento: {preview.installments}x</p>}
          <button type="button" className="btn-primary mt-2 disabled:opacity-60" disabled={!valid || saving} onClick={confirm}>
            {saving ? 'Salvando...' : 'Confirmar e salvar'}
          </button>
        </div>
      )}
    </div>
  );
}

function SearchTool({ context }) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const transactions = context.contextoFinanceiro?.lancamentosDoMes || [];

  async function search() {
    if (!input.trim()) return;
    setBusy(true);
    setError('');
    try {
      const filters = await requestAiTask('search_filters', input, context);
      const terms = (filters.terms || []).map(normalize);
      setResults(transactions.filter((transaction) => {
        const text = normalize(`${transaction.descricao} ${transaction.categoria} ${transaction.cartao || ''}`);
        if (terms.length && !terms.every((term) => text.includes(term))) return false;
        if (filters.type && transaction.tipo !== (filters.type === 'income' ? 'receita' : 'despesa')) return false;
        if (filters.paid != null && transaction.pago !== filters.paid) return false;
        if (filters.categoryName && !normalize(transaction.categoria).includes(normalize(filters.categoryName))) return false;
        if (filters.cardName && !normalize(transaction.cartao).includes(normalize(filters.cardName))) return false;
        if (filters.minAmount != null && transaction.valor < Number(filters.minAmount)) return false;
        if (filters.maxAmount != null && transaction.valor > Number(filters.maxAmount)) return false;
        if (filters.startDate && transaction.data < filters.startDate) return false;
        if (filters.endDate && transaction.data > filters.endDate) return false;
        return true;
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600">Ex.: “despesas pendentes de mercado acima de 100 reais”.</p>
      <input className="input-field" value={input} onChange={(event) => setInput(event.target.value)} placeholder="O que você quer encontrar?" />
      <ToolButton busy={busy} onClick={search}>Buscar lançamentos</ToolButton>
      <ToolError message={error} />
      {results && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest font-bold text-ink-500">{results.length} resultado(s)</p>
          {results.slice(0, 30).map((transaction, index) => (
            <div key={`${transaction.data}-${index}`} className="rounded-xl bg-surface-soft px-3 py-2 flex justify-between gap-3 text-sm">
              <span>{transaction.descricao}<small className="block text-ink-500">{transaction.data} • {transaction.categoria}</small></span>
              <strong className={transaction.tipo === 'receita' ? 'text-positive' : 'text-negative'}>{formatCurrency(transaction.valor)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalTool({ context }) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function interpret() {
    if (!input.trim()) return;
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      setPreview(await requestAiTask('goal_parse', input, context));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await goalService.create(preview);
      setInput('');
      setPreview(null);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600">Ex.: “quero guardar 10 mil reais para uma viagem até dezembro”.</p>
      <textarea className="input-field resize-none" rows="2" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Descreva sua meta..." />
      <ToolButton busy={busy} onClick={interpret}>Preparar meta</ToolButton>
      <ToolError message={error} />
      {saved && <p className="text-sm text-positive font-semibold">Meta criada com sucesso.</p>}
      {preview && (
        <div className="rounded-xl border border-hairline-light bg-surface-soft p-4 space-y-2 text-sm">
          <p className="font-bold">{preview.title}</p>
          <p>Objetivo: <strong>{formatCurrency(preview.target_amount)}</strong>{preview.deadline ? ` até ${preview.deadline}` : ''}</p>
          {preview.description && <p className="text-ink-600">{preview.description}</p>}
          <button type="button" className="btn-primary mt-2 disabled:opacity-60" disabled={busy || !(preview.target_amount > 0)} onClick={confirm}>
            Confirmar e criar meta
          </button>
        </div>
      )}
    </div>
  );
}
