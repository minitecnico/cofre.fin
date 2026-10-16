import webpush from 'web-push';

/**
 * POST /api/push-notify  { code }
 *
 * Chamado pelo extrato público logo depois que o devedor gera o PIX (a RPC
 * notify_payment já gravou o aviso). Envia Web Push pros aparelhos do credor —
 * funciona com o app FECHADO.
 *
 * Não confia em nada do corpo além do código do extrato:
 *   1. acha o devedor pelo share_code;
 *   2. pega o aviso PENDENTE mais recente dele, de até 2 min, ainda não enviado;
 *   3. carimba pushed_at ANTES de enviar (filtro pushed_at is null = só uma
 *      chamada ganha a corrida) → repetir a chamada não reenvia nem gera spam;
 *   4. envia pra todas as inscrições do credor; remove as expiradas (404/410).
 *
 * Usa a service role (lê push_subscriptions fora do RLS) — só no servidor.
 * Env: SUPABASE_URL|VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      VAPID_PUBLIC_KEY|VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */

const DEFAULT_VAPID_PUBLIC_KEY = 'BNy15qHq2BLrBpEmXkkdhYSqH230CWyOtbZwILPihNeeAl6bdV_aIMEB12v1firPtdT1SOaaDpL7OHJ9pxpRVYw';

function env(...names) {
  return names.map((name) => process.env[name]).find(Boolean);
}

function brl(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
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
    // Push não configurado: o aviso continua aparecendo no app (Realtime).
    return res.status(200).json({ sent: 0, reason: 'not-configured' });
  }

  const code = String(req.body?.code || '');
  if (code.length < 16 || code.length > 64) return res.status(400).json({ error: 'Código inválido.' });

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rest = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } })
    .then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.status === 204 ? null : r.json(); });

  try {
    const [debtor] = await rest(`debtors?select=id,user_id,name,code&share_code=eq.${encodeURIComponent(code)}&limit=1`);
    if (!debtor) return res.status(200).json({ sent: 0 });

    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const [notice] = await rest(
      `payment_notices?select=id&debtor_id=eq.${debtor.id}&status=eq.pending&pushed_at=is.null`
      + `&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`
    );
    if (!notice) return res.status(200).json({ sent: 0 });

    // Reivindica o envio (só a primeira chamada passa no filtro pushed_at is null).
    const claimed = await rest(`payment_notices?id=eq.${notice.id}&pushed_at=is.null`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ pushed_at: new Date().toISOString() }),
    });
    if (!claimed?.length) return res.status(200).json({ sent: 0 });
    const { amount, charge_ids: chargeIds } = claimed[0];

    const subs = await rest(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${debtor.user_id}`);
    if (!subs.length) return res.status(200).json({ sent: 0 });

    webpush.setVapidDetails(
      env('VAPID_SUBJECT') || 'mailto:contato@cofre.app',
      env('VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY') || DEFAULT_VAPID_PUBLIC_KEY,
      vapidPrivate,
    );

    const n = chargeIds?.length || 0;
    const who = `${debtor.name}${debtor.code ? ` #${String(debtor.code).padStart(3, '0')}` : ''}`;
    const payload = JSON.stringify({
      title: 'Aviso de pagamento',
      body: `${who} gerou um PIX de ${brl(amount)} (${n} parcela${n === 1 ? '' : 's'}).`,
      tag: `cofre-pagamento-${notice.id}`, // mesma tag do aviso in-app → não duplica
      url: '/cobrancas',
    });

    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent += 1;
      } catch (err) {
        // Inscrição morta (app desinstalado, permissão revogada) → apaga.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await rest(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
        } else {
          console.error('push failed', err?.statusCode, err?.body || err?.message);
        }
      }
    }));

    return res.status(200).json({ sent });
  } catch (error) {
    console.error('push-notify error', error?.message || error);
    return res.status(500).json({ error: 'Falha ao enviar a notificação.' });
  }
}
