/**
 * Catálogo de bancos que operam no Brasil (tradicionais e digitais).
 *
 * `id` é a chave do ícone na lib `@edusites/bancos-brasil` (ver BankLogo).
 * `color` é a cor da marca — usada pra pré-preencher a cor do cartão.
 * `aliases` são formas comuns de escrever o nome; `findBank` casa qualquer uma
 * delas como palavra dentro de um texto livre ("Nubank Roxinho", "Itaú PJ").
 * `android` é o pacote do app na Play Store — usado no extrato público pra
 * abrir o app do banco do devedor depois que ele copia o PIX.
 */
export const BANKS = [
  // Tradicionais
  { id: 'bancodobrasil', name: 'Banco do Brasil', color: '#003D7A', aliases: ['banco do brasil', 'bb'], android: 'br.com.bb.android' },
  { id: 'caixa', name: 'Caixa', color: '#0066A1', aliases: ['caixa', 'caixa economica', 'cef'], android: 'br.com.gabba.Caixa' },
  { id: 'itau', name: 'Itaú', color: '#EC7000', aliases: ['itau', 'personnalite'], android: 'com.itau' },
  { id: 'bradesco', name: 'Bradesco', color: '#CC092F', aliases: ['bradesco'], android: 'com.bradesco' },
  { id: 'santander', name: 'Santander', color: '#EC0000', aliases: ['santander'], android: 'com.santander.app' },
  { id: 'safra', name: 'Safra', color: '#151D43', aliases: ['safra'] },
  { id: 'sicoob', name: 'Sicoob', color: '#003B43', aliases: ['sicoob'] },
  { id: 'sicredi', name: 'Sicredi', color: '#3FA110', aliases: ['sicredi'] },
  { id: 'mercantil', name: 'Mercantil do Brasil', color: '#1526FF', aliases: ['mercantil'] },
  { id: 'bmg', name: 'BMG', color: '#F26321', aliases: ['bmg'] },
  { id: 'pan', name: 'Banco Pan', color: '#00AFFF', aliases: ['pan', 'banco pan'] },
  { id: 'bv', name: 'BV', color: '#1B3B8C', aliases: ['bv', 'banco bv', 'votorantim'] },
  { id: 'original', name: 'Original', color: '#00A857', aliases: ['original', 'banco original'] },
  { id: 'agibank', name: 'Agibank', color: '#0133B0', aliases: ['agibank', 'agiplan'] },
  { id: 'btg', name: 'BTG Pactual', color: '#001E62', aliases: ['btg', 'btg pactual'] },
  { id: 'xp', name: 'XP', color: '#111111', aliases: ['xp', 'xp investimentos'] },
  { id: 'rico', name: 'Rico', color: '#010042', aliases: ['rico'] },
  // Digitais
  { id: 'nubank', name: 'Nubank', color: '#820AD1', aliases: ['nubank', 'nu', 'roxinho'], android: 'com.nu.production' },
  { id: 'inter', name: 'Inter', color: '#FF7A00', aliases: ['inter', 'banco inter'], android: 'br.com.intermedium' },
  { id: 'c6', name: 'C6 Bank', color: '#121212', aliases: ['c6', 'c6 bank'], android: 'com.c6bank.app' },
  { id: 'next', name: 'Next', color: '#00C850', aliases: ['next'] },
  { id: 'neon', name: 'Neon', color: '#161C3E', aliases: ['neon'], android: 'br.com.neon' },
  { id: 'digio', name: 'Digio', color: '#00275C', aliases: ['digio'] },
  { id: 'bs2', name: 'BS2', color: '#0021AF', aliases: ['bs2'] },
  { id: 'cora', name: 'Cora', color: '#FE3E6D', aliases: ['cora'] },
  { id: 'picpay', name: 'PicPay', color: '#21C25E', aliases: ['picpay'], android: 'com.picpay' },
  { id: 'mercadopago', name: 'Mercado Pago', color: '#00BCFF', aliases: ['mercado pago', 'mercadopago', 'mercado livre'], android: 'com.mercadopago.wallet' },
  { id: 'pagbank', name: 'PagBank', color: '#42A936', aliases: ['pagbank', 'pagseguro'], android: 'br.com.uol.ps.myaccount' },
  { id: 'infinitepay', name: 'InfinitePay', color: '#171527', aliases: ['infinitepay', 'infinite pay'] },
  { id: 'stone', name: 'Stone', color: '#00A868', aliases: ['stone'] },
  { id: 'ton', name: 'Ton', color: '#0DEA4A', aliases: ['ton'] },
  { id: 'efibank', name: 'Efí Bank', color: '#F37021', aliases: ['efi', 'efi bank', 'gerencianet'] },
  { id: 'asaas', name: 'Asaas', color: '#0036E1', aliases: ['asaas'] },
  { id: 'iugu', name: 'iugu', color: '#1F2937', aliases: ['iugu'] },
  { id: 'ngcash', name: 'NG.CASH', color: '#000000', aliases: ['ngcash', 'ng cash', 'ng.cash'] },
  // Internacionais com operação no Brasil
  { id: 'nomad', name: 'Nomad', color: '#FFCE04', aliases: ['nomad'] },
  { id: 'avenue', name: 'Avenue', color: '#002820', aliases: ['avenue'] },
  { id: 'wise', name: 'Wise', color: '#9FE870', aliases: ['wise'] },
  { id: 'revolut', name: 'Revolut', color: '#000000', aliases: ['revolut'] },
  { id: 'paypal', name: 'PayPal', color: '#003087', aliases: ['paypal'] },
  { id: 'stripe', name: 'Stripe', color: '#635BFF', aliases: ['stripe'] },
];

const BY_ID = new Map(BANKS.map((b) => [b.id, b]));

function normalize(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').trim();
}

// Aliases mais longos primeiro: "banco do brasil" ganha de "brasil"/"bb" etc.
const ALIASES = BANKS
  .flatMap((b) => b.aliases.map((a) => ({ alias: normalize(a), bank: b })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function getBank(id) {
  return BY_ID.get(id) || null;
}

/** Descobre o banco a partir de um texto livre (nome do cartão, apelido da chave PIX). */
export function findBank(text) {
  const padded = ` ${normalize(text)} `;
  if (padded.trim() === '') return null;
  const hit = ALIASES.find(({ alias }) => padded.includes(` ${alias} `));
  return hit ? hit.bank : null;
}

/** Bancos com app Android conhecido (atalho "abrir meu banco" no extrato). */
export const BANKS_WITH_APP = BANKS.filter((b) => b.android);
