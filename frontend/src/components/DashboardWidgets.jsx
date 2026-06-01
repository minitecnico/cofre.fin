import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  DollarSign, Euro, Bitcoin, TrendingUp, TrendingDown,
  Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudFog, CloudLightning,
  MapPin, Newspaper, ExternalLink, Search, X, RefreshCw,
} from 'lucide-react';
import { fxService, weatherService, newsService } from '../services/widgets';
import { formatCurrency } from '../utils/format';

/**
 * DashboardWidgets — faixa interativa de dados externos (câmbio, clima,
 * notícias). Cada card carrega de forma independente, com skeleton e falha
 * silenciosa. Fontes open-data keyless (ver services/widgets.js).
 */
export default function DashboardWidgets() {
  const reduce = useReducedMotion();

  const card = (i) => ({
    initial: reduce ? false : { opacity: 0, y: 14 },
    animate: reduce ? {} : { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] },
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      <motion.div {...card(0)}><FxWidget /></motion.div>
      <motion.div {...card(1)}><WeatherWidget /></motion.div>
      <motion.div {...card(2)} className="sm:col-span-2 lg:col-span-1"><NewsWidget /></motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Câmbio & cripto
// ─────────────────────────────────────────────────────────────────────────
const FX_ICONS = { USDBRL: DollarSign, EURBRL: Euro, BTCBRL: Bitcoin };

function FxWidget() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fxService.list()
      .then((d) => alive && setList(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);

  return (
    <div className="card-flat p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-accent-dark" strokeWidth={2.5} />
        </div>
        <h3 className="font-display font-bold text-sm tracking-tight">Mercado hoje</h3>
      </div>

      {error ? (
        <p className="text-xs text-ink-400">Cotações indisponíveis agora.</p>
      ) : !list ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-ink-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map((it) => {
            const Icon = FX_ICONS[it.id] || DollarSign;
            const up = it.pct >= 0;
            return (
              <div key={it.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-4 h-4 text-ink-500 flex-shrink-0" strokeWidth={2.25} />
                  <span className="text-xs font-semibold text-ink-700 truncate">{it.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono font-bold text-sm tabular-nums">
                    {formatCurrency(it.bid, { compact: it.id === 'BTCBRL' })}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${up ? 'text-positive' : 'text-negative'}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(it.pct).toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Clima
// ─────────────────────────────────────────────────────────────────────────
const DEFAULT_LOC = { lat: -23.55, lon: -46.63, city: 'São Paulo' };

function weatherInfo(code) {
  if (code === 0) return { Icon: Sun, label: 'Céu limpo' };
  if (code <= 3) return { Icon: CloudSun, label: 'Parcial' };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: 'Névoa' };
  if (code >= 51 && code <= 67) return { Icon: CloudRain, label: 'Chuva' };
  if (code >= 71 && code <= 77) return { Icon: CloudSnow, label: 'Neve' };
  if (code >= 80 && code <= 82) return { Icon: CloudRain, label: 'Pancadas' };
  if (code >= 95) return { Icon: CloudLightning, label: 'Tempestade' };
  return { Icon: Cloud, label: 'Nublado' };
}

function WeatherWidget() {
  const [loc, setLoc] = useState(null);
  const [wx, setWx] = useState(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const loadFor = useCallback(async (location) => {
    setWx(null);
    setError(false);
    setLoc(location);
    try {
      const data = await weatherService.forecast(location.lat, location.lon);
      setWx(data);
    } catch {
      setError(true);
    }
  }, []);

  // Resolve a localização inicial: salva → geolocalização → fallback SP.
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = weatherService.getSavedLocation();
      if (saved?.lat) { if (alive) loadFor(saved); return; }
      try {
        const { lat, lon } = await weatherService.geolocate();
        const city = await weatherService.cityName(lat, lon);
        const location = { lat, lon, city };
        weatherService.saveLocation(location);
        if (alive) loadFor(location);
      } catch {
        if (alive) loadFor(DEFAULT_LOC);
      }
    })();
    return () => { alive = false; };
  }, [loadFor]);

  async function submitCity(e) {
    e.preventDefault();
    const name = query.trim();
    if (!name) return;
    setSearching(true);
    try {
      const found = await weatherService.searchCity(name);
      if (found) {
        weatherService.saveLocation(found);
        setEditing(false);
        setQuery('');
        loadFor(found);
      }
    } catch { /* mantém atual */ } finally {
      setSearching(false);
    }
  }

  async function useMyLocation() {
    try {
      const { lat, lon } = await weatherService.geolocate();
      const city = await weatherService.cityName(lat, lon);
      const location = { lat, lon, city };
      weatherService.saveLocation(location);
      setEditing(false);
      loadFor(location);
    } catch { /* ignora — usuário negou */ }
  }

  const info = wx ? weatherInfo(wx.code) : null;

  return (
    <div className="card-flat p-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-ink-500 flex-shrink-0" strokeWidth={2.25} />
          <h3 className="font-display font-bold text-sm tracking-tight truncate">
            {loc?.city || 'Clima'}
          </h3>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-[11px] font-bold text-ink-400 hover:text-ink-700 flex-shrink-0"
        >
          {editing ? 'fechar' : 'trocar'}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <form onSubmit={submitCity} className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cidade…"
              autoFocus
              className="w-full pl-8 pr-3 py-2 text-sm bg-surface-soft rounded-lg focus:outline-none focus:bg-white focus:shadow-glow-accent"
            />
          </form>
          <button
            onClick={useMyLocation}
            className="w-full text-xs font-semibold text-ink-600 hover:text-ink-900 inline-flex items-center justify-center gap-1.5 py-1.5"
          >
            <MapPin className="w-3.5 h-3.5" /> Usar minha localização
          </button>
          {searching && <p className="text-[11px] text-ink-400 text-center">buscando…</p>}
        </div>
      ) : error ? (
        <p className="text-xs text-ink-400">Clima indisponível agora.</p>
      ) : !wx ? (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-ink-100 rounded-xl animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-6 w-20 bg-ink-100 rounded animate-pulse" />
            <div className="h-3 w-24 bg-ink-100 rounded animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-1">
          <info.Icon className="w-12 h-12 text-accent-dark flex-shrink-0" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="font-display text-3xl font-bold leading-none tabular-nums">{wx.temp}°</p>
            <p className="text-xs text-ink-500 mt-1">
              {info.label} · <span className="tabular-nums">{wx.max}° / {wx.min}°</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Notícias de economia
// ─────────────────────────────────────────────────────────────────────────
function timeAgo(pubDate) {
  if (!pubDate) return '';
  const then = new Date(pubDate).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `há ${mins}min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

function NewsWidget() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(false);
    newsService.list()
      .then((d) => alive && setItems(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [reloadKey]);

  return (
    <div className="card-flat p-4 h-full">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-ink-100 flex items-center justify-center">
            <Newspaper className="w-4 h-4 text-ink-700" strokeWidth={2.25} />
          </div>
          <h3 className="font-display font-bold text-sm tracking-tight">Economia</h3>
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="w-7 h-7 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center"
          aria-label="Atualizar notícias"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.25} />
        </button>
      </div>

      {error ? (
        <p className="text-xs text-ink-400">Notícias indisponíveis agora.</p>
      ) : !items ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => <div key={i} className="h-7 bg-ink-100 rounded animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-400">Sem manchetes no momento.</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 4).map((n, i) => (
            <li key={i}>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-1.5"
              >
                <span className="text-xs text-ink-800 group-hover:text-accent-dark leading-snug line-clamp-2 font-medium">
                  {n.title}
                </span>
                <ExternalLink className="w-3 h-3 text-ink-300 group-hover:text-accent-dark flex-shrink-0 mt-0.5" />
              </a>
              <p className="text-[10px] text-ink-400 mt-0.5">
                {n.source}{n.source && n.pubDate ? ' · ' : ''}{timeAgo(n.pubDate)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
