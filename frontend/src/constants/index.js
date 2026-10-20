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
/** Domínio usado nos links compartilhados (/pix, /extrato, /r). */
export const PUBLIC_APP_URL = window.location.origin;

// ── Web Push ────────────────────────────────────────────────────────────────
/**
 * Chave PÚBLICA VAPID (pode ficar no código). A privada fica só na Vercel
 * (VAPID_PRIVATE_KEY), usada por /api/push-notify. Trocar o par = trocar as duas.
 */
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BNy15qHq2BLrBpEmXkkdhYSqH230CWyOtbZwILPihNeeAl6bdV_aIMEB12v1firPtdT1SOaaDpL7OHJ9pxpRVYw';

// ── Cobranças ───────────────────────────────────────────────────────────────
/** Sem lembrete há ≥ N dias → "cobrar de novo". */
export const CHARGE_STALE_DAYS = 3;
/** Vence em ≤ N dias → entra como "vence em breve". */
export const CHARGE_DUE_SOON_DAYS = 3;
/** Validade do link público do extrato (/extrato/:code), em dias. */
export const SHARE_LINK_DAYS = 90;
/** Teto de parcelas numa cobrança parcelada. */
export const MAX_INSTALLMENTS = 48;
/** localStorage: último dia em que a notificação de cobranças disparou. */
export const CHARGE_NOTIFY_STORAGE_KEY = 'cofre_cobr_notif';

// ── Comprovantes (metas e pagamentos de cobrança) ───────────────────────────
// Mesmas regras dos buckets no Supabase (allowed_mime_types e 5 MB).
export const RECEIPT_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
/** Valor do `accept` do <input type="file">. Sem HEIC: o iOS converte a foto pra JPEG. */
export const RECEIPT_ACCEPT = Object.keys(RECEIPT_EXT).join(',');

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
