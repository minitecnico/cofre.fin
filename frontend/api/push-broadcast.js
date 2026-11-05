import webpush from 'web-push';

/**
 * POST /api/push-broadcast  { id }   (Authorization: Bearer <token do admin>)
 *
 * Manda o aviso da central do administrador como notificação pra todos os
 * aparelhos inscritos — chega com o app fechado.
 *
 *   1. confere o token no Supabase Auth e se a pessoa está em app_admins;
 *   2. carimba pushed_at ANTES de enviar (filtro pushed_at is null = só uma
 *      chamada ganha a corrida) → clicar duas vezes não manda duas vezes;
 *   3. envia; inscrição morta (404/410: app desinstalado, permissão revogada)
 *      é apagada;
 *   4. grava o resultado no aviso (enviados, falhas, removidos).
 *
 * Usa a service role (lê push_subscriptions fora do RLS) — só no servidor.
 * Env: as mesmas do /api/push-notify.
 */

const DEFAULT_VAPID_PUBLIC_KEY = 'BNy15qHq2BLrBpEmXkkdhYSqH230CWyOtbZwILPihNeeAl6bdV_aIMEB12v1firPtdT1SOaaDpL7OHJ9pxpRVYw';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function env(...names) {
  return names.map((name) => process.env[name]).find(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPrivate = env('VAPID_PRIVATE_KEY');
  if (!url || !serviceKey || !vapidPrivate) {
    return res.status(503).json({ error: 'Notificações não configuradas no servidor.' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const id = String(req.body?.id || '');
  if (!token) return res.status(401).json({ error: 'Faça login de novo.' });
  if (!UUID.test(id)) return res.status(400).json({ error: 'Aviso inválido.' });

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rest = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } })
    .then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.status === 204 ? null : r.json(); });

  let claimed = false;
  try {
    // 1. Quem chamou é admin?
    const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
    if (!who.ok) return res.status(401).json({ error: 'Sessão vencida — entre de novo.' });
    const { id: userId } = await who.json();
    const admins = await rest(`app_admins?select=user_id&user_id=eq.${userId}`);
    if (!admins.length) return res.status(403).json({ error: 'Acesso restrito ao administrador.' });

    // 2. Reivindica o envio.
    const rows = await rest(`app_announcements?id=eq.${id}&pushed_at=is.null&select=id,title,body,url`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ pushed_at: new Date().toISOString() }),
    });
    if (!rows?.length) return res.status(409).json({ error: 'Este aviso já foi enviado por notificação.' });
    const notice = rows[0];
    claimed = true;

    // 3. Envia pra todo mundo inscrito.
    const subs = await rest('push_subscriptions?select=id,endpoint,p256dh,auth');
    webpush.setVapidDetails(
      env('VAPID_SUBJECT') || 'mailto:contato@cofre.app',
      env('VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY') || DEFAULT_VAPID_PUBLIC_KEY,
      vapidPrivate,
    );
    const payload = JSON.stringify({
      title: notice.title,
      body: notice.body || '',
      tag: `cofre-aviso-${notice.id}`,
      url: notice.url || '/',
    });

    claimed = false; // daqui em diante cada envio trata o próprio erro — não há o que desfazer
    let sent = 0;
    let failed = 0;
    let removed = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          removed += 1;
          await rest(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
        } else {
          failed += 1;
          console.error('push failed', err?.statusCode, err?.body || err?.message);
        }
      }
    }));

    // 4. Resultado fica no aviso (a central mostra).
    await rest(`app_announcements?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ push_sent: sent, push_failed: failed, push_removed: removed }),
    }).catch((err) => console.error('push-broadcast result', err?.message));

    return res.status(200).json({ sent, failed, removed });
  } catch (error) {
    console.error('push-broadcast error', error?.message || error);
    // Falhou antes de enviar a qualquer aparelho: libera pra tentar de novo.
    if (claimed) await rest(`app_announcements?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ pushed_at: null }) }).catch(() => {});
    return res.status(500).json({ error: 'Falha ao enviar a notificação.' });
  }
}
