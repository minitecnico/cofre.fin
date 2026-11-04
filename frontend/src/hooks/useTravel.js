import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { tripService, travelOutbox, travelCache, isNetworkError } from '../services/travel';

/**
 * Lista de viagens. Sem internet mostra a última lista salva no aparelho
 * (`offline` = true).
 */
export function useTrips() {
  const { user } = useAuth();
  const key = `${user.id}:trips`;
  const [trips, setTrips] = useState(() => travelCache.read(key));
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const list = await tripService.list();
      travelCache.write(key, list);
      setTrips(list);
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

  return { trips, offline, error, create };
}

/**
 * Uma viagem: dados + gastos + lugares (todos os da pessoa — cada um com o
 * `trip_id` em que foi marcado), com o que está na fila offline misturado
 * (`pending: true`). Ao abrir e quando a rede volta, envia a fila e
 * recarrega. Lugar/gasto novo salvo com sucesso entra direto na lista local
 * (e no cache) — com sinal fraco o recarregar pode falhar e ele não sumiria.
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

  const places = useMemo(() => [
    ...(data?.places || []),
    ...queue.filter((i) => i.table === 'trip_places').map((i) => ({ ...i.row, pending: true, sendError: i.error })),
  ], [data, queue]);

  const expenses = useMemo(() => [
    ...queue.filter((i) => i.table === 'transactions').map((i) => ({
      ...i.row,
      pending: true,
      sendError: i.error,
      category: data?.categories.find((c) => c.id === i.row.category_id) || null,
    })),
    ...(data?.expenses || []),
  ], [data, queue]);

  const withCategory = (row) => ({ ...row, category: data?.categories.find((c) => c.id === row.category_id) || null });

  /** @returns {Promise<boolean>} true = ficou na fila (sem internet) */
  async function addPlace(fields) {
    const row = { id: crypto.randomUUID(), user_id: user.id, trip_id: tripId, ...fields };
    const { queued } = await tripService.addPlace(row);
    if (queued) syncQueue();
    else patchLocal((d) => ({ ...d, places: [...d.places, row] }));
    return queued;
  }

  async function updatePlace(item, fields) {
    if (item.pending) {
      travelOutbox.update(item.id, fields);
      syncQueue();
      return;
    }
    await tripService.updatePlace(item.id, fields);
    patchLocal((d) => ({ ...d, places: d.places.map((p) => (p.id === item.id ? { ...p, ...fields } : p)) }));
  }

  /** @returns {Promise<boolean>} true = ficou na fila (sem internet) */
  async function addExpense(fields) {
    const row = { id: crypto.randomUUID(), user_id: user.id, trip_id: tripId, ...fields };
    const { queued } = await tripService.addExpense(row);
    if (queued) syncQueue();
    else patchLocal((d) => ({ ...d, expenses: [withCategory(row), ...d.expenses] }));
    return queued;
  }

  async function updateExpense(item, fields) {
    if (item.pending) {
      travelOutbox.update(item.id, fields);
      syncQueue();
      return;
    }
    await tripService.updateExpense(item.id, fields);
    patchLocal((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === item.id ? withCategory({ ...e, ...fields }) : e)) }));
  }

  /** Item da fila só sai do aparelho; o já enviado é apagado no banco. */
  async function remove(item, kind) {
    if (item.pending) {
      travelOutbox.discard(item.id);
      syncQueue();
      return;
    }
    if (kind === 'place') {
      await tripService.removePlace(item.id);
      patchLocal((d) => ({ ...d, places: d.places.filter((p) => p.id !== item.id) }));
    } else {
      await tripService.removeExpense(item.id);
      patchLocal((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== item.id) }));
    }
  }

  async function updateTrip(fields) {
    const trip = await tripService.update(tripId, fields);
    patchLocal((d) => ({ ...d, trip }));
  }

  async function removeTrip() {
    await tripService.remove(tripId);
    travelCache.remove(key);
  }

  return {
    data, places, expenses, queued: queue.length, offline, error, refresh,
    addPlace, updatePlace, addExpense, updateExpense, remove, updateTrip, removeTrip,
  };
}
