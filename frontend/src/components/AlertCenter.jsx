import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, X, AlertCircle, AlertTriangle, Clock,
  CreditCard, TrendingDown, Calendar, CheckCircle2, BellRing,
  Check, AlarmClock, ChevronRight, Loader2,
} from 'lucide-react';
import { useAlerts } from '../hooks/useAlerts';
import {
  getNotificationPermission,
  requestNotificationPermission,
  getNotificationsEnabled,
  setNotificationsEnabled,
} from '../services/alerts';
import { formatCurrency } from '../utils/format';

/**
 * AlertCenter — sino de notificações com painel.
 *
 * Variantes:
 *   - "compact" (default): só o botão sino. O painel abre como dropdown
 *   - "icon-only": só o ícone (pra header mobile com pouco espaço)
 *
 * Uso:
 *   <AlertCenter />              // dropdown (header desktop)
 *   <AlertCenter variant="..."/> // outras variantes
 */
export default function AlertCenter({ variant = 'compact', onCloseSidebar }) {
  const { alerts, counts, criticalCount, totalCount, loading, dismiss, snooze, payExpense } = useAlerts();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();

  // Fecha painel ao clicar fora
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Fecha com ESC
  useEffect(() => {
    if (!open) return;
    function handleEsc(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  const hasAlerts = totalCount > 0;
  const showCriticalBadge = criticalCount > 0;

  function handleAlertClick(alert) {
    setOpen(false);
    if (onCloseSidebar) onCloseSidebar();
    if (alert.link) navigate(alert.link);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
          variant === 'sidebar'
            ? 'text-ink-50 hover:bg-white/10'
            : 'text-ink-700 hover:text-ink-900 hover:bg-ink-100'
        }`}
        title={hasAlerts ? `${totalCount} ${totalCount === 1 ? 'alerta' : 'alertas'}` : 'Sem alertas'}
        aria-label="Notificações"
      >
        {hasAlerts ? (
          <BellRing className="w-5 h-5" strokeWidth={2.25} />
        ) : (
          <Bell className="w-5 h-5" strokeWidth={2} />
        )}

        {/* Badge */}
        {hasAlerts && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
              showCriticalBadge
                ? 'bg-negative text-white shadow-soft'
                : 'bg-warn text-ink-900 shadow-soft'
            }`}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {/* Painel — desktop: dropdown ancorado / mobile: sheet inferior */}
      {open && (
        <>
          {/* Backdrop só no mobile */}
          <div
            className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/*
            Posicionamento:
              MOBILE: fixed na base da tela ACIMA da BottomNav (que tem ~64px)
                      Por isso bottom-16 — deixa a navegação inferior visível
              DESKTOP: fixed ancorado no canto superior direito da viewport
                      independente de onde o sino esteja
          */}
          <div
            ref={panelRef}
            className="
              fixed left-0 right-0 bottom-16 max-h-[75vh] rounded-3xl mx-2
              md:fixed md:left-auto md:right-4 md:bottom-auto md:top-16 md:rounded-2xl md:w-[400px] md:max-h-[600px] md:mx-0
              bg-white shadow-soft-lg border border-ink-200
              z-50 flex flex-col animate-fade-in overflow-hidden
            "
            role="dialog"
            aria-label="Notificações"
          >
            {/* Header do painel */}
            <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0">
                <h3 className="font-display text-lg font-bold tracking-tight">Notificações</h3>
                {hasAlerts && (
                  <p className="text-xs text-ink-500 mt-0.5">
                    {counts.critical > 0 && (
                      <span className="text-negative font-bold">
                        {counts.critical} {counts.critical === 1 ? 'crítica' : 'críticas'}
                      </span>
                    )}
                    {counts.critical > 0 && (counts.warning + counts.info) > 0 && <span> · </span>}
                    {counts.warning > 0 && (
                      <span className="text-yellow-700 font-bold">
                        {counts.warning} {counts.warning === 1 ? 'aviso' : 'avisos'}
                      </span>
                    )}
                    {counts.warning > 0 && counts.info > 0 && <span> · </span>}
                    {counts.info > 0 && (
                      <span className="text-ink-600 font-bold">
                        {counts.info} {counts.info === 1 ? 'aviso' : 'avisos'}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Banner de notificações nativas (só se ainda não autorizou) */}
            <NotificationOptIn />

            {/* Lista de alertas (rolável) */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center text-sm text-ink-500">Carregando…</div>
              ) : !hasAlerts ? (
                <EmptyState />
              ) : (
                <div className="divide-y divide-ink-100">
                  {alerts.map((alert) => (
                    <AlertItem
                      key={alert.id}
                      alert={alert}
                      onClick={() => handleAlertClick(alert)}
                      onDismiss={() => dismiss(alert.id)}
                      onSnooze={() => snooze(alert.id, 3)}
                      onPay={() => payExpense(alert)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Item individual de alerta.
 */
function AlertItem({ alert, onClick, onDismiss, onSnooze, onPay }) {
  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
  const Icon = KIND_ICONS[alert.kind] || config.icon;

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(false);

  // Só despesas com transação associada podem ser pagas direto do alerta.
  const canPay = Boolean(alert.meta?.txId);

  async function handlePay(e) {
    e.stopPropagation();
    setError(false);
    setPaying(true);
    const ok = await onPay();
    // Em sucesso o alerta some (refresh), então nem chega a re-renderizar.
    if (!ok) {
      setPaying(false);
      setError(true);
    }
  }

  return (
    <div className={`p-3 hover:bg-ink-50/60 transition-colors group relative ${config.bgClass}`}>
      <button
        onClick={onClick}
        className="w-full text-left flex items-start gap-3 pr-8"
      >
        <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${config.iconBg}`}>
          <Icon className={`w-4 h-4 ${config.iconColor}`} strokeWidth={2.25} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className={`font-bold text-sm ${config.titleColor}`}>{alert.title}</p>
            {alert.amount != null && (
              <span className="font-mono font-bold text-xs text-negative whitespace-nowrap">
                {formatCurrency(alert.amount)}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-600 mt-0.5 line-clamp-2">{alert.message}</p>
        </div>
      </button>

      {/* Ações inline — agir sem sair do painel */}
      <div className="flex items-center gap-1.5 mt-2 pl-12 flex-wrap">
        {canPay && (
          <button
            onClick={handlePay}
            disabled={paying}
            className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-lg bg-positive/10 text-positive font-bold text-xs hover:bg-positive/20 transition-colors disabled:opacity-60"
          >
            {paying
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
            Pagar
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onSnooze(); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-lg bg-ink-100 text-ink-700 font-bold text-xs hover:bg-ink-200 transition-colors"
        >
          <AlarmClock className="w-3.5 h-3.5" strokeWidth={2.25} />
          Adiar 3d
        </button>
        {alert.link && (
          <button
            onClick={onClick}
            className="inline-flex items-center gap-0.5 px-2.5 py-1 min-h-[32px] rounded-lg text-ink-600 font-bold text-xs hover:bg-ink-100 transition-colors"
          >
            Ver
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.25} />
          </button>
        )}
        {error && (
          <span className="text-xs text-negative font-medium">Falhou — tente de novo</span>
        )}
      </div>

      {/* Botão dispensar */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="absolute top-3 right-2 w-7 h-7 rounded-lg text-ink-400 hover:text-ink-900 hover:bg-ink-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all md:opacity-60"
        title="Dispensar"
        aria-label="Dispensar alerta"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * Empty state quando não há alertas.
 */
function EmptyState() {
  return (
    <div className="p-8 text-center">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-positive/10 flex items-center justify-center">
        <CheckCircle2 className="w-7 h-7 text-positive" strokeWidth={2.25} />
      </div>
      <p className="font-display font-bold text-base text-ink-900">Tudo tranquilo</p>
      <p className="text-xs text-ink-500 mt-1">Nenhum alerta no momento.</p>
    </div>
  );
}

/**
 * Banner que aparece no topo do painel pedindo permissão de notificação.
 * Só aparece se: API existe, permissão não é 'granted' nem 'denied' fixo, e usuário ainda não dismissou.
 */
function NotificationOptIn() {
  const [perm, setPerm] = useState(() => getNotificationPermission());
  const [enabled, setEnabled] = useState(() => getNotificationsEnabled());
  const [hidden, setHidden] = useState(false);

  // Não mostra se: api inexistente, já habilitado, ou usuário fechou
  if (perm === 'unsupported') return null;
  if (enabled) return null;
  if (hidden) return null;

  // Permissão BLOQUEADA → mostra banner orientando o usuário a desbloquear no navegador
  if (perm === 'denied') {
    return (
      <div className="px-4 py-3 bg-yellow-50 border-b border-warn/40">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-warn/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BellOff className="w-4 h-4 text-yellow-800" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm text-yellow-900">Notificações bloqueadas</p>
            <p className="text-xs text-yellow-800 mt-0.5 leading-snug">
              Pra reativar, clique no cadeado 🔒 ao lado do endereço do site,
              vá em "Notificações" e mude para "Permitir".
            </p>
          </div>
          <button
            onClick={() => setHidden(true)}
            className="w-6 h-6 rounded-md hover:bg-yellow-200 flex items-center justify-center text-yellow-900 flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  async function activate() {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === 'granted') {
      setEnabled(true);
    }
  }

  function disable() {
    setNotificationsEnabled(false);
    setEnabled(false);
    setHidden(true);
  }

  return (
    <div className="px-4 py-3 bg-gradient-accent border-b border-ink-200/50">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-ink-900/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <BellRing className="w-4 h-4 text-ink-900" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-ink-900">Quer ser avisado pelo navegador?</p>
          <p className="text-xs text-ink-800 mt-0.5">
            Receba um popup quando tiver despesa vencendo ou cartão no limite.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={activate}
              className="px-3 py-1.5 bg-ink-900 text-white text-xs font-bold rounded-lg hover:bg-ink-800 transition-colors"
            >
              Ativar
            </button>
            <button
              onClick={disable}
              className="px-3 py-1.5 text-ink-700 hover:text-ink-900 text-xs font-bold transition-colors"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          onClick={() => setHidden(true)}
          className="w-6 h-6 rounded-md hover:bg-ink-900/10 flex items-center justify-center text-ink-700 flex-shrink-0"
          aria-label="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Configurações visuais por severidade e tipo
// ─────────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    iconColor: 'text-negative',
    iconBg: 'bg-red-100',
    titleColor: 'text-ink-900',
    bgClass: 'bg-red-50/30',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-warn',
    iconBg: 'bg-yellow-100',
    titleColor: 'text-ink-900',
    bgClass: 'bg-yellow-50/30',
  },
  info: {
    icon: Clock,
    iconColor: 'text-ink-700',
    iconBg: 'bg-ink-100',
    titleColor: 'text-ink-900',
    bgClass: '',
  },
};

const KIND_ICONS = {
  overdue: AlertCircle,
  due_today: Clock,
  due_soon: Calendar,
  card_high_usage: CreditCard,
  card_closing: Calendar,
  over_budget: TrendingDown,
  negative_balance: AlertCircle,
};
