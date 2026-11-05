import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, CloudOff, CloudUpload, Share2, StickyNote } from 'lucide-react';
import { useTrip } from '../hooks/useTravel';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from '../components/Toast';
import TripForm from '../components/TripForm';
import TripBudgetBar from '../components/TripBudgetBar';
import TripExpenses from '../components/TripExpenses';
import TripTravelers from '../components/TripTravelers';
import TripShareModal from '../components/TripShareModal';
import { travelErrorMessage } from '../services/travel';
import { formatCurrency, formatDateRange } from '../utils/format';
import { tripCategory } from '../constants';

/**
 * Uma viagem: quanto custou (total, orçamento, por categoria), viajantes e o
 * caderno de gastos — à parte das finanças do mês. Abre sem internet com o
 * que estiver salvo no aparelho; gasto anotado offline sobe quando a rede voltar.
 */
export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useTrip(id);
  const { trip, members, invites, cards, expenses, queued, offline, error, isOwner } = t;
  const [editingTrip, setEditingTrip] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);

  const total = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount), 0), [expenses]);
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const e of expenses) {
      const cat = tripCategory(e.category);
      const cur = map.get(cat.value) || { ...cat, total: 0 };
      cur.total += Number(e.amount);
      map.set(cat.value, cur);
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

  function askRemoveTrip() {
    setEditingTrip(false);
    setConfirm({
      title: 'Excluir viagem',
      message: `Excluir “${trip.name}”? Os gastos anotados nela são excluídos junto e os viajantes deixam de ver a viagem.`,
      confirmLabel: 'Excluir viagem',
      tone: 'danger',
      onConfirm: () => safely(async () => {
        await t.removeTrip();
        navigate('/viagens');
      }),
    });
  }

  if (!trip) {
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

  const owner = members.find((m) => m.role === 'owner');

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <BackLink />
        <div className="flex items-start justify-between gap-3 mt-2">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold leading-tight tracking-tight break-words">{trip.name}</h1>
            {trip.destination && <p className="text-sm md:text-base text-ink-600 mt-1">{trip.destination}</p>}
            {(trip.start_date || trip.end_date) && (
              <p className="text-sm text-ink-500 mt-0.5 tabular-nums">{formatDateRange(trip.start_date, trip.end_date)}</p>
            )}
            {!isOwner && owner && <p className="text-xs text-ink-400 mt-1">Viagem de {owner.display_name}</p>}
          </div>
          {isOwner && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => setSharing(true)} className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-600 hover:bg-ink-100" aria-label="Compartilhar gastos" title="Compartilhar gastos">
                <Share2 className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setEditingTrip(true)} className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-600 hover:bg-ink-100" aria-label="Editar viagem" title="Editar viagem">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {(offline || queued > 0) && (
        <p className="px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-sm flex items-start gap-2">
          {offline ? <CloudOff className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <CloudUpload className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>
            {offline && 'Sem internet — mostrando o que está salvo neste aparelho. '}
            {queued > 0 && `${queued} ${queued === 1 ? 'gasto aguardando' : 'gastos aguardando'} envio — sobe sozinho quando a conexão voltar.`}
          </span>
        </p>
      )}

      {trip.notes && (
        <section className="card-flat p-4 md:p-5">
          <h2 className="text-[10px] md:text-xs uppercase tracking-widest font-bold text-ink-500 flex items-center gap-1.5 mb-2">
            <StickyNote className="w-3.5 h-3.5" /> Observações
          </h2>
          <p className="text-sm text-ink-700 whitespace-pre-line break-words">{trip.notes}</p>
        </section>
      )}

      {/* Resumo */}
      <section className="card-flat p-4 md:p-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">Custo da viagem</p>
            <p className="stat-number text-3xl md:text-4xl text-ink-900 mt-1">{formatCurrency(total)}</p>
          </div>
          <TripBudgetBar spent={total} budget={Number(trip.budget)} />
        </div>
        {byCategory.length > 0 && (
          <ul className="space-y-2">
            {byCategory.map((c) => (
              <li key={c.value} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-ink-700 font-semibold truncate">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />{c.label}
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

      <div className="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <TripExpenses
          expenses={expenses}
          cards={cards}
          members={members}
          currentUserId={user.id}
          isOwner={isOwner}
          onAdd={t.addExpense}
          onUpdate={t.updateExpense}
          onRemove={(item) => safely(() => t.removeExpense(item))}
          onConfirm={setConfirm}
          onNotify={setToast}
        />
        <TripTravelers
          members={members}
          invites={invites}
          expenses={expenses}
          currentUserId={user.id}
          isOwner={isOwner}
          onInvite={t.invite}
          onCancelInvite={(inviteId) => safely(() => t.cancelInvite(inviteId))}
          onRemoveMember={(userId) => safely(async () => {
            await t.removeMember(userId);
            if (userId === user.id) navigate('/viagens');
          })}
          onConfirm={setConfirm}
        />
      </div>

      <Modal isOpen={editingTrip} onClose={() => setEditingTrip(false)} title="Editar viagem">
        {editingTrip && (
          <TripForm
            initial={trip}
            onSubmit={async (fields) => { await t.updateTrip(fields); setEditingTrip(false); }}
            onCancel={() => setEditingTrip(false)}
            onDelete={askRemoveTrip}
          />
        )}
      </Modal>
      <TripShareModal
        isOpen={sharing}
        onClose={() => setSharing(false)}
        trip={trip}
        onShare={t.share}
        onStopSharing={t.stopSharing}
        onConfirm={setConfirm}
      />
      {/* Depois dos outros modais: a confirmação abre por cima deles. */}
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
