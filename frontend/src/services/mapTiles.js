/**
 * Mapa offline de Viagens — tiles do OpenStreetMap guardados no aparelho
 * (Cache Storage, sobrevive a fechar o app).
 *
 * Todo tile que aparece na tela fica salvo; "Salvar esta área" baixa de uma
 * vez a região visível. Sem internet, o mapa mostra o que estiver salvo.
 *
 * Limites da política de uso do tile.openstreetmap.org: download em lote só
 * até o zoom 16 e com no máximo 2 conexões ao mesmo tempo. O que a pessoa
 * olhar com mais zoom também fica salvo (aí é cache normal, permitido).
 *
 * O SW (public/sw.js) não apaga este cache ao atualizar — mantenha o nome igual.
 */

const CACHE = 'cofre-map-tiles';
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
export const OFFLINE_MAX_ZOOM = 16;
export const OFFLINE_MAX_TILES = 3000;

const tileUrl = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Sem HTTPS (ex.: dev pela rede local) não existe Cache Storage: só não salva.
const openCache = () => ('caches' in window ? caches.open(CACHE) : Promise.resolve(null));

async function fetchTile(url) {
  // A página manda Referrer-Policy same-origin; o OSM exige saber a origem.
  const res = await fetch(url, { referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!res.ok) throw new Error(`Tile ${res.status}`);
  return res;
}

/** Tile como Blob: do aparelho se já salvo; senão baixa e guarda. */
export async function getTileBlob(url) {
  const cache = await openCache();
  const hit = await cache?.match(url);
  if (hit) return hit.blob();
  const res = await fetchTile(url);
  cache?.put(url, res.clone()).catch(() => {}); // sem espaço: segue sem salvar
  return res.blob();
}

// Coordenadas de tile (esquema "slippy map" do OSM).
const lngToX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
function latToY(lat, z) {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

function ranges(bounds, fromZoom) {
  const list = [];
  for (let z = fromZoom; z <= OFFLINE_MAX_ZOOM; z++) {
    const max = 2 ** z - 1;
    const clamp = (n) => Math.max(0, Math.min(max, n));
    list.push({
      z,
      x0: clamp(lngToX(bounds.getWest(), z)), x1: clamp(lngToX(bounds.getEast(), z)),
      y0: clamp(latToY(bounds.getNorth(), z)), y1: clamp(latToY(bounds.getSouth(), z)),
    });
  }
  return list;
}

/**
 * Quantos tiles a área visível (LatLngBounds do Leaflet) precisa, do zoom
 * `fromZoom` até OFFLINE_MAX_ZOOM. Conta sem montar a lista — área grande
 * daria milhões de itens.
 */
export function countAreaTiles(bounds, fromZoom) {
  return ranges(bounds, fromZoom).reduce((sum, r) => sum + (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), 0);
}

/**
 * Baixa a área pro aparelho. Pula o que já está salvo; tile que falhar não
 * interrompe o resto. Retorna quantos falharam.
 */
export async function saveArea(bounds, fromZoom, { onProgress, signal } = {}) {
  const cache = await openCache();
  if (!cache) throw new Error('Este navegador não deixa salvar mapas (precisa de HTTPS).');
  // Pede pro navegador não apagar os mapas quando faltar espaço.
  navigator.storage?.persist?.().catch(() => {});

  const urls = [];
  for (const r of ranges(bounds, fromZoom)) {
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) urls.push(tileUrl(r.z, x, y));
  }

  let next = 0;
  let done = 0;
  let failed = 0;
  async function worker() {
    while (next < urls.length && !signal?.aborted) {
      const url = urls[next++];
      try {
        if (!(await cache.match(url))) await cache.put(url, await fetchTile(url));
      } catch {
        failed++;
      }
      onProgress?.(++done, urls.length);
    }
  }
  await Promise.all([worker(), worker()]);
  return { failed };
}

export async function countSavedTiles() {
  const cache = await openCache();
  return cache ? (await cache.keys()).length : 0;
}

export async function clearSavedTiles() {
  if ('caches' in window) await caches.delete(CACHE);
}
