import { useCallback, useState } from 'react';
import { jobService } from '../services/jobs';

/**
 * Busca de vagas com cache TTL — substitui o "React Query" do spec por
 * sessionStorage puro (a stack do projeto não usa libs de estado/cache).
 *
 * Cache: 5 min por combinação de filtros. Repetir a mesma busca dentro da
 * janela não bate na rede de novo. O histórico de buscas recentes também
 * vive no sessionStorage (sem tabela no banco).
 */

const TTL_MS = 5 * 60 * 1000;
const CACHE_PREFIX = 'jobs:cache:';
const RECENT_KEY = 'jobs:recent';
const MAX_RECENT = 8;

const cacheKey = (filters) => CACHE_PREFIX + JSON.stringify(filters);

function readCache(filters) {
  try {
    const raw = sessionStorage.getItem(cacheKey(filters));
    if (!raw) return null;
    const { at, payload } = JSON.parse(raw);
    if (Date.now() - at > TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function writeCache(filters, payload) {
  try {
    sessionStorage.setItem(cacheKey(filters), JSON.stringify({ at: Date.now(), payload }));
  } catch {
    /* quota cheia / modo privado — segue sem cache */
  }
}

function pushRecent(filters) {
  const label = (filters.keyword || filters.company || filters.location || 'Vagas').trim();
  if (!label) return;
  try {
    const list = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
    const next = [{ label, filters }, ...list.filter((r) => r.label.toLowerCase() !== label.toLowerCase())].slice(0, MAX_RECENT);
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getRecentSearches() {
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useJobSearch() {
  const [jobs, setJobs] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    setSearched(true);

    const cached = readCache(filters);
    if (cached) {
      setJobs(cached.jobs);
      setSources(cached.sources);
      setLoading(false);
      pushRecent(filters);
      return;
    }

    try {
      const payload = await jobService.search(filters);
      setJobs(payload.jobs);
      setSources(payload.sources);
      writeCache(filters, payload);
      pushRecent(filters);
    } catch (err) {
      setError(err.message || 'Falha ao buscar vagas.');
      setJobs([]);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { jobs, sources, loading, error, searched, search };
}
