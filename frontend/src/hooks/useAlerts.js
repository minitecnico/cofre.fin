import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  detectAllAlerts,
  getDismissed,
  dismissAlert as dismissAlertStorage,
  getNotified,
  markNotified,
  showNativeNotification,
  getNotificationsEnabled,
  getSnoozed,
  snoozeAlert as snoozeAlertStorage,
  payAlertExpense,
} from '../services/alerts';

/**
 * Hook que mantém a lista de alertas atualizada.
 *
 * Recálculo:
 *   - Ao montar
 *   - Ao trocar o mês selecionado
 *   - A cada 60 segundos (pra capturar transições de "vence em 3 dias" → "hoje" → "vencida")
 *   - Quando refresh() é chamado externamente
 *
 * Notificações nativas:
 *   - Disparadas automaticamente para alertas NOVOS (que ainda não foram notificados)
 *   - Apenas alertas critical e warning disparam notificação (info é silencioso)
 *   - Cada alerta só notifica UMA vez (controlado por localStorage)
 *
 * Uso:
 *   const { alerts, visibleAlerts, criticalCount, dismiss, refresh } = useAlerts();
 */
export function useAlerts() {
  const [allAlerts, setAllAlerts] = useState([]);
  const [dismissedSet, setDismissedSet] = useState(() => getDismissed());
  const [snoozedSet, setSnoozedSet] = useState(() => new Set(Object.keys(getSnoozed())));
  const [pendingSet, setPendingSet] = useState(() => new Set()); // ações em voo (otimista)
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Alertas são GLOBAIS (independem do mês selecionado na UI).
      const list = await detectAllAlerts();
      setAllAlerts(list);
      // Re-sincroniza snooze: entradas expiradas voltam a aparecer
      setSnoozedSet(new Set(Object.keys(getSnoozed())));

      // Notificações nativas pra alertas NOVOS (não dispensados, não notificados)
      if (getNotificationsEnabled()) {
        const notified = getNotified();
        const dismissed = getDismissed();

        for (const alert of list) {
          if (alert.severity === 'info') continue;
          if (notified.has(alert.id)) continue;
          if (dismissed.has(alert.id)) continue;

          showNativeNotification(alert);
          markNotified(alert.id);
        }
      }
    } catch (err) {
      // Silencioso — alerta é feature secundária, não pode quebrar app
      console.warn('Erro ao detectar alertas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Recálculo inicial e ao trocar de mês
  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Recálculo periódico (a cada 60s) pra capturar mudanças de tempo
  useEffect(() => {
    const id = setInterval(() => { refresh(); }, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Filtra dispensados, adiados (snooze) e os que estão em ação otimista
  const visibleAlerts = useMemo(
    () => allAlerts.filter(
      (a) => !dismissedSet.has(a.id) && !snoozedSet.has(a.id) && !pendingSet.has(a.id)
    ),
    [allAlerts, dismissedSet, snoozedSet, pendingSet]
  );

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const a of visibleAlerts) c[a.severity] = (c[a.severity] || 0) + 1;
    return c;
  }, [visibleAlerts]);

  const dismiss = useCallback((alertId) => {
    dismissAlertStorage(alertId);
    setDismissedSet((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
  }, []);

  // Adia o alerta por N dias — some agora, reaparece quando o prazo expira.
  const snooze = useCallback((alertId, days = 3) => {
    snoozeAlertStorage(alertId, days);
    setSnoozedSet((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
  }, []);

  /**
   * Marca a despesa do alerta como paga (otimista).
   * Esconde o alerta na hora; reverte se o servidor falhar.
   * Retorna true em sucesso, false em falha (pra UI mostrar toast).
   */
  const payExpense = useCallback(async (alert) => {
    const txId = alert?.meta?.txId;
    if (!txId) return false;
    setPendingSet((prev) => new Set(prev).add(alert.id));
    try {
      await payAlertExpense(txId);
      await refresh(); // o alerta deixa de existir (despesa virou paga)
      return true;
    } catch (err) {
      console.warn('Falha ao marcar despesa como paga:', err);
      setPendingSet((prev) => {
        const next = new Set(prev);
        next.delete(alert.id);
        return next;
      });
      return false;
    }
  }, [refresh]);

  return {
    alerts: visibleAlerts,
    allAlerts,
    counts,
    criticalCount: counts.critical,
    warningCount: counts.warning,
    totalCount: visibleAlerts.length,
    loading,
    refresh,
    dismiss,
    snooze,
    payExpense,
  };
}
