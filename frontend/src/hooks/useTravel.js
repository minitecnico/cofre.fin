import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { tripService, travelOutbox, travelCache, isNetworkError } from '../services/travel';

/**
 * Lista de viagens (próprias e as que a pessoa participa) + convites
 * recebidos. Sem internet mostra a última lista salva no aparelho.
 */
export function useTrips() {
  const { user } = useAuth();
  const key = `${user.id}:trips`;
  const [trips, setTrips] = useState(() => travelCache.read(key));
  const [invites, setInvites] = useState([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [list, received] = await Promise.all([tripService.list(), tripService.myInvites()]);
      travelCache.write(key, list);
      setTrips(list);
      setInvites(received);
      setOffline(false);
      setError(null);
    } catch (err) {
      if (isNetworkError(err)) setOffline(true);
      else setError(err.message);
    }
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);

  async function create(fields) {
    const trip = await tripService.create(fields);
    refresh();
    return trip;
  }

  async function respondInvite(id, accept) {
    await tripService.respondInvite(id, accept);
    await refresh();
  }

  return { trips, invites, offline, error, create, respondInvite };
}

/**
 * Uma viagem: dados, gastos, viajantes e convites, com o que está na fila
 * offline misturado (`pending: true`). Ao abrir e quando a rede volta, envia
 * a fila e recarrega. Gasto novo salvo com sucesso entra direto na lista
 * local (e no cache) — com sinal fraco o recarregar pode falhar e ele não sumiria.
 */
export function useTrip(tripId) {
  const { user } = useAuth();
  const key = `${user.id}:${tripId}`;
  const [data, setData] = useState(() => travelCache.read(key));
  const [queue, setQueue] = useState(() => travelOutbox.forTrip(user.id, tripId));
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);

  const syncQueue = useCallback(() => setQueue(travelOutbox.forTrip(user.id, tripId)), [user.id, tripId]);

  const refresh = useCallback(async () => {
    try {
      await travelOutbox.flush();
      const fresh = await tripService.details(tripId);
      travelCache.write(key, fresh);
      setData(fresh);
      setOffline(false);
      setError(null);
    } catch (err) {
      if (isNetworkError(err)) setOffline(true);
      else setError(err.message);
    } finally {
      syncQueue();
    }
  }, [key, tripId, syncQueue]);

  useEffect(() => {
    refresh();
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [refresh]);

  /** Altera a cópia local e o cache juntos. */
  const patchLocal = useCallback((update) => {
    setData((d) => {
      const next = update(d);
      travelCache.write(key, next);
      return next;
    });
  }, [key]);

  const expenses = useMemo(() => [
    ...queue.filter((i) => i.table === 'trip_expenses').map((i) => ({ ...i.row, pending: true, sendError: i.error })),
    ...(data?.expenses || []),
  ], [data, queue]);

  /** @returns {Promise<boolean>} true = ficou na fila (sem internet) */
  async function addExpense(fields) {
    const row = { id: crypto.randomUUID(), user_id: user.id, trip_id: tripId, ...fields };
    const { queued } = await tripService.addExpense(row);
    if (queued) syncQueue();
    else patchLocal((d) => ({ ...d, expenses: [row, ...d.expenses] }));
    return queued;
  }

  async function updateExpense(item, fields) {
    if (item.pending) {
      travelOutbox.update(item.id, fields);
      syncQueue();
      return;
    }
    await tripService.updateExpense(item.id, fields);
    patchLocal((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === item.id ? { ...e, ...fields } : e)) }));
  }

  /** Item da fila só sai do aparelho; o já enviado é apagado no banco. */
  async function removeExpense(item) {
    if (item.pending) {
      travelOutbox.discard(item.id);
      syncQueue();
      return;
    }
    await tripService.removeExpense(item.id);
    patchLocal((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== item.id) }));
  }

  async function updateTrip(fields) {
    const trip = await tripService.update(tripId, fields);
    patchLocal((d) => ({ ...d, trip }));
  }

  async function removeTrip() {
    await tripService.remove(tripId);
    travelCache.remove(key);
  }

  async function invite(nick) {
    await tripService.invite(tripId, nick);
    await refresh();
  }

  async function cancelInvite(id) {
    await tripService.cancelInvite(id);
    patchLocal((d) => ({ ...d, invites: d.invites.filter((i) => i.id !== id) }));
  }

  /** Dono remove alguém, ou o próprio viajante sai (aí some da lista dele). */
  async function removeMember(userId) {
    await tripService.removeMember(tripId, userId);
    if (userId === user.id) travelCache.remove(key);
    else patchLocal((d) => ({ ...d, members: d.members.filter((m) => m.user_id !== userId) }));
  }

  /** @returns {Promise<string>} código do link público */
  async function share(options) {
    const code = await tripService.share(tripId, options);
    patchLocal((d) => ({ ...d, trip: { ...d.trip, share_code: code } }));
    return code;
  }

  async function stopSharing() {
    await tripService.stopSharing(tripId);
    patchLocal((d) => ({ ...d, trip: { ...d.trip, share_code: null } }));
  }

  return {
    trip: data?.trip || null,
    // `|| []`: cache salvo pela versão anterior não tinha viajantes/convites.
    members: data?.members || [],
    invites: data?.invites || [],
    cards: data?.cards || [],
    expenses,
    queued: expenses.filter((e) => e.pending).length,
    offline,
    error,
    isOwner: data?.trip?.user_id === user.id,
    addExpense, updateExpense, removeExpense, updateTrip, removeTrip,
    invite, cancelInvite, removeMember, share, stopSharing,
  };
}
