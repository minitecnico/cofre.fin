import { useState, useEffect, useCallback, useMemo } from 'react';
import { debtorService, chargeService, pixKeyService } from '../services/cobrancas';

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
  const [pixKeys, setPixKeys] = useState([]);     // chaves PIX cadastradas
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [sum, chg, keys] = await Promise.all([
        debtorService.summary(),
        chargeService.list(),
        pixKeyService.list(),
      ]);
      setSummary(sum);
      setCharges(chg);
      setPixKeys(keys);
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

  // ── Chaves PIX ──────────────────────────────────────────────
  const addPixKey = useCallback(async (payload) => {
    await pixKeyService.create(payload);
    await load();
  }, [load]);

  const removePixKey = useCallback(async (id) => {
    await pixKeyService.remove(id);
    await load();
  }, [load]);

  const setDefaultPixKey = useCallback(async (id) => {
    await pixKeyService.setDefault(id);
    await load();
  }, [load]);

  // Chave ativa (padrão, ou a 1ª) + objeto de compatibilidade { pixKey, ... }
  const activePixKey = useMemo(
    () => pixKeys.find((k) => k.is_default) || pixKeys[0] || null,
    [pixKeys]
  );
  const pix = useMemo(() => (activePixKey ? {
    pixKey: activePixKey.key,
    pixKeyType: activePixKey.key_type,
    pixName: activePixKey.name,
    pixCity: activePixKey.city,
  } : null), [activePixKey]);

  return {
    summary, charges, chargesByDebtor, pixKeys, activePixKey, pix, totals, loading, error,
    reload: load,
    addDebtor, updateDebtor, removeDebtor,
    addCharge, addInstallments, updateCharge, setChargePaid, removeCharge,
    addPixKey, removePixKey, setDefaultPixKey,
  };
}
