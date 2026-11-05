/**
 * Service worker mínimo do Cofre.
 *
 * Estratégia deliberadamente conservadora para não quebrar atualizações:
 *  - Navegações (HTML): network-first com fallback ao app shell em cache.
 *    Garante que o usuário sempre receba a versão mais nova quando online,
 *    e ainda abra offline (cai no index.html cacheado).
 *  - Demais GETs same-origin (assets com hash do Vite, ícones): stale-while-revalidate.
 *    Hash no nome do arquivo já invalida cache antigo, então é seguro.
 *  - Tudo que não for GET ou for cross-origin (Supabase, Google Fonts) passa direto
 *    pela rede — nunca cacheamos chamadas de API nem respostas de terceiros.
 */

const CACHE_VERSION = 'cofre-v2';
// Arquivo recebido pelo "Compartilhar" do Android (Web Share Target).
const SHARE_CACHE = 'cofre-share';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon.svg'];

function isValidAssetResponse(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return false;

  const contentType = response.headers.get('content-type') || '';
  if (request.destination === 'script') return contentType.includes('javascript');
  if (request.destination === 'style') return contentType.includes('text/css');
  if (request.destination === 'image') return contentType.startsWith('image/');
  if (request.destination === 'manifest') return contentType.includes('json');
  return !contentType.includes('text/html');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION && k !== SHARE_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// "Compartilhar" do Android → Cofre (manifest share_target): o arquivo chega
// num POST em /compartilhar. Guarda no Cache e abre a página que decide pra
// onde ele vai (extrato do credor ou meta).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/compartilhar') return;

  event.respondWith((async () => {
    const cache = await caches.open(SHARE_CACHE);
    await cache.delete('/compartilhar/arquivo');
    try {
      const file = (await request.formData()).get('comprovante');
      if (file && typeof file !== 'string') {
        await cache.put('/compartilhar/arquivo', new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name || 'comprovante'),
          },
        }));
      }
    } catch { /* sem arquivo: a página mostra "nada pra enviar" */ }
    return Response.redirect('/compartilhar', 303);
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só lidamos com GET same-origin; o resto passa direto pela rede.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegações de página: network-first, fallback ao app shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Assets same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (isValidAssetResponse(request, response)) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Toque numa notificação (ex.: aviso de pagamento): foca uma aba do app já
// aberta e navega pra URL da notificação; sem aba aberta, abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.startsWith(self.location.origin));
      if (win) return win.focus().then(() => win.navigate(target)).catch(() => self.clients.openWindow(target));
      return self.clients.openWindow(target);
    })
  );
});

// Web Push (enviado por /api/push-notify): mostra a notificação mesmo com o
// app fechado. A `tag` é a mesma do aviso in-app, então não duplica.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Cofre', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      // Ícone da barra de status: o Android usa só o alfa — tem que ser
      // silhueta transparente, senão vira um quadrado branco.
      badge: '/icons/badge-96.png',
      data: { url: data.url || '/cobrancas' },
    })
  );
});
