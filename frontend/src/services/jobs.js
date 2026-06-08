import { supabase } from './supabase';

/**
 * Services do módulo Empregos:
 *   - jobService      → busca de vagas via serverless /api/jobs (stateless)
 *   - savedJobService → favoritos do usuário (tabela saved_jobs, RLS)
 *
 * Componentes NUNCA chamam supabase/fetch direto — passam por aqui.
 */

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Não autenticado');
  return data.user.id;
}

// ═════════════════════════════════════════════════════════════════════════
// BUSCA (serverless proxy)
// ═════════════════════════════════════════════════════════════════════════

export const jobService = {
  /**
   * Busca vagas nas fontes configuradas no serverless.
   * @param {object} filters keyword, location, workMode, contractType,
   *   datePosted, salaryMin, salaryMax, company
   * @returns {Promise<{ jobs: Array, sources: Array }>}
   */
  async search(filters = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sua sessão expirou. Entre novamente na sua conta.');
    }

    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filters }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível consultar as fontes de vagas.');
    }
    return { jobs: data.jobs || [], sources: data.sources || [] };
  },
};

// ═════════════════════════════════════════════════════════════════════════
// FAVORITOS
// ═════════════════════════════════════════════════════════════════════════

export const savedJobService = {
  /** Lista vagas salvas (mais recentes primeiro). */
  async list() {
    const { data, error } = await supabase
      .from('saved_jobs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /** Salva uma vaga (idempotente via unique user+source+job_id). */
  async save(job) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('saved_jobs')
      .upsert(
        {
          user_id: userId,
          job_id: job.id,
          source: job.source,
          title: job.title,
          company: job.company || null,
          location: job.location || null,
          work_mode: job.workMode || null,
          contract_type: job.contractType || null,
          salary_min: job.salaryMin ?? null,
          salary_max: job.salaryMax ?? null,
          apply_url: job.applyUrl || null,
          published_at: job.publishedAt || null,
        },
        { onConflict: 'user_id,source,job_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Remove favorito pelo id normalizado do provider (job_id + source). */
  async remove(source, jobId) {
    const { error } = await supabase
      .from('saved_jobs')
      .delete()
      .eq('source', source)
      .eq('job_id', jobId);
    if (error) throw error;
  },
};
