import { useEffect } from 'react';
import { paymentNoticeService } from '../services/cobrancas';
import { pushService } from '../services/push';
import { showSystemNotification } from '../utils/notify';
import { formatCurrency } from '../utils/format';
import { debtorCode } from '../utils/charges';

/** Evento de janela disparado a cada aviso novo — a tela de Cobranças recarrega ao ouvir. */
export const PAYMENT_NOTICE_EVENT = 'cofre:payment-notice';

/**
 * Escuta, em qualquer tela do app, os avisos de pagamento que os devedores
 * geram no extrato público. A cada aviso novo: chama `onNotice(texto)` (toast),
 * mostra notificação do sistema (se autorizada) e avisa a tela de Cobranças.
 *
 * Sem a migration (tabela inexistente) a inscrição simplesmente não recebe nada.
 */
export function usePaymentNoticeAlerts(onNotice) {
  // Notificação já autorizada → garante a inscrição de push deste aparelho
  // (sem perguntar nada). Assim o aviso chega também com o app fechado.
  useEffect(() => {
    pushService.enable().catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = paymentNoticeService.subscribe(async (row) => {
      let notice = row;
      try { notice = (await paymentNoticeService.get(row.id)) || row; } catch { /* usa a linha crua */ }
      const who = notice.debtor
        ? `${notice.debtor.name}${notice.debtor.code ? ` ${debtorCode(notice.debtor.code)}` : ''}`
        : 'Um devedor';
      const n = notice.charge_ids?.length || 0;
      const text = `${who} gerou um PIX de ${formatCurrency(notice.amount)} (${n} parcela${n === 1 ? '' : 's'})`;

      onNotice?.(`💸 ${text} — confira em Cobranças`);
      showSystemNotification({
        title: 'Aviso de pagamento',
        body: `${text}.`,
        tag: `cofre-pagamento-${notice.id}`,
        url: '/cobrancas',
      });
      window.dispatchEvent(new CustomEvent(PAYMENT_NOTICE_EVENT, { detail: notice }));
    });
    return unsubscribe;
  }, [onNotice]);
}
