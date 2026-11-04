import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, CloudOff, Receipt, Map as MapIcon, CloudUpload } from 'lucide-react';
import { useTrip } from '../hooks/useTravel';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from '../components/Toast';
import TripForm from '../components/TripForm';
import TripBudgetBar from '../components/TripBudgetBar';
import TripExpenses from '../components/TripExpenses';
import TripPlaces from '../components/TripPlaces';
import { travelErrorMessage } from '../services/travel';
import { formatCurrency, formatDateRange } from '../utils/format';

/**
 * Uma viagem: quanto já foi gasto (total, orçamento, por categoria), a lista
 * de gastos e o mapa com os lugares. Abre sem internet com o que estiver
 * salvo no aparelho; o que for registrado offline sobe quando a rede voltar.
 */
export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    data, places, expenses, queued, offline, error,
    addPlace, updatePlace, addExpense, updateExpense, remove, updateTrip, removeTrip,
  } = useTrip(id);
  const [tab, setTab] = useState('gastos');
  const [editingTrip, setEditingTrip] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);

  const total = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount), 0), [expenses]);
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const e of expenses) {
      const key = e.category?.id || 'sem';
      const cur = map.get(key) || { name: e.category?.name || 'Sem categoria', color: e.category?.color || '#a1a1aa', total: 0 };
      cur.total += Number(e.amount);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [expenses]);

  // Ações que falham sem internet viram aviso em vez de erro silencioso.
  async function safely(action) {
    try {
      await action();
    } catch (err) {
      setToast(travelErrorMessage(err));
    }
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink />
        {offline ? (
          <div className="card-flat p-8 text-center text-sm text-ink-500">
            Sem internet, e esta viagem ainda não foi aberta neste aparelho.
          </div>
        ) : error ? (
          <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>
        ) : (
          <div className="space-y-3">
            <div className="h-24 bg-ink-100 animate-pulse rounded-2xl" />
            <div className="h-64 bg-ink-100 animate-pulse rounded-2xl" />
          </div>
        )}
      </div>
    );
  }

  const { trip } = data;
  const subtitle = [trip.destination, formatDateRange(trip.start_date, trip.end_date)].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <BackLink />
        <div className="flex items-start justify-between gap-3 mt-2">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold leading-tight tracking-tight break-words">{trip.name}</h1>
            {subtitle && <p className="text-sm md:text-base text-ink-500 mt-1">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button type="button" onClick={() => setEditingTrip(true)} className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-600 hover:bg-ink-100" aria-label="Editar viagem">
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirm({
                title: 'Apagar viagem',
                message: `Apagar “${trip.name}”? Os lugares marcados são apagados. Os gastos continuam em Despesas, só sem a viagem.`,
                confirmLabel: 'Apagar viagem',
                tone: 'danger',
                onConfirm: () => safely(async () => {
                  await removeTrip();
                  navigate('/viagens');
                }),
              })}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-600 hover:bg-red-50 hover:text-negative"
              aria-label="Apagar viagem"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {(offline || queued > 0) && (
        <p className="px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-sm flex items-start gap-2">
          {offline ? <CloudOff className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <CloudUpload className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>
            {offline && 'Sem internet — mostrando o que está salvo neste aparelho. '}
            {queued > 0 && `${queued} ${queued === 1 ? 'registro aguardando' : 'registros aguardando'} envio — sobe sozinho quando a conexão voltar.`}
          </span>
        </p>
      )}

      {/* Resumo */}
      <section className="card-flat p-4 md:p-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">Gasto na viagem</p>
            <p className="stat-number text-3xl md:text-4xl text-ink-900 mt-1">{formatCurrency(total)}</p>
          </div>
          <TripBudgetBar spent={total} budget={Number(trip.budget)} />
        </div>
        {byCategory.length > 0 && (
          <ul className="space-y-2">
            {byCategory.slice(0, 5).map((c) => (
              <li key={c.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-ink-700 font-semibold truncate">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />{c.name}
                  </span>
                  <span className="tabular-nums text-ink-600">{formatCurrency(c.total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(c.total / total) * 100}%`, background: c.color }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="card-flat p-1.5 flex gap-1">
        {[
          { value: 'gastos', label: `Gastos (${expenses.length})`, icon: Receipt },
          { value: 'mapa', label: `Mapa (${places.length})`, icon: MapIcon },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex-1 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
              tab === value ? 'bg-gradient-dark text-white shadow-soft' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'gastos' ? (
        <TripExpenses
          expenses={expenses}
          categories={data.categories}
          cards={data.cards}
          onAdd={addExpense}
          onUpdate={updateExpense}
          onRemove={(item, kind) => safely(() => remove(item, kind))}
          onConfirm={setConfirm}
          onNotify={setToast}
        />
      ) : (
        <TripPlaces
          places={places}
          offline={offline}
          onAdd={addPlace}
          onUpdate={updatePlace}
          onRemove={(item, kind) => safely(() => remove(item, kind))}
          onConfirm={setConfirm}
          onNotify={setToast}
        />
      )}

      <Modal isOpen={editingTrip} onClose={() => setEditingTrip(false)} title="Editar viagem">
        {editingTrip && (
          <TripForm
            initial={trip}
            onSubmit={async (fields) => { await updateTrip(fields); setEditingTrip(false); }}
            onCancel={() => setEditingTrip(false)}
          />
        )}
      </Modal>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <Toast message={toast} onClose={closeToast} duration={6000} />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/viagens" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
      <ArrowLeft className="w-4 h-4" /> Viagens
    </Link>
  );
}
