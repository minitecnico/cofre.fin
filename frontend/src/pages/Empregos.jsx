import { useState } from 'react';
import { Briefcase, Bookmark, Search as SearchIcon, History, AlertTriangle, Inbox } from 'lucide-react';
import JobFilters from '../components/JobFilters';
import JobCard from '../components/JobCard';
import { useJobSearch, getRecentSearches } from '../hooks/useJobSearch';
import { useSavedJobs } from '../hooks/useSavedJobs';

/** Converte linha do banco (saved_jobs) pro formato normalizado que o JobCard espera. */
const rowToJob = (r) => ({
  id: r.job_id,
  title: r.title,
  company: r.company,
  location: r.location,
  workMode: r.work_mode,
  contractType: r.contract_type,
  salaryMin: r.salary_min,
  salaryMax: r.salary_max,
  publishedAt: r.published_at,
  source: r.source,
  applyUrl: r.apply_url,
});

function Skeleton() {
  return (
    <div className="card-flat p-4 md:p-5 animate-pulse space-y-3">
      <div className="h-5 bg-ink-100 rounded w-2/3" />
      <div className="h-3 bg-ink-100 rounded w-1/2" />
      <div className="flex gap-2">
        <div className="h-5 bg-ink-100 rounded-full w-16" />
        <div className="h-5 bg-ink-100 rounded-full w-20" />
      </div>
      <div className="h-11 bg-ink-100 rounded-xl w-full" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="card-flat p-8 text-center">
      <Icon className="w-10 h-10 mx-auto text-ink-300 mb-3" />
      <p className="font-display font-bold text-ink-800">{title}</p>
      {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function Empregos() {
  const [tab, setTab] = useState('search');
  const { jobs, sources, loading, error, searched, search } = useJobSearch();
  const { saved, isSaved, toggle } = useSavedJobs();
  const [recent] = useState(getRecentSearches);

  const okSources = sources.filter((s) => s.ok).map((s) => s.name);

  return (
    <div className="space-y-4 md:space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-accent flex items-center justify-center shadow-soft-md flex-shrink-0">
          <Briefcase className="w-5 h-5 text-ink-900" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight">Buscador de Vagas</h1>
          <p className="text-xs md:text-sm text-ink-500">Oportunidades de várias fontes em um só lugar</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-ink-100 rounded-xl w-full sm:w-auto sm:inline-flex">
        <button
          onClick={() => setTab('search')}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors min-h-[40px] ${
            tab === 'search' ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          <SearchIcon className="w-4 h-4" />
          Buscar
        </button>
        <button
          onClick={() => setTab('saved')}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors min-h-[40px] ${
            tab === 'saved' ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          Salvos{saved.length > 0 && ` (${saved.length})`}
        </button>
      </div>

      {tab === 'search' && (
        <>
          <JobFilters onSearch={search} loading={loading} />

          {/* Buscas recentes */}
          {!searched && recent.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs text-ink-400 font-medium">
                <History className="w-3.5 h-3.5" /> Recentes:
              </span>
              {recent.map((r, i) => (
                <button
                  key={i}
                  onClick={() => search(r.filters)}
                  className="px-2.5 py-1 rounded-full bg-ink-100 text-ink-600 text-xs font-medium hover:bg-ink-200 transition-colors"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {/* Resultados */}
          {loading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}
            </div>
          )}

          {!loading && error && (
            <EmptyState icon={AlertTriangle} title="Não foi possível consultar as fontes" subtitle={error} />
          )}

          {!loading && !error && searched && jobs.length === 0 && (
            <EmptyState icon={Inbox} title="Nenhuma vaga encontrada" subtitle="Tente ampliar os filtros ou trocar a palavra-chave." />
          )}

          {!loading && !error && jobs.length > 0 && (
            <>
              <p className="text-xs text-ink-400">
                {jobs.length} {jobs.length === 1 ? 'vaga' : 'vagas'}
                {okSources.length > 0 && ` · ${okSources.join(', ')}`}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} saved={isSaved(job)} onToggleSave={toggle} />
                ))}
              </div>
            </>
          )}

          {!loading && !error && !searched && (
            <EmptyState icon={SearchIcon} title="Comece sua busca" subtitle="Digite um cargo ou tecnologia e encontre vagas." />
          )}
        </>
      )}

      {tab === 'saved' && (
        <>
          {saved.length === 0 ? (
            <EmptyState icon={Bookmark} title="Nenhuma vaga salva" subtitle="Toque no marcador de uma vaga para guardá-la aqui." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {saved.map((row) => {
                const job = rowToJob(row);
                return <JobCard key={row.id} job={job} saved onToggleSave={toggle} />;
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
