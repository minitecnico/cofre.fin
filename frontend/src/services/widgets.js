/**
 * Widgets externos do Dashboard — câmbio/cripto, clima e notícias.
 * --------------------------------------------------------------
 * Tudo via APIs OPEN-DATA, sem chave secreta (o app é frontend puro; qualquer
 * chave aqui vazaria). Por isso escolhemos fontes keyless + CORS-friendly:
 *   - AwesomeAPI (câmbio BR)          https://docs.awesomeapi.com.br/
 *   - Open-Meteo (clima)             https://open-meteo.com/
 *   - BigDataCloud (reverse geocode) keyless client endpoint
 *   - Google News RSS via AllOrigins (proxy CORS open-source) p/ notícias
 *
 * Todos os fetches falham em silêncio (são feature secundária — nunca podem
 * quebrar o Dashboard) e usam cache curto em localStorage pra não martelar.
 */

// ─────────────────────────────────────────────────────────────────────────
// Cache simples em localStorage com TTL
// ─────────────────────────────────────────────────────────────────────────
function cacheGet(key, ttlMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttlMs) return null;
    return data;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* storage indisponível */ }
}

// ─────────────────────────────────────────────────────────────────────────
// Câmbio & cripto — AwesomeAPI
// ─────────────────────────────────────────────────────────────────────────
export const fxService = {
  async list() {
    const KEY = 'cofre:w:fx';
    const cached = cacheGet(KEY, 5 * 60 * 1000); // 5 min
    if (cached) return cached;

    const res = await fetch(
      'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL'
    );
    if (!res.ok) throw new Error('Falha ao buscar câmbio');
    const j = await res.json();

    const pick = (k, label, symbol) =>
      j[k]
        ? {
            id: k,
            label,
            symbol,
            bid: Number(j[k].bid),
            pct: Number(j[k].pctChange),
          }
        : null;

    const list = [
      pick('USDBRL', 'Dólar', 'USD'),
      pick('EURBRL', 'Euro', 'EUR'),
      pick('BTCBRL', 'Bitcoin', 'BTC'),
    ].filter(Boolean);

    cacheSet(KEY, list);
    return list;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Clima — Open-Meteo (+ BigDataCloud p/ nome da cidade)
// ─────────────────────────────────────────────────────────────────────────
const WEATHER_LOC_KEY = 'cofre:w:loc';

export const weatherService = {
  /** Local salvo (cidade escolhida ou detectada). null se nunca definiu. */
  getSavedLocation() {
    try {
      return JSON.parse(localStorage.getItem(WEATHER_LOC_KEY) || 'null');
    } catch {
      return null;
    }
  },

  saveLocation(loc) {
    try {
      localStorage.setItem(WEATHER_LOC_KEY, JSON.stringify(loc));
    } catch { /* ignora */ }
  },

  /** Pede a posição do navegador (Promise). Rejeita se negado/indisponível. */
  geolocate() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('sem geolocalização'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => reject(err),
        { timeout: 8000, maximumAge: 10 * 60 * 1000 }
      );
    });
  },

  /** Nome amigável da cidade a partir de lat/lon (reverse geocode keyless). */
  async cityName(lat, lon) {
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`
      );
      const j = await res.json();
      return j.city || j.locality || j.principalSubdivision || 'Aqui';
    } catch {
      return 'Aqui';
    }
  },

  /** Busca cidade por nome → {lat, lon, city}. null se não achar. */
  async searchCity(name) {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt&format=json`
    );
    if (!res.ok) throw new Error('Falha na busca de cidade');
    const j = await res.json();
    const r = j.results?.[0];
    if (!r) return null;
    return { lat: r.latitude, lon: r.longitude, city: r.name };
  },

  /** Tempo atual + máx/mín do dia para um {lat, lon}. */
  async forecast(lat, lon) {
    const KEY = `cofre:w:wx:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = cacheGet(KEY, 15 * 60 * 1000); // 15 min
    if (cached) return cached;

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto'
    );
    if (!res.ok) throw new Error('Falha ao buscar clima');
    const j = await res.json();

    const data = {
      temp: Math.round(j.current?.temperature_2m ?? 0),
      code: j.current?.weather_code ?? 0,
      max: Math.round(j.daily?.temperature_2m_max?.[0] ?? 0),
      min: Math.round(j.daily?.temperature_2m_min?.[0] ?? 0),
    };
    cacheSet(KEY, data);
    return data;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Notícias de economia — Google News RSS via AllOrigins (proxy CORS OSS)
// ─────────────────────────────────────────────────────────────────────────
// Proxies CORS (open-source / públicos). Tentados em ordem até um responder —
// notícias dependem de proxy, então redundância evita o widget cair por um só.
const NEWS_FEED =
  'https://news.google.com/rss/search?q=economia+brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419';

const NEWS_PROXIES = [
  (u) => ({ url: `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, json: false }),
  (u) => ({ url: `https://corsproxy.io/?url=${encodeURIComponent(u)}`, json: false }),
  (u) => ({ url: `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, json: true }),
];

async function fetchFeedXml() {
  for (const make of NEWS_PROXIES) {
    try {
      const { url, json } = make(NEWS_FEED);
      const res = await fetch(url);
      if (!res.ok) continue;
      let xml = await res.text();
      if (json) {
        // variante /get devolve { contents: "<xml…>" }
        try { xml = JSON.parse(xml).contents || ''; } catch { continue; }
      }
      if (xml && xml.includes('<item')) return xml;
    } catch {
      /* tenta o próximo proxy */
    }
  }
  throw new Error('Falha ao buscar notícias');
}

export const newsService = {
  async list() {
    const KEY = 'cofre:w:news';
    const cached = cacheGet(KEY, 20 * 60 * 1000); // 20 min
    if (cached) return cached;

    const xml = await fetchFeedXml();

    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const items = [...doc.querySelectorAll('item')].slice(0, 6).map((it) => {
      const rawTitle = it.querySelector('title')?.textContent || '';
      // Google News usa "Manchete - Fonte"; separamos a fonte do título.
      const dashIdx = rawTitle.lastIndexOf(' - ');
      const title = dashIdx > 0 ? rawTitle.slice(0, dashIdx) : rawTitle;
      const source =
        it.querySelector('source')?.textContent ||
        (dashIdx > 0 ? rawTitle.slice(dashIdx + 3) : '');
      return {
        title,
        source,
        link: it.querySelector('link')?.textContent || '',
        pubDate: it.querySelector('pubDate')?.textContent || '',
      };
    });

    cacheSet(KEY, items);
    return items;
  },
};
