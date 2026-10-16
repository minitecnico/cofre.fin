/**
 * Notificação do sistema (fora da página), quando o usuário já autorizou.
 *
 * No Chrome do Android `new Notification()` lança erro — lá só funciona via
 * service worker (`registration.showNotification`). Tenta o SW primeiro e cai
 * no construtor no desktop/sem SW. Falha silenciosa: notificação é bônus, a UI
 * do app continua mostrando o aviso.
 *
 * @param {{ title: string, body: string, tag?: string, url?: string }} opts
 *        `url` = pra onde o toque na notificação leva (tratado no sw.js).
 */
export async function showSystemNotification({ title, body, tag, url = '/' }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const options = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', data: { url } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, options); return; }
  } catch { /* cai no construtor */ }
  try { new Notification(title, options); } catch { /* sem suporte */ }
}
