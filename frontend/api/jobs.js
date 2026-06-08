// ============================================================================
// /api/jobs — Engine de busca de vagas (serverless Vercel)
// ----------------------------------------------------------------------------
// Mesmo molde do /api/ai-chat: autentica via token Supabase e faz proxy.
// Motivo de viver no serverless (e não no browser):
//   - APIs de vaga batem em CORS quando chamadas direto do front;
//   - fontes pagas (Adzuna/JSearch) exigem chave SECRETA → não pode ir pro client.
//
// Arquitetura de providers (plugável / "polimórfica"): cada fonte é um objeto
// { name, free, search(filters, ctx) }. Adicionar fonte = +1 item no array.
// As fontes rodam EM PARALELO (não em cascata): mais resultados e resiliência —
// se uma falha ou estoura timeout, as outras ainda respondem. Só erra de fato
// se TODAS falharem.
// ============================================================================

const PROVIDER_TIMEOUT_MS = 8000;

function env(...names) {
  return names.map((name) => process.env[name]).find(Boolean);
}

function send(res, status, payload) {
  return res.status(status).json(payload);
}

async function authenticate(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseAnonKey = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  if (!token || !supabaseUrl || !supabaseAnonKey) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

/* ─── Helpers de normalização ──────────────────────────────────────────── */

const lower = (v) => String(v || '').toLowerCase();

/** Tenta extrair faixa salarial de texto livre ("R$ 3.000 - 5.000", "$4k"). */
function parseSalary(raw) {
  if (!raw) return {};
  const nums = String(raw)
    .replace(/\./g, '')
    .match(/\d{3,}/g);
  if (!nums?.length) return {};
  const vals = nums.map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  if (!vals.length) return {};
  return { salaryMin: vals[0], salaryMax: vals[vals.length - 1] || undefined };
}

/** Modelo de trabalho a partir de flags/locais. */
function workModeFrom({ remote, location }) {
  if (remote) return 'remote';
  const loc = lower(location);
  if (/remoto|remote|home.?office|anywhere/.test(loc)) return 'remote';
  if (/h[íi]brid|hybrid/.test(loc)) return 'hybrid';
  return 'onsite';
}

/* ─── Providers (grátis, sem chave) ────────────────────────────────────── */

/** Remotive — vagas 100% remotas. Suporta busca por palavra-chave. */
const remotive = {
  name: 'Remotive',
  free: true,
  async search(filters, { signal }) {
    const url = new URL('https://remotive.com/api/remote-jobs');
    if (filters.keyword) url.searchParams.set('search', filters.keyword);
    url.searchParams.set('limit', '50');
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`Remotive HTTP ${r.status}`);
    const json = await r.json();
    return (json.jobs || []).map((j) => ({
      id: `remotive-${j.id}`,
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location || 'Remoto',
      workMode: 'remote',
      contractType: prettyContract(j.job_type),
      ...parseSalary(j.salary),
      publishedAt: j.publication_date,
      source: 'Remotive',
      applyUrl: j.url,
      description: stripHtml(j.description),
    }));
  },
};

/** Arbeitnow — board europeu/global; sem busca server-side, filtramos aqui. */
const arbeitnow = {
  name: 'Arbeitnow',
  free: true,
  async search(filters, { signal }) {
    const r = await fetch('https://www.arbeitnow.com/api/job-board-api', { signal });
    if (!r.ok) throw new Error(`Arbeitnow HTTP ${r.status}`);
    const json = await r.json();
    return (json.data || []).map((j) => ({
      id: `arbeitnow-${j.slug}`,
      title: j.title,
      company: j.company_name,
      location: j.location || (j.remote ? 'Remoto' : '—'),
      workMode: workModeFrom({ remote: j.remote, location: j.location }),
      contractType: prettyContract((j.job_types || [])[0]),
      publishedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
      source: 'Arbeitnow',
      applyUrl: j.url,
      description: stripHtml(j.description),
    }));
  },
};

// Ordem = prioridade de exibição quando há empate na deduplicação.
// Fontes com chave (Adzuna/JSearch) entram aqui depois, só ligar quando houver env.
const PROVIDERS = [remotive, arbeitnow];

function prettyContract(type) {
  const map = {
    full_time: 'CLT / Full-time',
    part_time: 'Meio período',
    contract: 'PJ / Contrato',
    internship: 'Estágio',
    freelance: 'Freelancer',
    temporary: 'Temporário',
  };
  return map[lower(type).replace(/[\s-]/g, '_')] || (type ? String(type) : 'Não informado');
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

/* ─── Filtros pós-busca (fontes grátis têm filtro limitado) ─────────────── */

function applyFilters(jobs, f) {
  const kw = lower(f.keyword);
  const loc = lower(f.location);
  const comp = lower(f.company);
  const sinceDays = { today: 1, '3d': 3, week: 7, month: 30 }[f.datePosted];
  const cutoff = sinceDays ? Date.now() - sinceDays * 86400000 : null;

  return jobs.filter((j) => {
    if (kw && !(`${lower(j.title)} ${lower(j.company)} ${lower(j.description)}`.includes(kw))) return false;
    if (loc && !lower(j.location).includes(loc)) return false;
    if (comp && !lower(j.company).includes(comp)) return false;
    if (f.workMode && j.workMode !== f.workMode) return false;
    if (f.salaryMin && j.salaryMax && j.salaryMax < Number(f.salaryMin)) return false;
    if (f.salaryMax && j.salaryMin && j.salaryMin > Number(f.salaryMax)) return false;
    if (cutoff && j.publishedAt && new Date(j.publishedAt).getTime() < cutoff) return false;
    return true;
  });
}

/** Dedup por hash title|company|location (estratégia do spec). */
function dedupe(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    const key = `${lower(j.title)}|${lower(j.company)}|${lower(j.location)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

/* ─── Handler ──────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });
  if (!(await authenticate(req))) return send(res, 401, { error: 'Sua sessão expirou. Entre novamente.' });

  const filters = req.body?.filters || {};

  // Fan-out paralelo com timeout por provider; falha de uma não derruba a busca.
  const settled = await Promise.all(
    PROVIDERS.map(async (p) => {
      try {
        const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
        const jobs = await p.search(filters, { signal });
        return { name: p.name, ok: true, jobs };
      } catch (err) {
        console.error(`Provider ${p.name} falhou:`, err?.message || err);
        return { name: p.name, ok: false, jobs: [] };
      }
    })
  );

  const ok = settled.filter((s) => s.ok);
  if (ok.length === 0) {
    return send(res, 502, { error: 'Não foi possível consultar as fontes de vagas agora. Tente novamente em instantes.' });
  }

  const merged = dedupe(applyFilters(ok.flatMap((s) => s.jobs), filters)).sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
  );

  return send(res, 200, {
    jobs: merged,
    sources: settled.map((s) => ({ name: s.name, ok: s.ok, count: s.jobs.length })),
  });
}
