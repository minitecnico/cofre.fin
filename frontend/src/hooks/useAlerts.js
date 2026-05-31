import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  detectAllAlerts,
  getDismissed,
  dismissAlert as dismissAlertStorage,
  getNotified,
  markNotified,
  showNativeNotification,
  getNotificationsEnabled,
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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Alertas são GLOBAIS (independem do mês selecionado na UI).
      const list = await detectAllAlerts();
      setAllAlerts(list);

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

  // Filtra dispensados (na sessão atual)
  const visibleAlerts = useMemo(
    () => allAlerts.filter((a) => !dismissedSet.has(a.id)),
    [allAlerts, dismissedSet]
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
  };
}
