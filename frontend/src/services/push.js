import { supabase } from './supabase';
import { currentUserId } from './index';
import { VAPID_PUBLIC_KEY } from '../constants';

/**
 * Web Push: inscreve ESTE aparelho pra receber notificação com o app fechado.
 * O envio é feito por /api/push-notify (servidor). No APK (WebView) e em
 * navegadores sem PushManager não há suporte — o aviso continua no app.
 */
export const pushService = {
  supported() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
      && typeof Notification !== 'undefined';
  },

  /**
   * Garante a inscrição deste aparelho e grava no banco. Só pede permissão se
   * `prompt` = true; sem permissão concedida, não faz nada.
   * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
   */
  async enable({ prompt = false } = {}) {
    if (!this.supported()) return 'unsupported';
    let perm = Notification.permission;
    if (perm === 'default' && prompt) perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    const userId = await currentUserId();
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return 'granted';
  },
};

/** Avisa o servidor pra mandar o push do aviso recém-criado (chamado pelo extrato). */
export function requestPaymentPush(code) {
  return fetch('/api/push-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    keepalive: true, // conclui mesmo se o devedor sair da página (abrir o app do banco)
  }).catch(() => {});
}

function base64UrlToUint8Array(base64Url) {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}
