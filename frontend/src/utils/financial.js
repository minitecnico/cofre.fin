import { fv, pmt as pmtFn, nper, rate as rateFn } from 'financial';

/**
 * Utilitários financeiros pro Cofre, usando a lib `financial`.
 * --------------------------------------------------------------
 * Convenção de sinais (igual Excel/financial):
 *   - Dinheiro SAINDO do bolso é negativo (pv, pmt quando você guarda).
 *   - Dinheiro ENTRANDO é positivo (fv quando você vai receber/acumular).
 *
 * Aqui escondemos isso do chamador: as funções recebem TODOS os valores
 * positivos (R$ alvo, R$ mensal, R$ inicial), tratam os sinais internamente
 * e retornam números positivos legíveis pra UI.
 *
 * Todas as taxas são MENSAIS em forma decimal (0.005 = 0,5% a.m.).
 */

/**
 * Quanto preciso guardar POR MÊS para atingir um valor alvo no prazo informado.
 *
 * @param {number} valorAlvo - Valor que quero ter no final (ex: 10000 = R$ 10.000).
 * @param {number} meses - Em quantos meses (ex: 24).
 * @param {number} [taxaMensal=0] - Taxa de juros mensal em decimal (0.005 = 0,5%).
 * @returns {number} Valor mensal a guardar (positivo, em reais).
 *                   Retorna 0 se meses <= 0 ou alvo <= 0.
 *
 * @example
 * calcularValorMensalParaMeta(10000, 24, 0.005); // ~393.21
 * calcularValorMensalParaMeta(12000, 12, 0);     // 1000 (sem juros)
 */
export function calcularValorMensalParaMeta(valorAlvo, meses, taxaMensal = 0) {
  if (!Number.isFinite(valorAlvo) || valorAlvo <= 0) return 0;
  if (!Number.isFinite(meses) || meses <= 0) return 0;
  // pmt(rate, nper, pv, fv): pv=0 (começa do zero), fv=valorAlvo (vou receber).
  // Resultado vem negativo (saída do bolso) — invertemos.
  const p = pmtFn(taxaMensal, meses, 0, valorAlvo);
  if (!Number.isFinite(p)) return 0;
  return Math.abs(p);
}

/**
 * Em quantos MESES atinjo o valor alvo guardando um valor fixo por mês.
 *
 * @param {number} valorAlvo - Valor que quero ter no final (ex: 10000).
 * @param {number} valorMensal - Quanto guardo por mês (ex: 400).
 * @param {number} [taxaMensal=0] - Taxa de juros mensal em decimal (0.005 = 0,5%).
 * @returns {number} Número de meses, arredondado pra cima (Math.ceil).
 *                   Retorna Infinity se for impossível (ex: valorMensal=0
 *                   com taxa zero), ou 0 se parâmetros inválidos.
 *
 * @example
 * calcularTempoParaMeta(10000, 400, 0.005); // 24 (meses)
 * calcularTempoParaMeta(12000, 1000, 0);    // 12
 */
export function calcularTempoParaMeta(valorAlvo, valorMensal, taxaMensal = 0) {
  if (!Number.isFinite(valorAlvo) || valorAlvo <= 0) return 0;
  if (!Number.isFinite(valorMensal) || valorMensal <= 0) return Infinity;
  // nper(rate, pmt, pv, fv): pmt negativo (saída), pv=0, fv=alvo (entrada futura).
  const n = nper(taxaMensal, -valorMensal, 0, valorAlvo);
  if (!Number.isFinite(n) || n < 0) return Infinity;
  return Math.ceil(n);
}

/**
 * Calcula a parcela de um empréstimo/financiamento pela Tabela Price
 * (parcelas fixas com juros compostos).
 *
 * @param {number} valorFinanciado - PV: quanto você pegou emprestado (ex: 50000).
 * @param {number} meses - Total de parcelas (ex: 60).
 * @param {number} [taxaMensal=0] - Taxa de juros mensal em decimal (0.015 = 1,5%).
 *                                  Se 0, faz divisão simples (sem juros).
 * @returns {number} Valor da parcela mensal (positivo, em reais).
 *                   0 se parâmetros inválidos.
 *
 * @example
 * calcularParcelaEmprestimo(10000, 60, 0.01);  // ~222.44 (1% a.m.)
 * calcularParcelaEmprestimo(50000, 60, 0.015); // ~1269.06 (1,5% a.m.)
 * calcularParcelaEmprestimo(12000, 12, 0);     // 1000 (sem juros)
 */
export function calcularParcelaEmprestimo(valorFinanciado, meses, taxaMensal = 0) {
  if (!Number.isFinite(valorFinanciado) || valorFinanciado <= 0) return 0;
  if (!Number.isFinite(meses) || meses <= 0) return 0;
  if (!taxaMensal || taxaMensal === 0) return valorFinanciado / meses;
  // pmt(rate, nper, pv, fv): pv positivo (você deve), fv=0 (quita no fim).
  // Resultado vem negativo (saída) — invertemos pro chamador.
  const p = pmtFn(taxaMensal, meses, valorFinanciado, 0);
  if (!Number.isFinite(p)) return 0;
  return Math.abs(p);
}

/**
 * Taxa mensal embutida num empréstimo de parcela fixa (inverso da Tabela Price).
 * Usado quando a pessoa sabe a parcela e quanto recebeu, mas não a taxa.
 *
 * @param {number} valorRecebido - PV: quanto entrou no bolso (ex: 25000).
 * @param {number} meses - Número de parcelas (ex: 45).
 * @param {number} parcela - Valor fixo de cada parcela (ex: 800).
 * @returns {number|null} Taxa mensal em decimal (0.0123 = 1,23% a.m.); 0 se a
 *          soma das parcelas não passa do recebido; null se não der pra calcular.
 *
 * @example
 * calcularTaxaEmprestimo(10000, 60, 222.44); // ~0.01 (1% a.m.)
 */
export function calcularTaxaEmprestimo(valorRecebido, meses, parcela) {
  if (!(valorRecebido > 0) || !(meses > 0) || !(parcela > 0)) return null;
  if (parcela * meses <= valorRecebido) return 0;
  const r = rateFn(meses, -parcela, valorRecebido, 0);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * Quanto vou ter no final, dado um valor inicial + aporte mensal + tempo + taxa.
 *
 * @param {number} valorInicial - Quanto já tenho hoje (ex: 1500). Pode ser 0.
 * @param {number} valorMensal - Quanto guardo por mês (ex: 400).
 * @param {number} meses - Por quantos meses (ex: 24).
 * @param {number} taxaMensal - Taxa de juros mensal em decimal (0.005 = 0,5%).
 * @returns {number} Valor acumulado no final (positivo, em reais).
 *
 * @example
 * calcularRendimentoFinal(1500, 400, 24, 0.005); // ~11_800 (≈)
 * calcularRendimentoFinal(0, 1000, 12, 0);       // 12000 (sem juros)
 */
export function calcularRendimentoFinal(valorInicial, valorMensal, meses, taxaMensal) {
  if (!Number.isFinite(meses) || meses <= 0) return Number(valorInicial) || 0;
  const pv = Number(valorInicial) || 0;
  const pmtVal = Number(valorMensal) || 0;
  const rate = Number(taxaMensal) || 0;
  // fv(rate, nper, pmt, pv): pmt e pv negativos (saídas), fv volta positivo.
  const f = fv(rate, meses, -pmtVal, -pv);
  if (!Number.isFinite(f)) return 0;
  return f;
}
