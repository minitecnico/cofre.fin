import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plane, Plus, MapPin, CloudOff, ChevronRight } from 'lucide-react';
import { useTrips } from '../hooks/useTravel';
import Modal from '../components/Modal';
import TripForm from '../components/TripForm';
import TripBudgetBar from '../components/TripBudgetBar';
import { formatCurrency, formatDateRange } from '../utils/format';

/**
 * Viagens — cada viagem é um centro de custos (os gastos são despesas normais
 * marcadas com a viagem) com um mapa dos lugares marcados que abre offline.
 */
export default function Trips() {
  const { trips, offline, error, create } = useTrips();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  async function handleCreate(fields) {
    const trip = await create(fields);
    setCreating(false);
    navigate(`/viagens/${trip.id}`);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">Centro de custos</p>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight tracking-tight flex items-center gap-2 md:gap-3">
            <Plane className="w-7 h-7 md:w-10 md:h-10 flex-shrink-0 text-accent" strokeWidth={2.25} />
            <span>Viagens</span>
          </h1>
          <p className="text-sm md:text-base text-ink-500 mt-1">Gastos de cada viagem e um mapa dos lugares que funciona sem internet.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} disabled={offline} className="btn-primary disabled:opacity-50">
          <Plus className="w-5 h-5" /> Nova viagem
        </button>
      </div>

      {offline && (
        <p className="px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-sm flex items-center gap-2">
          <CloudOff className="w-4 h-4 flex-shrink-0" />
          Sem internet — mostrando o que está salvo neste aparelho.
        </p>
      )}
      {error && <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>}

      {trips === null ? (
        !offline && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-ink-100 animate-pulse rounded-2xl" />)}
          </div>
        )
      ) : trips.length === 0 ? (
        <div className="card-flat p-8 text-center">
          <Plane className="w-10 h-10 mx-auto mb-3 text-ink-300" strokeWidth={1.75} />
          <p className="text-sm text-ink-500">Nenhuma viagem ainda. Crie uma para anotar os gastos e marcar os lugares.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 stagger">
          {trips.map((t) => (
            <Link key={t.id} to={`/viagens/${t.id}`} className="card-flat p-4 md:p-5 flex flex-col gap-3 hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-ink-900 text-accent flex items-center justify-center flex-shrink-0">
                  <Plane className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-base text-ink-900 truncate">{t.name}</p>
                  <p className="text-xs text-ink-500 truncate">
                    {[t.destination, formatDateRange(t.start_date, t.end_date)].filter(Boolean).join(' · ') || 'Sem datas'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-400 flex-shrink-0 mt-1" />
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">Gasto</p>
                  <p className="stat-number text-xl text-ink-900">{formatCurrency(t.spent)}</p>
                </div>
                <span className="text-xs text-ink-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {t.places} {t.places === 1 ? 'lugar' : 'lugares'}
                </span>
              </div>
              <TripBudgetBar spent={Number(t.spent)} budget={Number(t.budget)} />
            </Link>
          ))}
        </div>
      )}

      {offline && trips === null && (
        <div className="card-flat p-8 text-center text-sm text-ink-500">
          Sem internet, e a lista de viagens ainda não foi aberta neste aparelho.
        </div>
      )}

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Nova viagem">
        {creating && <TripForm onSubmit={handleCreate} onCancel={() => setCreating(false)} />}
      </Modal>
    </div>
  );
}
