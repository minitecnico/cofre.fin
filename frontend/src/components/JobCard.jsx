import { useState } from 'react';
import { Bookmark, BookmarkCheck, ExternalLink, MapPin, Building2, Wallet, CalendarDays, ChevronDown } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/format';

/** Badge de modalidade com cor semântica. */
const MODE = {
  remote: { label: 'Remoto', cls: 'bg-positive/15 text-positive' },
  hybrid: { label: 'Híbrido', cls: 'bg-warn/15 text-warn' },
  onsite: { label: 'Presencial', cls: 'bg-ink-100 text-ink-600' },
};

function salaryText(job) {
  if (!job.salaryMin && !job.salaryMax) return null;
  if (job.salaryMin && job.salaryMax && job.salaryMin !== job.salaryMax) {
    return `${formatCurrency(job.salaryMin, { compact: true })} – ${formatCurrency(job.salaryMax, { compact: true })}`;
  }
  return formatCurrency(job.salaryMin || job.salaryMax, { compact: true });
}

/**
 * Card de vaga. `job` no formato normalizado do /api/jobs.
 * saved/onToggleSave controlam o favorito (estado vem do hook useSavedJobs).
 */
export default function JobCard({ job, saved, onToggleSave }) {
  const [open, setOpen] = useState(false);
  const mode = MODE[job.workMode] || MODE.onsite;
  const salary = salaryText(job);

  return (
    <div className="card-flat p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight leading-snug break-words">
            {job.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
            {job.company && (
              <span className="inline-flex items-center gap-1 min-w-0">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{job.company}</span>
              </span>
            )}
            {job.location && (
              <span className="inline-flex items-center gap-1 min-w-0">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{job.location}</span>
              </span>
            )}
          </div>
        </div>

        {/* Favoritar */}
        <button
          onClick={() => onToggleSave?.(job)}
          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors min-h-[44px] ${
            saved ? 'bg-accent/20 text-accent-dark' : 'bg-ink-50 text-ink-400 hover:bg-ink-100 hover:text-ink-700'
          }`}
          aria-label={saved ? 'Remover dos salvos' : 'Salvar vaga'}
        >
          {saved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
        </button>
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        <span className={`px-2 py-0.5 rounded-full ${mode.cls}`}>{mode.label}</span>
        {job.contractType && <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-600">{job.contractType}</span>}
        {salary && (
          <span className="px-2 py-0.5 rounded-full bg-ink-900 text-ink-50 inline-flex items-center gap-1">
            <Wallet className="w-3 h-3" />
            {salary}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-ink-400 font-medium">
          <CalendarDays className="w-3.5 h-3.5" />
          {job.publishedAt ? formatDate(job.publishedAt) : '—'}
          <span className="text-ink-300">·</span>
          {job.source}
        </span>
      </div>

      {/* Descrição expansível */}
      {job.description && (
        <div className="mt-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-600 hover:text-ink-900"
          >
            Ver detalhes
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && <p className="mt-2 text-sm text-ink-600 leading-relaxed">{job.description}</p>}
        </div>
      )}

      {/* Candidatar */}
      <a
        href={job.applyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary mt-4 w-full flex items-center justify-center gap-2 min-h-[44px]"
      >
        Candidatar-se
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}
