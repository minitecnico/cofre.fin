import { useCallback, useEffect, useState } from 'react';
import { announcementService } from '../services/comms';

/**
 * Aviso da central do administrador pra mostrar no topo do app. Busca ao abrir
 * e quando o app volta pro primeiro plano (PWA fica dias aberto em segundo
 * plano). Sem internet ou sem a migration: simplesmente não mostra nada.
 */
export function useAnnouncements() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => announcementService.mine().then((list) => alive && setItems(list)).catch(() => {});
    const onVisible = () => document.visibilityState === 'visible' && load();
    load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Some na hora; se o registro falhar, o aviso volta na próxima abertura.
  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((a) => a.id !== id));
    announcementService.dismiss(id).catch(() => {});
  }, []);

  return { announcement: items[0] || null, dismiss };
}
