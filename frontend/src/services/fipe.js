/**
 * Tabela FIPE — consulta à API pública do projeto deividfortuna/fipe
 * (https://github.com/deividfortuna/fipe), v1 em parallelum.com.br.
 *
 * Sem token: 500 consultas por dia por IP. Não passa pelo Supabase — é dado
 * público, só leitura. O domínio está liberado no connect-src da CSP
 * (vercel.json).
 *
 * Fluxo: marcas → modelos → anos → preço. Os códigos vêm da própria API.
 */

import { todayISO } from '../utils/format';

const BASE = 'https://parallelum.com.br/fipe/api/v1';

/** Limite diário sem token (por IP). */
export const FIPE_DAILY_LIMIT = 500;

/**
 * Contador local de consultas do dia. A API manda o saldo real no header
 * x-ratelimit-remaining, mas não o expõe via CORS — então contamos aqui.
 * É por aparelho (o limite é por IP), e zera na virada do dia.
 */
const COUNTER_KEY = 'cofre_fipe_requests';

function readCounter() {
  try {
    const c = JSON.parse(localStorage.getItem(COUNTER_KEY));
    return c?.day === todayISO() ? c.count : 0;
  } catch {
    return 0;
  }
}

function bumpCounter() {
  try {
    localStorage.setItem(COUNTER_KEY, JSON.stringify({ day: todayISO(), count: readCounter() + 1 }));
  } catch { /* sem storage: só não conta */ }
}

/** Tipos aceitos pela API (segmento da URL) + rótulo pt-BR. */
export const FIPE_VEHICLE_TYPES = [
  { value: 'carros', label: 'Carros' },
  { value: 'motos', label: 'Motos' },
  { value: 'caminhoes', label: 'Caminhões' },
];

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  bumpCounter();
  if (res.status === 429) throw new Error('Limite diário de consultas FIPE atingido. Tente amanhã.');
  if (!res.ok) throw new Error('Não foi possível consultar a Tabela FIPE agora.');
  return res.json();
}

export const fipeService = {
  /** Consultas feitas hoje neste aparelho. */
  usedToday: readCounter,

  /** [{ codigo, nome }] */
  brands(type) {
    return get(`/${type}/marcas`);
  },

  /** [{ codigo, nome }] — a API embrulha em { modelos, anos }. */
  async models(type, brand) {
    const data = await get(`/${type}/marcas/${brand}/modelos`);
    return data.modelos || [];
  },

  /** [{ codigo: '2014-3', nome: '2014 Diesel' }] */
  years(type, brand, model) {
    return get(`/${type}/marcas/${brand}/modelos/${model}/anos`);
  },

  /** { Valor, Marca, Modelo, AnoModelo, Combustivel, CodigoFipe, MesReferencia, ... } */
  price(type, brand, model, year) {
    return get(`/${type}/marcas/${brand}/modelos/${model}/anos/${year}`);
  },
};
