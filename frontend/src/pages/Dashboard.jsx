import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownCircle, ArrowUpCircle, HandCoins, ReceiptText, CreditCard, Target,
  AlertCircle, AlertTriangle, Clock, CheckCircle2, ChevronRight, Check, Loader2,
} from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { useAlerts } from '../hooks/useAlerts';
import { useTransactions } from '../hooks/useTransactions';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { CategoryChart, MonthlyChart } from '../components/Charts';
import InstallBanner from '../components/InstallBanner';
import MonthSelector from '../components/MonthSelector';
import Modal from '../components/Modal';
import MonthSummary from '../components/MonthSummary';
import TransactionForm from '../components/TransactionForm';
import CobrancaQuickForm from '../components/CobrancaQuickForm';
import { formatCurrency } from '../utils/format';

/**
 * Início — o que fazer agora, sem repetir as páginas de Receitas/Despesas:
 *   1. Acesso rápido: ações de um toque (lançar, cobrar, enviar o resumo).
 *   2. Precisa de atenção: contas vencidas/vencendo e cartões no limite
 *      (os mesmos alertas do sino), com "Pagar" direto na linha.
 *   3. Seu consumo: mês a mês e gastos por categoria do mês selecionado.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { data, refresh } = useDashboard('month');
  const { alerts, loading: alertsLoading, payExpense } = useAlerts();
  const [modal, setModal] = useState(null); // 'expense' | 'income' | 'cobranca' | 'summary'
  const [payingId, setPayingId] = useState(null);

  const firstName = (user?.name || '').split(' ')[0];
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const close = () => setModal(null);
  const saved = () => { setModal(null); refresh(); };

  async function pay(alert) {
    setPayingId(alert.id);
    try { await payExpense(alert); } finally { setPayingId(null); }
  }

  const actions = [
    { id: 'expense', icon: ArrowDownCircle, label: 'Nova despesa', hint: 'Conta, compra ou cartão', tone: 'bg-red-50 text-negative' },
    { id: 'income', icon: ArrowUpCircle, label: 'Nova receita', hint: 'Salário, venda, Pix', tone: 'bg-emerald-50 text-positive' },
    { id: 'cobranca', icon: HandCoins, label: 'Nova cobrança', hint: 'Quem está te devendo', tone: 'bg-accent/30 text-ink-900' },
    { id: 'summary', icon: ReceiptText, label: 'Enviar resumo', hint: 'O mês pronto pro WhatsApp', tone: 'bg-ink-900 text-accent' },
    { to: '/cards', icon: CreditCard, label: 'Faturas', hint: 'Limite e pagar fatura', tone: 'bg-blue-50 text-blue-600' },
    { to: '/goals', icon: Target, label: 'Guardar na meta', hint: 'Depósito e comprovante', tone: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div className="space-y-5 md:space-y-7">
      <div>
        <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">{today}</p>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mt-1 leading-tight tracking-tight">
          Olá{firstName ? `, ${firstName}` : ''}
        </h1>
      </div>

      <InstallBanner />

      {/* 1 · Acesso rápido */}
      <section data-tour="quick" className="space-y-3">
        <h2 className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">Acesso rápido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {actions.map((a) => <QuickAction key={a.id || a.to} {...a} onClick={() => setModal(a.id)} />)}
        </div>
      </section>

      {/* 2 · Precisa de atenção */}
      <section className="card-flat overflow-hidden">
        <div className="px-4 md:px-5 py-3 flex items-center justify-between gap-3 border-b border-ink-100">
          <h2 className="font-display font-bold text-base md:text-lg tracking-tight">Precisa de atenção</h2>
          {alerts.length > 5 && <span className="text-xs text-ink-500">+{alerts.length - 5} no sino</span>}
        </div>
        {alertsLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-ink-100 animate-pulse rounded-xl" />)}
          </div>
        ) : alerts.length === 0 ? (
          <p className="px-4 md:px-5 py-5 flex items-center gap-3 text-sm text-ink-600">
            <CheckCircle2 className="w-5 h-5 text-positive flex-shrink-0" />
            Tudo em dia — nenhuma conta vencida ou vencendo nos próximos dias.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {alerts.slice(0, 5).map((a) => (
              <AttentionRow key={a.id} alert={a} paying={payingId === a.id} onPay={() => pay(a)} />
            ))}
          </ul>
        )}
      </section>

      {/* 3 · Seu consumo */}
      <section className="space-y-3">
        <h2 className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">Seu consumo</h2>
        <div data-tour="month">
          <MonthSelector />
        </div>
        {data && (
          <div className={`grid grid-cols-1 gap-3 md:gap-4 items-stretch ${data.byCategory.length > 0 ? 'lg:grid-cols-2' : ''}`}>
            <MonthlyChart refreshKey={data} />
            {data.byCategory.length > 0 && <CategoryChart data={data.byCategory} />}
          </div>
        )}
      </section>

      <Modal
        isOpen={modal === 'expense' || modal === 'income'}
        onClose={close}
        title={modal === 'income' ? 'Nova receita' : 'Nova despesa'}
      >
        {(modal === 'expense' || modal === 'income') && (
          <TransactionForm key={modal} defaultType={modal} onSaved={saved} onCancel={close} />
        )}
      </Modal>
      <Modal isOpen={modal === 'cobranca'} onClose={close} title="Nova cobrança">
        {modal === 'cobranca' && <CobrancaQuickForm onSaved={saved} onCancel={close} />}
      </Modal>
      <Modal isOpen={modal === 'summary'} onClose={close} title="Resumo do mês">
        {modal === 'summary' && <MonthSummaryLoader />}
      </Modal>
    </div>
  );
}

/** Ação de um toque: abre um formulário (onClick) ou vai pra uma página (to). */
function QuickAction({ icon: Icon, label, hint, tone, to, onClick }) {
  const className = 'group card-flat p-4 min-h-[112px] flex flex-col items-start gap-3 text-left hover:shadow-soft-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200';
  const content = (
    <>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}>
        <Icon className="w-5 h-5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink-900">{label}</span>
        <span className="block text-xs text-ink-500 leading-snug">{hint}</span>
      </span>
    </>
  );
  return to
    ? <Link to={to} className={className}>{content}</Link>
    : <button type="button" onClick={onClick} className={className}>{content}</button>;
}

const SEVERITY = {
  critical: { icon: AlertCircle, tone: 'bg-red-50 text-negative' },
  warning: { icon: AlertTriangle, tone: 'bg-yellow-50 text-yellow-700' },
  info: { icon: Clock, tone: 'bg-ink-100 text-ink-600' },
};

function AttentionRow({ alert, paying, onPay }) {
  const { icon: Icon, tone } = SEVERITY[alert.severity] || SEVERITY.info;
  return (
    <li className="px-4 md:px-5 py-3 flex items-center gap-3">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900 truncate">{alert.title}</p>
        <p className="text-xs text-ink-500 truncate">{alert.message}</p>
      </div>
      {alert.amount > 0 && (
        <span className="hidden sm:block text-sm font-semibold text-ink-900 tabular-nums whitespace-nowrap">
          {formatCurrency(alert.amount)}
        </span>
      )}
      {alert.meta?.txId ? (
        <button
          onClick={onPay}
          disabled={paying}
          className="inline-flex items-center gap-1 px-3 min-h-[36px] rounded-full bg-ink-900 text-white text-xs font-bold hover:bg-ink-800 transition-colors disabled:opacity-60 flex-shrink-0"
        >
          {paying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />} Pagar
        </button>
      ) : (
        // Alertas de orçamento apontam pra "/", que agora é esta página → Despesas.
        <Link to={alert.link && alert.link !== '/' ? alert.link : '/expenses'} className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 flex-shrink-0" aria-label="Ver">
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </li>
  );
}

/** O resumo precisa dos lançamentos do mês — só busca quando o modal abre. */
function MonthSummaryLoader() {
  const { items, loading } = useTransactions({ limit: 500 });
  const { label } = useMonth();
  return <MonthSummary items={items} loading={loading} monthLabel={label} />;
}
