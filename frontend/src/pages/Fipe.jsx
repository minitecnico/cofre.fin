import { useEffect, useState } from 'react';
import { Car, Loader2 } from 'lucide-react';
import Select from '../components/Select';
import { fipeService, FIPE_VEHICLE_TYPES, FIPE_DAILY_LIMIT } from '../services/fipe';

/**
 * Tabela FIPE — preço médio de veículos. Escolhas em cascata: tipo → marca →
 * modelo → ano. Mudar um nível limpa os de baixo (os códigos dependem dele).
 */
export default function FipePage() {
  const [type, setType] = useState('carros');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');

  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(null); // 'brands' | 'models' | 'years' | 'price'
  const [error, setError] = useState(null);
  const [used, setUsed] = useState(fipeService.usedToday);

  /**
   * Roda uma consulta marcando o nível que está carregando. Retorna o cleanup
   * do effect: resposta que chega depois de o usuário trocar a escolha é ignorada.
   */
  function run(level, request, onData) {
    let alive = true;
    setLoading(level);
    setError(null);
    request
      .then((data) => { if (alive) onData(data); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => {
        setUsed(fipeService.usedToday());
        if (alive) setLoading(null);
      });
    return () => { alive = false; };
  }

  useEffect(() => run('brands', fipeService.brands(type), setBrands), [type]);
  useEffect(() => {
    if (brand) return run('models', fipeService.models(type, brand), setModels);
  }, [type, brand]);
  useEffect(() => {
    if (model) return run('years', fipeService.years(type, brand, model), setYears);
  }, [type, brand, model]);
  useEffect(() => {
    if (year) return run('price', fipeService.price(type, brand, model, year), setResult);
  }, [type, brand, model, year]);

  function pickType(v) {
    setType(v); setBrand(''); setModel(''); setYear('');
    setBrands([]); setModels([]); setYears([]); setResult(null);
  }
  function pickBrand(v) {
    setBrand(v); setModel(''); setYear('');
    setModels([]); setYears([]); setResult(null);
  }
  function pickModel(v) {
    setModel(v); setYear('');
    setYears([]); setResult(null);
  }
  function pickYear(v) {
    setYear(v); setResult(null);
  }

  const toOptions = (list) => list.map((i) => ({ value: String(i.codigo), label: i.nome }));

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div data-tour="page-header">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">
            Consulta
          </p>
          <span
            className={`font-mono text-xs font-bold tabular-nums ${used >= FIPE_DAILY_LIMIT ? 'text-negative' : 'text-ink-400'}`}
            title="Consultas FIPE hoje neste aparelho"
          >
            {used}/{FIPE_DAILY_LIMIT}
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight tracking-tight flex items-center gap-2 md:gap-3">
          <Car className="w-7 h-7 md:w-10 md:h-10 flex-shrink-0 text-accent" strokeWidth={2.25} />
          <span>Tabela FIPE</span>
        </h1>
        <p className="text-sm md:text-base text-ink-500 mt-1">
          Preço médio de carros, motos e caminhões no mercado brasileiro.
        </p>
      </div>

      {/* Tipo de veículo */}
      <div className="card-flat p-1.5 flex gap-1">
        {FIPE_VEHICLE_TYPES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => pickType(value)}
            className={`flex-1 px-2 sm:px-3 py-2.5 min-h-[44px] rounded-xl text-xs md:text-sm font-bold transition-all duration-200 ${
              type === value ? 'bg-gradient-dark text-white shadow-soft' : 'bg-transparent text-ink-600 hover:bg-ink-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">
        {/* Filtros em cascata */}
        <div className="card-flat p-4 md:p-5 space-y-4">
          <Select
            label="Marca"
            value={brand}
            onChange={pickBrand}
            options={toOptions(brands)}
            placeholder={loading === 'brands' ? 'Carregando marcas…' : 'Escolha a marca'}
          />
          {brand && (
            <Select
              label="Modelo"
              value={model}
              onChange={pickModel}
              options={toOptions(models)}
              placeholder={loading === 'models' ? 'Carregando modelos…' : 'Escolha o modelo'}
            />
          )}
          {model && (
            <Select
              label="Ano / combustível"
              value={year}
              onChange={pickYear}
              options={toOptions(years)}
              placeholder={loading === 'years' ? 'Carregando anos…' : 'Escolha o ano'}
            />
          )}
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>
          )}
        </div>

        {/* Resultado */}
        <div className="card-flat p-5 md:p-6">
          {loading === 'price' ? (
            <div className="flex items-center justify-center py-10 text-ink-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : result ? (
            <div className="space-y-4 animate-fade-in">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-ink-500">Preço médio FIPE</p>
                <p className="stat-number font-display font-bold text-3xl md:text-4xl mt-1">{result.Valor}</p>
                <p className="text-xs text-ink-500 mt-1">Referência: {result.MesReferencia}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Info label="Marca" value={result.Marca} />
                <Info label="Ano modelo" value={result.AnoModelo === 32000 ? '0 km' : result.AnoModelo} />
                <Info label="Modelo" value={result.Modelo} wide />
                <Info label="Combustível" value={result.Combustivel} />
                <Info label="Código FIPE" value={result.CodigoFipe} mono />
              </dl>
            </div>
          ) : (
            <div className="text-center py-8">
              <Car className="w-10 h-10 mx-auto mb-3 text-ink-300" strokeWidth={1.75} />
              <p className="text-sm text-ink-500">Escolha marca, modelo e ano para ver o preço.</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-ink-400 text-center">
        Dados da Tabela FIPE via API pública (parallelum.com.br). Valores são referência de mercado, não oferta de compra.
      </p>
    </div>
  );
}

function Info({ label, value, wide, mono }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[10px] uppercase tracking-widest font-bold text-ink-500">{label}</dt>
      <dd className={`font-bold mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
