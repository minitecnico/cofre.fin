import { useMemo, useState } from 'react';
import { Calculator, Calendar, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency, parseAmount } from '../utils/format';
import {
  calcularValorMensalParaMeta,
  calcularTempoParaMeta,
  calcularRendimentoFinal,
} from '../utils/financial';

/**
 * Simulador de meta — calcula:
 *  - Modo "prazo": dado prazo, mostra quanto guardar por mês.
 *  - Modo "mensal": dado valor mensal, mostra em quantos meses bate a meta.
 *
 * Considera o que já foi guardado (current_amount) como aporte inicial:
 * o valor restante a alcançar é (target_amount - current_amount).
 *
 * Componente é PURO de cálculo — não chama service, não persiste.
 * Estilo segue o design system do CLAUDE.md (pills, hairline cards, accent verde-limão).
 */
export default function GoalSimulator({ goal }) {
  // Faltante: alvo - guardado. Se já passou, faltante = 0.
  const initial = Number(goal?.current_amount || 0);
  const initialTarget = Math.max(0, Number(goal?.target_amount || 0));

  // Sugere prazo default baseado no deadline da meta, se houver
  const defaultMeses = useMemo(() => {
    if (!goal?.deadline) return 12;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = goal.deadline.split('-').map(Number);
    const deadline = new Date(y, m - 1, d);
    const diffMonths = Math.max(1, Math.round((deadline - today) / (1000 * 60 * 60 * 24 * 30.4375)));
    return diffMonths;
  }, [goal?.deadline]);

  const [modo, setModo] = useState('prazo'); // 'prazo' | 'mensal'
  const [valorAlvo, setValorAlvo] = useState(String(initialTarget).replace('.', ','));
  const [meses, setMeses] = useState(String(defaultMeses));
  const [valorMensal, setValorMensal] = useState('500');
  const [taxa, setTaxa] = useState('0,5'); // % ao mês

  // Parse
  const alvoNum = parseAmount(valorAlvo);
  const mesesNum = parseInt(meses, 10) || 0;
  const mensalNum = parseAmount(valorMensal);
  const taxaDecimal = (parseAmount(taxa) || 0) / 100; // 0,5% -> 0.005

  // Valor que ainda falta atingir (considera o que já está guardado)
  const faltante = Math.max(0, alvoNum - initial);

  // Cálculos
  const resultadoMensal = useMemo(() => {
    if (modo !== 'prazo') return 0;
    return calcularValorMensalParaMeta(faltante, mesesNum, taxaDecimal);
  }, [modo, faltante, mesesNum, taxaDecimal]);

  const resultadoMeses = useMemo(() => {
    if (modo !== 'mensal') return 0;
    return calcularTempoParaMeta(faltante, mensalNum, taxaDecimal);
  }, [modo, faltante, mensalNum, taxaDecimal]);

  // Acumulado final pra preview (também já considera o que está guardado)
  const acumuladoFinal = useMemo(() => {
    if (modo === 'prazo') {
      return calcularRendimentoFinal(initial, resultadoMensal, mesesNum, taxaDecimal);
    }
    if (Number.isFinite(resultadoMeses)) {
      return calcularRendimentoFinal(initial, mensalNum, resultadoMeses, taxaDecimal);
    }
    return 0;
  }, [modo, initial, resultadoMensal, mensalNum, mesesNum, resultadoMeses, taxaDecimal]);

  // Validações pra mensagem amigável
  const podeCalcular =
    alvoNum > 0 &&
    (modo === 'prazo' ? mesesNum > 0 : mensalNum > 0);

  return (
    <div className="space-y-5">
      {/* Resumo da meta */}
      <div className="px-4 py-3 bg-surface-soft border border-hairline-light rounded-2xl">
        <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">Meta</p>
        <p className="font-display font-bold text-base md:text-lg mt-0.5 truncate">{goal?.title}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink-600">
          <span>
            Já guardado:{' '}
            <strong className="font-mono text-ink-900">{formatCurrency(initial)}</strong>
          </span>
          {initial > 0 && faltante > 0 && (
            <span>
              Falta:{' '}
              <strong className="font-mono text-ink-900">{formatCurrency(faltante)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Toggle de modo */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-surface-soft rounded-full">
        <button
          type="button"
          onClick={() => setModo('prazo')}
          className={`py-2.5 min-h-[44px] rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 ${
            modo === 'prazo'
              ? 'bg-ink-950 text-white shadow-soft'
              : 'bg-transparent text-ink-600 hover:text-ink-900'
          }`}
        >
          <Calendar className="inline w-4 h-4 mr-1.5 -mt-0.5" strokeWidth={2.25} />
          Definir prazo
        </button>
        <button
          type="button"
          onClick={() => setModo('mensal')}
          className={`py-2.5 min-h-[44px] rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 ${
            modo === 'mensal'
              ? 'bg-ink-950 text-white shadow-soft'
              : 'bg-transparent text-ink-600 hover:text-ink-900'
          }`}
        >
          <Wallet className="inline w-4 h-4 mr-1.5 -mt-0.5" strokeWidth={2.25} />
          Definir mensal
        </button>
      </div>

      {/* Inputs */}
      <div className="space-y-3">
        <div>
          <label className="label">Valor alvo</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={valorAlvo}
              onChange={(e) => setValorAlvo(e.target.value)}
              placeholder="10.000,00"
              className="input-field pl-11 font-mono text-right"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {modo === 'prazo' ? (
            <div>
              <label className="label">Prazo (meses)</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={meses}
                onChange={(e) => setMeses(e.target.value)}
                placeholder="24"
                className="input-field font-mono text-right"
              />
            </div>
          ) : (
            <div>
              <label className="label">Valor mensal</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorMensal}
                  onChange={(e) => setValorMensal(e.target.value)}
                  placeholder="500,00"
                  className="input-field pl-11 font-mono text-right"
                />
              </div>
            </div>
          )}

          <div>
            <label className="label">Taxa mensal (%)</label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={taxa}
                onChange={(e) => setTaxa(e.target.value)}
                placeholder="0,5"
                className="input-field pr-8 font-mono text-right"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Resultado — canvas dark com glow accent */}
      <div className="rounded-2xl bg-ink-950 text-white p-5 md:p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-accent/20 blur-2xl pointer-events-none" />

        <div className="relative flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
            <Calculator className="w-5 h-5 text-ink-950" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            {!podeCalcular ? (
              <p className="text-sm opacity-70">
                Informe valor alvo e {modo === 'prazo' ? 'prazo' : 'valor mensal'} pra simular.
              </p>
            ) : faltante === 0 ? (
              <p className="text-sm opacity-90 font-semibold">
                ✓ A meta já foi atingida com o que está guardado.
              </p>
            ) : modo === 'prazo' ? (
              (() => {
                const anos = mesesNum / 12;
                const anosLabel = mesesNum >= 12
                  ? (Number.isInteger(anos)
                      ? ` (${anos} ${anos === 1 ? 'ano' : 'anos'})`
                      : ` (${anos.toFixed(1).replace('.', ',')} anos)`)
                  : '';
                return (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-accent">
                      Você precisa guardar
                    </p>
                    <p className="font-display text-3xl md:text-4xl font-bold mt-1 tabular-nums tracking-display-tight">
                      {formatCurrency(resultadoMensal)}
                      <span className="text-base md:text-lg font-normal opacity-70 ml-1">/mês</span>
                    </p>
                    <p className="text-xs opacity-70 mt-2">
                      por <strong className="text-white">{mesesNum} meses{anosLabel}</strong>
                      {taxaDecimal > 0 && (
                        <> a <strong className="text-white">{(taxaDecimal * 100).toFixed(2).replace('.', ',')}% a.m.</strong></>
                      )}
                    </p>
                  </div>
                );
              })()
            ) : !Number.isFinite(resultadoMeses) ? (
              <p className="text-sm opacity-90">
                Com esse valor mensal, a meta não é atingível.
              </p>
            ) : (
              (() => {
                // Conversão pra anos (>= 12 meses): se for múltiplo de 12,
                // mostra sem decimais; senão 1 casa com vírgula brasileira.
                const anos = resultadoMeses / 12;
                const anosLabel = resultadoMeses >= 12
                  ? (Number.isInteger(anos)
                      ? `${anos} ${anos === 1 ? 'ano' : 'anos'}`
                      : `${anos.toFixed(1).replace('.', ',')} anos`)
                  : null;
                return (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-accent">
                      Vai levar
                    </p>
                    <p className="font-display text-3xl md:text-4xl font-bold mt-1 tabular-nums tracking-display-tight">
                      {resultadoMeses}
                      <span className="text-base md:text-lg font-normal opacity-70 ml-1">
                        {resultadoMeses === 1 ? 'mês' : 'meses'}
                      </span>
                      {anosLabel && (
                        <span className="text-base md:text-lg font-normal opacity-70 ml-1.5">
                          ({anosLabel})
                        </span>
                      )}
                    </p>
                    <p className="text-xs opacity-70 mt-2">
                      guardando <strong className="text-white">{formatCurrency(mensalNum)}/mês</strong>
                      {taxaDecimal > 0 && (
                        <> a <strong className="text-white">{(taxaDecimal * 100).toFixed(2).replace('.', ',')}% a.m.</strong></>
                      )}
                    </p>
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* Acumulado final — preview do que vai sobrar */}
        {podeCalcular && faltante > 0 && acumuladoFinal > 0 && (
          <div className="relative mt-4 pt-4 border-t border-white/10 flex items-center gap-2 text-xs">
            <TrendingUp className="w-4 h-4 text-accent flex-shrink-0" strokeWidth={2.5} />
            <span className="opacity-80">Acumulado final:</span>
            <span className="font-bold font-mono tabular-nums">{formatCurrency(acumuladoFinal)}</span>
            {taxaDecimal > 0 && acumuladoFinal > alvoNum && (
              <span className="text-accent font-bold">
                (+{formatCurrency(acumuladoFinal - alvoNum)} de rendimentos)
              </span>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-ink-500 leading-relaxed text-center">
        Cálculo com juros compostos. <strong className="text-ink-700">Taxa típica:</strong>{' '}
        Poupança ≈ 0,5% a.m. · CDB/Tesouro ≈ 0,8–1% a.m.
      </p>
    </div>
  );
}
