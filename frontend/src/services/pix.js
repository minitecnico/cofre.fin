import QRCode from 'qrcode';

/**
 * PIX — geração de "copia e cola" (BR Code / payload EMV) e QR Code.
 *
 * Segue a spec do BACEN (Manual do BR Code / EMV MPM). O payload é um conjunto
 * de campos TLV (id + tamanho + valor) terminado por um CRC16.
 *
 * Tudo client-side: a chave PIX é do próprio usuário (quem recebe), então não há
 * segredo a esconder — o copia-e-cola é justamente pra ser compartilhado.
 *
 * Uso:
 *   const brcode = buildPixPayload({ key, name, city, amount, txid });
 *   const dataUrl = await pixQrCodeDataUrl(brcode);
 */

/** Monta um campo EMV: id (2) + tamanho (2, zero à esquerda) + valor. */
function tlv(id, value) {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/** Remove acentos e caracteres fora do ASCII imprimível; corta no tamanho. */
function sanitize(text, maxLen) {
  const ascii = (text || '')
    .normalize('NFD')                // separa letra + acento; o filtro abaixo remove o acento
    .replace(/[^\x20-\x7E]/g, '')    // mantém só ASCII imprimível (tira acentos, emojis…)
    .trim()
    .toUpperCase();
  return ascii.slice(0, maxLen);
}

/**
 * CRC16-CCITT (poly 0x1021, init 0xFFFF) — exigido pelo campo 63 do BR Code.
 * Retorna 4 dígitos hex maiúsculos.
 */
function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Normaliza a chave PIX conforme o tipo, pro formato que o banco registrou.
 * Erro comum: telefone sem +55 ou CPF com pontuação → "chave não encontrada".
 *
 * @param {string} key
 * @param {string} [type] 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'
 */
export function normalizePixKey(key, type) {
  const raw = (key || '').trim();
  switch (type) {
    case 'cpf':
    case 'cnpj':
      return raw.replace(/\D/g, ''); // só dígitos
    case 'phone': {
      let d = raw.replace(/\D/g, '');
      if (d.startsWith('55') && d.length >= 12) return `+${d}`;     // já tem DDI
      if (d.length === 10 || d.length === 11) return `+55${d}`;     // DDD+numero
      return raw.startsWith('+') ? raw : `+${d}`;
    }
    case 'email':
      return raw.toLowerCase();
    default:
      return raw; // aleatória (EVP) e demais: como está
  }
}

/**
 * Gera o payload PIX (copia e cola).
 *
 * @param {Object} cfg
 * @param {string} cfg.key    chave PIX (cpf/cnpj/email/telefone/aleatória)
 * @param {string} [cfg.keyType] tipo da chave (normaliza o formato)
 * @param {string} cfg.name   nome do recebedor (máx 25)
 * @param {string} cfg.city   cidade do recebedor (máx 15)
 * @param {number} [cfg.amount] valor (opcional; se ausente, QR sem valor fixo)
 * @param {string} [cfg.txid]   identificador (opcional; padrão '***')
 * @returns {string} BR Code completo, com CRC
 */
export function buildPixPayload({ key, keyType, name, city, amount, txid }) {
  if (!key) throw new Error('Chave PIX obrigatória.');

  // Template 26 — conta do recebedor PIX
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', normalizePixKey(key, keyType));

  // Template 62 — dados adicionais (referência / txid)
  // Em PIX ESTÁTICO o txid deve ser '***' (não especificado). Bancos costumam
  // rejeitar txid customizado em QR estático. Sanitizamos pra A-Z0-9 (máx 25).
  const safeTxid = txid ? sanitize(txid, 25).replace(/[^A-Z0-9]/g, '') : '';
  const reference = tlv('05', safeTxid || '***');

  const hasAmount = amount != null && Number(amount) > 0;

  let payload =
    tlv('00', '01') +                              // Payload Format Indicator
    tlv('01', '11') +                              // 11 = PIX estático reutilizável
    tlv('26', merchantAccount) +
    tlv('52', '0000') +                            // Merchant Category Code
    tlv('53', '986') +                             // moeda BRL
    (hasAmount ? tlv('54', Number(amount).toFixed(2)) : '') +
    tlv('58', 'BR') +                              // país
    tlv('59', sanitize(name, 25) || 'RECEBEDOR') +
    tlv('60', sanitize(city, 15) || 'CIDADE') +
    tlv('62', reference);

  // CRC16 calculado sobre o payload + '6304'
  payload += '6304';
  return payload + crc16(payload);
}

/**
 * Gera o QR Code do payload PIX como data URL (PNG base64) pra usar em <img>.
 * @param {string} payload BR Code
 * @returns {Promise<string>} data URL
 */
export function pixQrCodeDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#18181b', light: '#ffffff' },
  });
}
