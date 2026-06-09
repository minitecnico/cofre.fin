import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';

const EMPTY = {
  keyword: '',
  location: '',
  company: '',
  workMode: '',
  contractType: '',
  datePosted: '',
  salaryMin: '',
  salaryMax: '',
  brazilOnly: true, // padrão: só vagas BR / remotas abertas ao Brasil
};

/**
 * Filtros da busca de vagas. A palavra-chave fica sempre visível; os
 * filtros avançados ficam num bloco colapsável (mobile-first: não polui a
 * tela pequena). Chama onSearch(filters) ao submeter.
 */
export default function JobFilters({ onSearch, loading }) {
  const [f, setF] = useState(EMPTY);
  const [advanced, setAdvanced] = useState(false);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const setBool = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.checked }));

  const submit = (e) => {
    e.preventDefault();
    // remove strings vazias antes de enviar (cache key mais estável); booleanos
    // como brazilOnly são preservados (precisam viajar mesmo quando false).
    const clean = Object.fromEntries(
      Object.entries(f).filter(([, v]) => typeof v === 'boolean' || String(v).trim() !== '')
    );
    onSearch(clean);
  };

  const reset = () => setF(EMPTY);

  return (
    <form onSubmit={submit} className="card-flat p-4 md:p-5 space-y-3">
      {/* Linha principal */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
          <input
            value={f.keyword}
            onChange={set('keyword')}
            placeholder="Cargo, tecnologia, palavra-chave…"
            className="input-field pl-9"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary px-4 min-h-[44px] flex-shrink-0">
          {loading ? '…' : 'Buscar'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filtros avançados
        </button>

        {/* BR-only sempre visível: comunica o recorte sem precisar abrir avançado. */}
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-700 cursor-pointer select-none min-h-[44px]">
          <input
            type="checkbox"
            checked={f.brazilOnly}
            onChange={setBool('brazilOnly')}
            className="w-4 h-4 rounded accent-accent-dark"
          />
          🇧🇷 Só Brasil (e remoto p/ BR)
        </label>
      </div>

      {advanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-fade-in">
          <div>
            <label className="label">Localização</label>
            <input value={f.location} onChange={set('location')} placeholder="Cidade, estado, país" className="input-field" />
          </div>
          <div>
            <label className="label">Empresa</label>
            <input value={f.company} onChange={set('company')} placeholder="Ex: Nubank" className="input-field" />
          </div>
          <div>
            <label className="label">Modalidade</label>
            <select value={f.workMode} onChange={set('workMode')} className="input-field">
              <option value="">Todas</option>
              <option value="remote">Remoto / Home office</option>
              <option value="hybrid">Híbrido</option>
              <option value="onsite">Presencial</option>
            </select>
          </div>
          <div>
            <label className="label">Contratação</label>
            <select value={f.contractType} onChange={set('contractType')} className="input-field">
              <option value="">Todas</option>
              <option value="CLT / Full-time">CLT / Full-time</option>
              <option value="PJ / Contrato">PJ / Contrato</option>
              <option value="Estágio">Estágio</option>
              <option value="Freelancer">Freelancer</option>
              <option value="Temporário">Temporário</option>
            </select>
          </div>
          <div>
            <label className="label">Publicação</label>
            <select value={f.datePosted} onChange={set('datePosted')} className="input-field">
              <option value="">Qualquer data</option>
              <option value="today">Hoje</option>
              <option value="3d">Últimos 3 dias</option>
              <option value="week">Última semana</option>
              <option value="month">Último mês</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Salário mín.</label>
              <input value={f.salaryMin} onChange={set('salaryMin')} inputMode="numeric" placeholder="0" className="input-field" />
            </div>
            <div>
              <label className="label">Salário máx.</label>
              <input value={f.salaryMax} onChange={set('salaryMax')} inputMode="numeric" placeholder="—" className="input-field" />
            </div>
          </div>

          <button
            type="button"
            onClick={reset}
            className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-negative"
          >
            <X className="w-3.5 h-3.5" />
            Limpar filtros
          </button>
        </div>
      )}
    </form>
  );
}
