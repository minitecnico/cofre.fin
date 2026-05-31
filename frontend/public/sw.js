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

const CACHE_VERSION = 'cofre-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon.svg'];

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
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
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
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
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
          if (response && response.status === 200 && response.type === 'basic') {
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
