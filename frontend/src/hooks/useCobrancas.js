import { useState, useEffect, useCallback, useMemo } from 'react';
import { debtorService, chargeService, settingsService } from '../services/cobrancas';

/**
 * Hook central da página de Cobranças.
 *
 * Carrega em paralelo: resumo por devedor (RPC), todas as cobranças (com devedor
 * embutido) e a config PIX do usuário. Expõe ações que mutam e recarregam.
 *
 * Mantemos a lista crua de cobranças no cliente e agrupamos por devedor via
 * useMemo — barato pro volume esperado (uso pessoal).
 */
export function useCobrancas() {
  const [summary, setSummary] = useState([]);    // resumo por devedor (RPC)
  const [charges, setCharges] = useState([]);     // todas as cobranças
  const [pix, setPix] = useState(null);           // config PIX (ou null)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [sum, chg, settings] = await Promise.all([
        debtorService.summary(),
        chargeService.list(),
        settingsService.get(),
      ]);
      setSummary(sum);
      setCharges(chg);
      setPix(settings);
    } catch (err) {
      console.error(err);
      setError('Não foi possível carregar as cobranças.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Agrupa cobranças por devedor
  const chargesByDebtor = useMemo(() => {
    const map = new Map();
    for (const c of charges) {
      const arr = map.get(c.debtor_id) || [];
      arr.push(c);
      map.set(c.debtor_id, arr);
    }
    return map;
  }, [charges]);

  // Totais globais
  const totals = useMemo(() => {
    const open = summary.reduce((s, d) => s + d.openAmount, 0);
    const overdue = summary.reduce((s, d) => s + d.overdueAmount, 0);
    const paid = summary.reduce((s, d) => s + d.paidAmount, 0);
    return { open, overdue, paid };
  }, [summary]);

  // ── Ações (mutam + recarregam) ──────────────────────────────
  const addDebtor = useCallback(async (payload) => {
    await debtorService.create(payload);
    await load();
  }, [load]);

  const updateDebtor = useCallback(async (id, patch) => {
    await debtorService.update(id, patch);
    await load();
  }, [load]);

  const removeDebtor = useCallback(async (id) => {
    await debtorService.remove(id);
    await load();
  }, [load]);

  const addCharge = useCallback(async (payload) => {
    await chargeService.create(payload);
    await load();
  }, [load]);

  const addInstallments = useCallback(async (payload) => {
    await chargeService.createInstallments(payload);
    await load();
  }, [load]);

  const updateCharge = useCallback(async (id, patch) => {
    await chargeService.update(id, patch);
    await load();
  }, [load]);

  const setChargePaid = useCallback(async (id, paid) => {
    await chargeService.setPaid(id, paid);
    await load();
  }, [load]);

  const removeCharge = useCallback(async (id) => {
    await chargeService.remove(id);
    await load();
  }, [load]);

  const savePix = useCallback(async (payload) => {
    await settingsService.savePix(payload);
    setPix({
      pixKey: payload.pixKey || '',
      pixKeyType: payload.pixKeyType || '',
      pixName: payload.pixName || '',
      pixCity: payload.pixCity || '',
    });
  }, []);

  return {
    summary, charges, chargesByDebtor, pix, totals, loading, error,
    reload: load,
    addDebtor, updateDebtor, removeDebtor,
    addCharge, addInstallments, updateCharge, setChargePaid, removeCharge,
    savePix,
  };
}
