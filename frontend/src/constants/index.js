/**
 * Constantes do app — valores fixos compartilhados entre páginas, services e
 * componentes. Centralizar aqui evita "número mágico" espalhado e garante que
 * a mesma regra (ex.: quando uma cobrança fica "parada") valha em todo lugar.
 *
 * Catálogo de bancos (logos) fica em `./banks.js`.
 */

// ── Tempo ───────────────────────────────────────────────────────────────────
export const DAY_MS = 86400000;

// ── Links públicos ──────────────────────────────────────────────────────────
/**
 * Domínio usado nos links compartilhados (/pix, /extrato, /r).
 * No APK (Capacitor) a origem é https://localhost, que não abre no celular de
 * quem recebe — por isso o domínio publicado (VITE_API_BASE_URL) tem prioridade.
 */
export const PUBLIC_APP_URL = (import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/\/+$/, '');

// ── Cobranças ───────────────────────────────────────────────────────────────
/** Sem lembrete há ≥ N dias → "cobrar de novo". */
export const CHARGE_STALE_DAYS = 3;
/** Vence em ≤ N dias → entra como "vence em breve". */
export const CHARGE_DUE_SOON_DAYS = 3;
/** Teto de parcelas numa cobrança parcelada. */
export const MAX_INSTALLMENTS = 48;
/** localStorage: último dia em que a notificação de cobranças disparou. */
export const CHARGE_NOTIFY_STORAGE_KEY = 'cofre_cobr_notif';

// ── PIX ─────────────────────────────────────────────────────────────────────
export const PIX_KEY_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'random', label: 'Aleatória' },
];

// ── Cartões ─────────────────────────────────────────────────────────────────
export const CARD_BRANDS = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'elo', label: 'Elo' },
  { value: 'amex', label: 'American Express' },
  { value: 'hipercard', label: 'Hipercard' },
  { value: 'other', label: 'Outro' },
];

export const CARD_PRESET_COLORS = ['#820ad1', '#ff7a00', '#1e293b', '#dc2626', '#16a34a', '#0ea5e9', '#f59e0b'];

// ── Assistente IA ───────────────────────────────────────────────────────────
export const MAX_AI_ATTACHMENTS = 4;
