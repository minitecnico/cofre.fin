/**
 * Código aleatório para links públicos (/r/:code, /pix/:code).
 *
 * Por que existe: esses links são resolvidos por RPCs `security definer`
 * liberadas pro `anon`, então o código É a credencial de acesso. Duas armadilhas
 * que isso evita:
 *
 *   1. Código DERIVADO de algo que o destinatário conhece (ex.: hash do path,
 *      que embute user_id + mês) — quem recebe um link calcula os outros.
 *   2. `Math.random()`, que não é CSPRNG: o gerador do V8 é reconstruível a
 *      partir de saídas observadas.
 *
 * Usa `crypto.getRandomValues` e mapeia 5 bits por byte num alfabeto de 32
 * caracteres — 16 chars = 80 bits, sem viés de módulo. Alfabeto sem `l`/`o`
 * pra não confundir com `1`/`0` quando alguém digita o link à mão.
 */

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 chars

export function randomLinkCode(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] & 31];
  return out;
}
