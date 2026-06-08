import { useCallback, useEffect, useMemo, useState } from 'react';
import { savedJobService } from '../services/jobs';

/**
 * Favoritos de vagas. Mantém um Set de chaves "source:job_id" pra o JobCard
 * saber rápido se a vaga está salva. Atualização otimista (igual togglePaid):
 * muda a UI na hora, reverte se o servidor reclamar.
 */
const keyOf = (source, jobId) => `${source}:${jobId}`;

export function useSavedJobs() {
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSaved(await savedJobService.list());
    } catch {
      setSaved([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const savedKeys = useMemo(() => new Set(saved.map((s) => keyOf(s.source, s.job_id))), [saved]);

  const isSaved = useCallback((job) => savedKeys.has(keyOf(job.source, job.id)), [savedKeys]);

  const toggle = useCallback(
    async (job) => {
      const already = savedKeys.has(keyOf(job.source, job.id));
      try {
        if (already) {
          setSaved((prev) => prev.filter((s) => keyOf(s.source, s.job_id) !== keyOf(job.source, job.id)));
          await savedJobService.remove(job.source, job.id);
        } else {
          await savedJobService.save(job);
          await refresh();
        }
      } catch {
        // reverte buscando o estado real do servidor
        refresh();
      }
    },
    [savedKeys, refresh]
  );

  return { saved, loading, isSaved, toggle, refresh };
}
