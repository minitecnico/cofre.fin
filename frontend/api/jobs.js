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

/**
 * GitHub Vagas BR — as ISSUES dos repositórios de vaga da comunidade dev
 * brasileira são as vagas (em português, BR). É a fonte BR grátis e viva que
 * substitui o "GitHub Jobs" morto que o spec original citava.
 * Sem chave: 60 req/h por IP. Opcional GITHUB_TOKEN sobe pra 5000/h.
 */
const githubVagasBR = {
  name: 'GitHub Vagas BR',
  free: true,
  async search(_filters, { signal }) {
    const repos = ['frontendbr/vagas', 'backend-br/vagas', 'react-brasil/vagas', 'androiddevbr/vagas', 'python-brasil/vagas'];
    const token = env('GITHUB_TOKEN');
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'cofre-jobs' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const lists = await Promise.all(
      repos.map(async (repo) => {
        try {
          const r = await fetch(
            `https://api.github.com/repos/${repo}/issues?state=open&per_page=30&sort=created&direction=desc`,
            { headers, signal }
          );
          if (!r.ok) return [];
          const issues = await r.json();
          return (Array.isArray(issues) ? issues : [])
            .filter((i) => !i.pull_request) // o endpoint /issues mistura PRs
            .map((i) => issueToJob(i, repo));
        } catch {
          return [];
        }
      })
    );
    return lists.flat();
  },
};

function issueToJob(issue, repo) {
  const labels = (issue.labels || []).map((l) => lower(typeof l === 'string' ? l : l.name));
  const text = `${lower(issue.title)} ${labels.join(' ')}`;
  const remote = /remoto|remote|home.?office|an[yi]where/.test(text);
  const workMode = remote ? 'remote' : /h[íi]brido|hybrid/.test(text) ? 'hybrid' : 'onsite';
  return {
    id: `github-${repo}-${issue.number}`,
    title: issue.title,
    company: null, // o nome da empresa costuma vir no título; não é o dono do repo
    location: remote ? 'Remoto' : 'Brasil',
    workMode,
    contractType: contractFromText(text),
    publishedAt: issue.created_at,
    source: 'GitHub Vagas BR',
    applyUrl: issue.html_url,
    description: stripHtml(issue.body),
  };
}

function contractFromText(text) {
  if (/estag|estág/.test(text)) return 'Estágio';
  if (/trainee/.test(text)) return 'Trainee';
  if (/freelanc/.test(text)) return 'Freelancer';
  if (/tempor[áa]ri/.test(text)) return 'Temporário';
  if (/\bpj\b/.test(text)) return 'PJ / Contrato';
  if (/\bclt\b/.test(text)) return 'CLT / Full-time';
  return 'Não informado';
}

/**
 * Adzuna BR — cobre vagas brasileiras NÃO-tech (vendas, adm, saúde…) que as
 * outras fontes não pegam. Exige chave grátis (tier free, sem cartão):
 * ADZUNA_APP_ID + ADZUNA_APP_KEY nas env vars da Vercel.
 * `enabled()` faz o provider ficar INERTE se as chaves não existirem — nada
 * quebra, ele só não roda.
 */
const adzunaBR = {
  name: 'Adzuna BR',
  enabled: () => Boolean(env('ADZUNA_APP_ID') && env('ADZUNA_APP_KEY')),
  async search(filters, { signal }) {
    const url = new URL('https://api.adzuna.com/v1/api/jobs/br/search/1');
    url.searchParams.set('app_id', env('ADZUNA_APP_ID'));
    url.searchParams.set('app_key', env('ADZUNA_APP_KEY'));
    url.searchParams.set('results_per_page', '50');
    url.searchParams.set('content-type', 'application/json');
    if (filters.keyword) url.searchParams.set('what', filters.keyword);
    if (filters.location) url.searchParams.set('where', filters.location);
    if (filters.company) url.searchParams.set('company', filters.company);
    if (filters.salaryMin) url.searchParams.set('salary_min', String(filters.salaryMin));
    if (filters.salaryMax) url.searchParams.set('salary_max', String(filters.salaryMax));

    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`Adzuna HTTP ${r.status}`);
    const json = await r.json();
    return (json.results || []).map((j) => ({
      id: `adzuna-${j.id}`,
      title: j.title,
      company: j.company?.display_name || null,
      location: j.location?.display_name || 'Brasil',
      workMode: workModeFrom({ location: j.location?.display_name }),
      contractType: adzunaContract(j),
      salaryMin: j.salary_min || undefined,
      salaryMax: j.salary_max || undefined,
      publishedAt: j.created,
      source: 'Adzuna BR',
      applyUrl: j.redirect_url,
      description: stripHtml(j.description),
    }));
  },
};

function adzunaContract(j) {
  if (j.contract_type === 'contract') return 'PJ / Contrato';
  if (j.contract_time === 'part_time') return 'Meio período';
  if (j.contract_time === 'full_time' || j.contract_type === 'permanent') return 'CLT / Full-time';
  return 'Não informado';
}

/**
 * Jooble — AGREGADOR com API grátis (precisa chave: JOOBLE_API_KEY). Junta
 * vagas de muitos boards BR (inclusive estilo TrabalhaBrasil/Catho), o que a
 * gente não consegue pegar direto (esses sites não têm API pública). É o maior
 * ganho de cobertura BR. Gated por `enabled()` — inerte sem chave.
 * Pegar chave grátis: jooble.org/api/about
 */
const jooble = {
  name: 'Jooble',
  enabled: () => Boolean(env('JOOBLE_API_KEY')),
  async search(filters, { signal }) {
    const r = await fetch(`https://jooble.org/api/${env('JOOBLE_API_KEY')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Jooble espera o país em inglês ("Brazil"); "Brasil" retorna 0.
      body: JSON.stringify({ keywords: filters.keyword || '', location: filters.location || 'Brazil' }),
      signal,
    });
    if (!r.ok) throw new Error(`Jooble HTTP ${r.status}`);
    const json = await r.json();
    return (json.jobs || []).map((j) => ({
      id: `jooble-${j.id}`,
      title: j.title,
      company: j.company || null,
      location: j.location || 'Brasil',
      workMode: workModeFrom({ location: j.location }),
      contractType: prettyContract(j.type),
      ...parseSalary(j.salary),
      publishedAt: j.updated || null,
      source: 'Jooble',
      applyUrl: j.link,
      description: stripHtml(j.snippet),
    }));
  },
};

/**
 * Jobicy — vagas remotas, grátis e SEM chave. Ganho imediato de volume remoto.
 * Salário é anual em moeda estrangeira → omitido pra não exibir como R$ mensal.
 */
const jobicy = {
  name: 'Jobicy',
  free: true,
  async search(filters, { signal }) {
    const url = new URL('https://jobicy.com/api/v2/remote-jobs');
    url.searchParams.set('count', '50');
    if (filters.keyword) url.searchParams.set('tag', filters.keyword);
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`Jobicy HTTP ${r.status}`);
    const json = await r.json();
    return (json.jobs || []).map((j) => ({
      id: `jobicy-${j.id}`,
      title: j.jobTitle,
      company: j.companyName || null,
      location: j.jobGeo || 'Remoto',
      workMode: 'remote',
      contractType: prettyContract((j.jobType || [])[0]),
      publishedAt: j.pubDate || null,
      source: 'Jobicy',
      applyUrl: j.url,
      description: stripHtml(j.jobDescription),
    }));
  },
};

/**
 * Himalayas — board de vagas remotas, grátis e SEM chave. Volume alto (>100k
 * vagas). `pubDate` vem em unix (segundos). Salário é anual em moeda estrangeira
 * → omitido pra não exibir como R$ mensal (mesmo critério do Jobicy).
 */
const himalayas = {
  name: 'Himalayas',
  free: true,
  async search(_filters, { signal }) {
    const r = await fetch('https://himalayas.app/jobs/api?limit=50', { signal });
    if (!r.ok) throw new Error(`Himalayas HTTP ${r.status}`);
    const json = await r.json();
    return (json.jobs || []).map((j) => ({
      id: `himalayas-${j.guid || j.applicationLink}`,
      title: j.title,
      company: j.companyName || null,
      location: (j.locationRestrictions || [])[0] || 'Remoto',
      workMode: 'remote',
      contractType: prettyContract(j.employmentType),
      publishedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
      source: 'Himalayas',
      applyUrl: j.applicationLink || j.guid,
      description: stripHtml(j.description || j.excerpt),
    }));
  },
};

/**
 * The Muse — board global, grátis e SEM chave (THEMUSE_API_KEY opcional só sobe
 * o rate limit). Sem busca por palavra-chave server-side → filtramos depois;
 * suporta filtro de `location` (ex.: "Brazil") quando o usuário informa.
 */
const theMuse = {
  name: 'The Muse',
  free: true,
  async search(filters, { signal }) {
    const url = new URL('https://www.themuse.com/api/public/jobs');
    url.searchParams.set('page', '1');
    if (filters.location) url.searchParams.set('location', filters.location);
    const key = env('THEMUSE_API_KEY');
    if (key) url.searchParams.set('api_key', key);
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`The Muse HTTP ${r.status}`);
    const json = await r.json();
    return (json.results || []).map((j) => {
      const location = (j.locations || [])[0]?.name || 'Não informado';
      return {
        id: `themuse-${j.id}`,
        title: j.name,
        company: j.company?.name || null,
        location,
        workMode: workModeFrom({ location }),
        contractType: prettyContract(j.type),
        publishedAt: j.publication_date || null,
        source: 'The Muse',
        applyUrl: j.refs?.landing_page,
        description: stripHtml(j.contents),
      };
    });
  },
};

// Ordem = prioridade de exibição quando há empate na deduplicação.
// Fontes BR/agregadores primeiro. Providers com `enabled()` só rodam se as
// chaves existirem (Adzuna/Jooble); os `free` rodam sempre.
const PROVIDERS = [githubVagasBR, adzunaBR, jooble, remotive, arbeitnow, jobicy, himalayas, theMuse];

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
    if (f.contractType && lower(j.contractType) !== lower(f.contractType)) return false;
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

  // Só roda providers habilitados (os que exigem chave ficam inertes sem env).
  const active = PROVIDERS.filter((p) => !p.enabled || p.enabled());

  // Fan-out paralelo com timeout por provider; falha de uma não derruba a busca.
  const settled = await Promise.all(
    active.map(async (p) => {
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
