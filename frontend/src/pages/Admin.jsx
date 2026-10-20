import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  ShieldCheck, Activity, Users, BarChart3, ScrollText, Search, X, RefreshCw, Loader2,
  CheckCircle2, Clock, MinusCircle, AlertTriangle, Eye, LogIn, LogOut, UserPlus, KeyRound,
  Link2, UserCog, Database, HardDrive,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/admin';

/**
 * Central do administrador (/admin) — uso do app, usuários, páginas e logs.
 *
 * Só pra quem está em app_admins: o menu some pros outros e, mais importante,
 * as RPCs do banco recusam (migration_admin.sql). O painel recebe contagens e
 * datas — nunca valores ou dados financeiros dos usuários.
 */

// Hex dos tokens ink do tailwind.config — o Recharts não lê classes.
const BAR = '#3f3f46';   // ink-700: série única, contraste ~10:1 no card branco
const GRID = '#f4f4f5';  // ink-100
const AXIS = '#a1a1aa';  // ink-400

const TABS = [
  { id: 'overview', label: 'Visão geral', icon: Activity },
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'usage', label: 'Uso', icon: BarChart3 },
  { id: 'logs', label: 'Logs', icon: ScrollText },
];

const ROUTE_NAMES = {
  '/': 'Dashboard',
  '/incomes': 'Receitas',
  '/expenses': 'Despesas',
  '/recurring': 'Recorrências',
  '/cards': 'Cartões',
  '/categories': 'Categorias',
  '/cobrancas': 'Cobranças',
  '/goals': 'Objetivos',
  '/fipe': 'Tabela FIPE',
  '/settings': 'Ajustes',
  '/import-export': 'Importar/Exportar',
  '/admin': 'Admin',
};

const AUTH_EVENTS = {
  login: { label: 'Entrou', icon: LogIn },
  logout: { label: 'Saiu', icon: LogOut },
  user_signedup: { label: 'Criou a conta', icon: UserPlus },
  user_recovery_requested: { label: 'Pediu nova senha', icon: KeyRound },
  user_updated_password: { label: 'Trocou a senha', icon: KeyRound },
  user_modified: { label: 'Alterou a conta', icon: UserCog },
  identity_linked: { label: 'Vinculou login Google', icon: Link2 },
  identity_unlinked: { label: 'Desvinculou login', icon: Link2 },
};

const loadOverview = () => Promise.all([adminService.overview(), adminService.daily(30)]);
const loadUsage = () => Promise.all([adminService.daily(30), adminService.featureUsage(30)]);

export default function Admin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('overview');

  if (isAdmin === null) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-400" /></div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 md:space-y-6">
      <div data-tour="page-header">
        <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">Administração</p>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight tracking-tight flex items-center gap-2 md:gap-3">
          <ShieldCheck className="w-7 h-7 md:w-10 md:h-10 flex-shrink-0 text-ink-900" strokeWidth={2.25} />
          <span>Central do administrador</span>
        </h1>
        <p className="text-sm md:text-base text-ink-500 mt-1">Uso do Cofre, usuários e logs. Só contagens e datas — nada dos dados financeiros de ninguém.</p>
      </div>

      <div className="card-flat p-1.5 grid grid-cols-4 gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-1 sm:px-2 py-2 min-h-[48px] rounded-xl text-[11px] sm:text-xs md:text-sm font-bold transition-all duration-200 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 md:gap-2 ${
              tab === id ? 'bg-gradient-dark text-white shadow-soft' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2.25} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div key={tab} className="animate-fade-in">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'usage' && <UsageTab />}
        {tab === 'logs' && <LogsTab />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Abas
// ─────────────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data, error } = useLoad(loadOverview);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Skeleton />;
  const [o, daily] = data;
  const storage = Object.entries(o.storage || {});
  const counts = [
    ['Lançamentos', o.counts.transactions],
    ['Cartões', o.counts.credit_cards],
    ['Recorrências', o.counts.recurring],
    ['Metas', o.counts.goals],
    ['Devedores', o.counts.debtors],
    ['Cobranças', o.counts.charges],
    ['Avisos de pagamento', o.counts.payment_notices],
    ['Aparelhos com notificação', o.counts.push_subscriptions],
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Tile label="Usuários" value={o.users_total} hint={`+${o.users_new_30d} em 30 dias · +${o.users_new_7d} em 7`} />
        <Tile label="Ativos hoje" value={o.active_1d} hint="últimas 24 horas" />
        <Tile label="Ativos em 7 dias" value={o.active_7d} hint={share(o.active_7d, o.users_total)} />
        <Tile label="Ativos em 30 dias" value={o.active_30d} hint={share(o.active_30d, o.users_total)} />
      </div>

      <DailyBars title="Usuários ativos por dia" data={daily} field="active_users" unit="usuário" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <Panel title="Saúde do app">
          <Row label="Telas abertas (7 dias)" value={fmtInt(o.page_views_7d)} />
          <Row
            label="Erros no app (7 dias)"
            value={o.errors_7d > 0
              ? <span className="inline-flex items-center gap-1 text-negative"><AlertTriangle className="w-3.5 h-3.5" /> {fmtInt(o.errors_7d)}</span>
              : <span className="inline-flex items-center gap-1 text-positive"><CheckCircle2 className="w-3.5 h-3.5" /> Nenhum</span>}
          />
          <Row label={<span className="inline-flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> Banco de dados</span>} value={fmtBytes(o.db_bytes)} />
          {storage.map(([bucket, s]) => (
            <Row
              key={bucket}
              label={<span className="inline-flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> Arquivos · {bucket}</span>}
              value={`${fmtBytes(s.bytes)} · ${fmtInt(s.files)}`}
            />
          ))}
        </Panel>

        <Panel title="Dados na base">
          {counts.map(([label, n]) => <Row key={label} label={label} value={fmtInt(n)} />)}
        </Panel>
      </div>
    </div>
  );
}

function UsersTab() {
  const { data, error, reload } = useLoad(adminService.users);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!data || !term) return data || [];
    return data.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(term));
  }, [data, q]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Skeleton />;
  const active7 = data.filter((u) => userStatus(u.last_seen_at).id === 'active').length;

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-ink-600 flex-1">
          <b className="text-ink-900">{data.length}</b> {data.length === 1 ? 'usuário' : 'usuários'} · <b className="text-ink-900">{active7}</b> ativos nos últimos 7 dias
        </p>
        <ReloadButton onClick={reload} />
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Buscar por nome ou e-mail…" />

      <div className="bg-white rounded-2xl border border-hairline-light shadow-soft overflow-hidden divide-y divide-ink-100">
        {list.length === 0 && <p className="p-6 text-sm text-ink-500 text-center">Ninguém encontrado.</p>}
        {list.map((u) => <UserRow key={u.id} u={u} />)}
      </div>
    </div>
  );
}

function UsageTab() {
  const { data, error } = useLoad(loadUsage);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Skeleton />;
  const [daily, pages] = data;
  const max = Math.max(1, ...pages.map((p) => Number(p.views)));

  return (
    <div className="space-y-4 md:space-y-6">
      <DailyBars title="Telas abertas por dia" data={daily} field="page_views" unit="tela" />

      <Panel title="Páginas mais usadas" subtitle="Últimos 30 dias — telas abertas e quantas pessoas abriram">
        {pages.length === 0 && <p className="py-4 text-sm text-ink-500 text-center">Ainda sem registros de uso.</p>}
        <ul className="space-y-3">
          {pages.map((p) => (
            <li key={p.route}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-ink-900 truncate">{ROUTE_NAMES[p.route] || p.route}</span>
                <span className="text-xs text-ink-500 whitespace-nowrap tabular-nums">
                  <b className="text-ink-900">{fmtInt(p.views)}</b> · {fmtInt(p.users)} {Number(p.users) === 1 ? 'pessoa' : 'pessoas'}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full overflow-hidden" style={{ backgroundColor: GRID }}>
                <div className="h-full rounded-full" style={{ width: `${(Number(p.views) / max) * 100}%`, backgroundColor: BAR }} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

const LOG_FILTERS = [
  { id: 'all', label: 'Tudo', source: null },
  { id: 'auth', label: 'Acessos', source: 'auth' },
  { id: 'views', label: 'Telas', source: 'app' },
  { id: 'errors', label: 'Erros', source: 'app' },
];

function LogsTab() {
  const [filter, setFilter] = useState('all');
  const source = LOG_FILTERS.find((f) => f.id === filter).source;
  const load = useCallback(() => adminService.logs(source), [source]);
  const { data, error, reload } = useLoad(load);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    let rows = data || [];
    if (filter === 'views') rows = rows.filter((r) => r.kind === 'page_view');
    if (filter === 'errors') rows = rows.filter((r) => r.kind === 'error');
    const term = q.trim().toLowerCase();
    if (term) rows = rows.filter((r) => `${r.user_email} ${r.detail} ${r.kind}`.toLowerCase().includes(term));
    return rows;
  }, [data, filter, q]);

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {LOG_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 min-h-[36px] rounded-full text-xs font-bold transition-colors ${
              filter === f.id ? 'bg-gradient-dark text-white shadow-soft' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="flex-1" />
        <ReloadButton onClick={reload} />
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Filtrar por e-mail, tela ou mensagem…" />

      {error ? <ErrorBox message={error} /> : !data ? <Skeleton /> : (
        <div className="bg-white rounded-2xl border border-hairline-light shadow-soft overflow-hidden divide-y divide-ink-100">
          {list.length === 0 && <p className="p-6 text-sm text-ink-500 text-center">Nenhum registro.</p>}
          {list.map((r, i) => <LogRow key={`${r.at}-${i}`} r={r} />)}
        </div>
      )}
      <p className="text-[11px] text-ink-400">
        Mostra os 300 registros mais recentes. Telas e erros ficam guardados por 180 dias; acessos vêm do log de autenticação do Supabase.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Peças
// ─────────────────────────────────────────────────────────────────────────

/** Carrega na montagem; `load` precisa ser estável (função de módulo ou useCallback). */
function useLoad(load) {
  const [state, setState] = useState({ data: null, error: '' });
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, error: '' }));
    try {
      setState({ data: await load(), error: '' });
    } catch (err) {
      console.error(err);
      setState({
        data: null,
        error: err?.code === 'PGRST202' || err?.code === '42883'
          ? 'Falta rodar a migration supabase/migration_admin.sql no Supabase.'
          : err?.message || 'Não foi possível carregar.',
      });
    }
  }, [load]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

function Tile({ label, value, hint }) {
  return (
    <div className="card-flat p-4 md:p-5">
      <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest text-ink-500">{label}</p>
      <p className="stat-number text-3xl md:text-4xl text-ink-900 mt-1">{fmtInt(value)}</p>
      {hint && <p className="text-[11px] md:text-xs text-ink-500 mt-1">{hint}</p>}
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <div className="card-flat p-4 md:p-5">
      <h3 className="font-display text-base md:text-lg font-bold tracking-tight">{title}</h3>
      {subtitle && <p className="text-[11px] md:text-xs text-ink-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-ink-100 last:border-0 text-sm">
      <span className="text-ink-600 min-w-0 truncate">{label}</span>
      <span className="font-semibold text-ink-900 tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

/**
 * Barras diárias de uma série só (o título diz o que é — sem legenda), com
 * dica no toque/hover e um resumo em texto que lê o gráfico pra quem não vê.
 */
function DailyBars({ title, data, field, unit }) {
  const rows = data.map((d) => ({ label: ddmm(d.day), value: Number(d[field]) || 0 }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const peak = rows.reduce((m, r) => (r.value > m.value ? r : m), { value: 0, label: '' });

  return (
    <div className="card-flat p-4 md:p-5">
      <h3 className="font-display text-base md:text-lg font-bold tracking-tight">{title}</h3>
      <p className="text-[11px] md:text-xs text-ink-500">Últimos 30 dias</p>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} width={40} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<BarTip unit={unit} />} />
            {/* Sem animação: ela recomeçava do zero a cada resize (girar o celular). */}
            <Bar dataKey="value" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-ink-500 mt-2">
        Total no período: <b className="text-ink-900">{fmtInt(total)}</b>
        {peak.value > 0 && <> · pico de <b className="text-ink-900">{fmtInt(peak.value)}</b> em {peak.label}</>}
      </p>
    </div>
  );
}

function BarTip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const n = payload[0].value;
  return (
    <div className="rounded-xl bg-white shadow-soft-lg border border-ink-100 px-3 py-2 text-[11px]">
      <p className="font-semibold text-ink-900">{label}</p>
      <p className="text-ink-600"><b className="text-ink-900">{fmtInt(n)}</b> {n === 1 ? unit : `${unit}s`}</p>
    </div>
  );
}

function UserRow({ u }) {
  const st = userStatus(u.last_seen_at);
  const StIcon = st.icon;
  const uses = [
    [u.transactions, 'lançamento', 'lançamentos'],
    [u.debtors, 'devedor', 'devedores'],
    [u.goals, 'meta', 'metas'],
    [u.page_views_30d, 'tela em 30 dias', 'telas em 30 dias'],
  ];
  return (
    <div className="p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
      <div className="flex items-center gap-3 min-w-0 md:w-80 md:flex-shrink-0">
        <span className="w-10 h-10 rounded-full bg-ink-100 text-ink-700 font-bold flex items-center justify-center flex-shrink-0">
          {(u.name || u.email || '?').trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="block text-sm font-bold text-ink-900 truncate">{u.name}</span>
            {u.is_admin && <span className="px-2 py-0.5 rounded-full bg-ink-900 text-white text-[9px] font-bold uppercase tracking-wider flex-shrink-0">Admin</span>}
          </span>
          <span className="block text-xs text-ink-500 truncate">{u.email}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 md:flex-1">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${st.tone}`}>
          <StIcon className="w-3.5 h-3.5" /> {st.label}
        </span>
        <span>{u.last_seen_at ? `Último uso ${timeAgo(u.last_seen_at)}` : 'Nunca usou'}</span>
        <span>Desde {new Date(u.created_at).toLocaleDateString('pt-BR')}</span>
        <span>{u.provider === 'google' ? 'Google' : 'E-mail'}</span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 md:justify-end md:max-w-[260px]">
        {uses.map(([n, one, many]) => (
          <span key={many}><b className="text-ink-900 tabular-nums">{fmtInt(n)}</b> {Number(n) === 1 ? one : many}</span>
        ))}
      </div>
    </div>
  );
}

function LogRow({ r }) {
  let Icon = Eye;
  let title = r.kind;
  let tone = 'bg-ink-100 text-ink-600';
  if (r.source === 'auth') {
    const ev = AUTH_EVENTS[r.kind];
    Icon = ev?.icon || LogIn;
    title = ev?.label || r.kind;
    tone = 'bg-accent/30 text-ink-900';
  } else if (r.kind === 'error') {
    Icon = AlertTriangle;
    title = 'Erro no app';
    tone = 'bg-red-50 text-negative';
  } else {
    title = `Abriu ${ROUTE_NAMES[r.detail] || r.detail}`;
  }
  const detail = r.source === 'auth' ? (r.detail ? `IP ${r.detail}` : '') : r.kind === 'error' ? r.detail : '';

  return (
    <div className="p-3 md:px-4 flex items-start gap-3">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tone}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink-900 truncate">{title}</p>
          <time className="text-[11px] text-ink-400 whitespace-nowrap tabular-nums" dateTime={r.at}>
            {new Date(r.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        <p className="text-xs text-ink-500 truncate">{r.user_email || '—'}</p>
        {detail && <p className={`text-xs mt-0.5 break-words ${r.kind === 'error' ? 'text-negative' : 'text-ink-400'}`}>{detail}</p>}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field !min-h-[44px] !py-2 pl-10 pr-10"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100"
          aria-label="Limpar busca"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function ReloadButton({ onClick }) {
  return (
    <button onClick={onClick} className="btn-pill-sm self-start sm:self-auto">
      <RefreshCw className="w-3.5 h-3.5" /> Atualizar
    </button>
  );
}

function ErrorBox({ message }) {
  return <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{message}</div>;
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-ink-100 animate-pulse rounded-2xl" />)}
      </div>
      <div className="h-64 bg-ink-100 animate-pulse rounded-2xl" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Formatação
// ─────────────────────────────────────────────────────────────────────────

/** Ativo = usou nos últimos 7 dias; pouco uso = até 30; depois disso, inativo. */
function userStatus(lastSeen) {
  if (!lastSeen) return { id: 'never', label: 'Nunca usou', icon: MinusCircle, tone: 'bg-ink-100 text-ink-500' };
  const days = (Date.now() - new Date(lastSeen).getTime()) / 86400000;
  if (days <= 7) return { id: 'active', label: 'Ativo', icon: CheckCircle2, tone: 'bg-emerald-50 text-positive' };
  if (days <= 30) return { id: 'low', label: 'Pouco uso', icon: Clock, tone: 'bg-yellow-50 text-yellow-800' };
  return { id: 'inactive', label: 'Inativo', icon: MinusCircle, tone: 'bg-ink-100 text-ink-500' };
}

function share(part, total) {
  return total > 0 ? `${Math.round((part / total) * 100)}% da base` : '—';
}

function fmtInt(n) {
  return new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
}

function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
}

/** 'YYYY-MM-DD' → 'DD/MM' direto da string (sem fuso). */
function ddmm(day) {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** "agora" · "há 5 min" · "há 2 h" · "há 3 d". */
function timeAgo(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!(min >= 1)) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}
