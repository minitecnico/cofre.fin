import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  ShieldCheck, Activity, Users, BarChart3, ScrollText, Search, X, RefreshCw, Loader2,
  CheckCircle2, Clock, MinusCircle, AlertTriangle, Eye, LogIn, LogOut, UserPlus, KeyRound,
  Link2, UserCog, Database, HardDrive, Megaphone, MessageSquare, Bell, Bug, Lightbulb, Mail,
  Smartphone, Trash2, Send,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/admin';
import ConfirmDialog from '../components/ConfirmDialog';
import AnnouncementBanner from '../components/AnnouncementBanner';

/**
 * Central do administrador (/admin) — uso do app, usuários, páginas, logs,
 * avisos pros usuários (faixa no app + push) e mensagens recebidas.
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
  { id: 'announcements', label: 'Avisos', icon: Megaphone },
  { id: 'feedback', label: 'Mensagens', icon: MessageSquare },
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
  '/viagens': 'Viagens',
  '/viagens/:id': 'Viagem aberta',
  '/cotacao': 'Cotação',
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

const loadOverview = () => Promise.all([adminService.overview(), adminService.daily(30), adminService.publicLinks()]);
const loadUsage = () => Promise.all([adminService.daily(30), adminService.featureUsage(30)]);

export default function Admin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('overview');
  const [openFeedback, setOpenFeedback] = useState(0);

  // Selo de mensagens abertas na aba — a própria aba atualiza ao mudar status.
  useEffect(() => {
    if (!isAdmin) return;
    adminService.feedback()
      .then((list) => setOpenFeedback(list.filter((f) => f.status === 'new').length))
      .catch(() => {});
  }, [isAdmin]);

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

      <div className="card-flat p-1.5 grid grid-cols-3 sm:grid-cols-6 gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative px-1 sm:px-2 py-2 min-h-[48px] rounded-xl text-[11px] sm:text-xs md:text-sm font-bold transition-all duration-200 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 md:gap-2 ${
              tab === id ? 'bg-gradient-dark text-white shadow-soft' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2.25} />
            <span className="truncate">{label}</span>
            {id === 'feedback' && openFeedback > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-negative text-white text-[10px] font-bold leading-[18px] text-center tabular-nums">
                {openFeedback}
              </span>
            )}
          </button>
        ))}
      </div>

      <div key={tab} className="animate-fade-in">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'usage' && <UsageTab />}
        {tab === 'logs' && <LogsTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
        {tab === 'feedback' && <FeedbackTab onOpenCount={setOpenFeedback} />}
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
  const [o, daily, links] = data;
  const storage = Object.entries(o.storage || {});

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Tile label="Usuários" value={o.users_total} hint={`+${o.users_new_30d} em 30 dias · +${o.users_new_7d} em 7`} />
        <Tile label="Ativos hoje" value={o.active_1d} hint="últimas 24 horas" />
        <Tile label="Ativos em 7 dias" value={o.active_7d} hint={share(o.active_7d, o.users_total)} />
        <Tile label="Ativos em 30 dias" value={o.active_30d} hint={share(o.active_30d, o.users_total)} />
      </div>

      <DailyBars title="Usuários ativos por dia" data={daily} field="active_users" unit="usuário" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 md:items-start">
        <div className="space-y-3 md:space-y-4">
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
            <Row
              label={<span className="inline-flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Mensagens abertas</span>}
              value={fmtInt(o.feedback_open)}
            />
          </Panel>

          <Panel title="Links públicos abertos" subtitle="Páginas que qualquer pessoa com o link consegue ver">
            {LINK_KINDS.map(([key, , many]) => (
              <Row key={key} label={many.charAt(0).toUpperCase() + many.slice(1)} value={fmtInt(o.public_links?.[key])} />
            ))}
            {links.length > 0 && (
              <div className="mt-3 pt-3 border-t border-ink-100">
                <p className="text-[10px] uppercase tracking-widest font-bold text-ink-400 pb-1">Por pessoa</p>
                <ul>
                  {links.map((l) => (
                    <li key={l.email} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                      <span className="text-ink-600 min-w-0 truncate">{l.email}</span>
                      <span className="text-ink-900 font-semibold text-right">
                        {LINK_KINDS.filter(([key]) => Number(l[key]) > 0)
                          .map(([key, one, many]) => `${fmtInt(l[key])} ${Number(l[key]) === 1 ? one : many}`)
                          .join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Dados na base">
          {COUNT_GROUPS.map(([group, items], i) => (
            <div key={group} className={i > 0 ? 'pt-4' : ''}>
              <p className="text-[10px] uppercase tracking-widest font-bold text-ink-400 pb-1">{group}</p>
              {items.map(([label, key]) => <Row key={key} label={label} value={fmtInt(o.counts?.[key])} />)}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

/** Grupos do painel "Dados na base" — chaves de admin_overview().counts. */
const COUNT_GROUPS = [
  ['Finanças', [['Lançamentos', 'transactions'], ['Cartões', 'credit_cards'], ['Recorrências', 'recurring']]],
  ['Metas', [
    ['Metas', 'goals'], ['Metas coletivas', 'goals_shared'], ['Participantes convidados', 'goal_members'],
    ['Depósitos', 'goal_contributions'], ['Comprovantes de PIX', 'goal_receipts'],
  ]],
  ['Cobranças', [
    ['Devedores', 'debtors'], ['Cobranças', 'charges'], ['Avisos de pagamento', 'payment_notices'],
    ['Comprovantes de pagamento', 'payment_receipts'],
  ]],
  ['Viagens', [['Viagens', 'trips'], ['Gastos anotados', 'trip_expenses'], ['Viajantes convidados', 'trip_members']]],
  ['Outros', [
    ['Cotações', 'quotes'], ['Pessoas com @nick', 'profiles'], ['Aparelhos com notificação', 'push_subscriptions'],
    ['Mensagens recebidas', 'feedback'],
  ]],
];

/** Tipos de link público: [chave, singular, plural]. */
const LINK_KINDS = [
  ['statements', 'extrato de cobrança', 'extratos de cobrança'],
  ['trips', 'viagem', 'viagens'],
  ['reports', 'relatório', 'relatórios'],
  ['pix', 'link PIX', 'links PIX'],
];

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

// Rotas que o botão "Ver agora" do aviso pode abrir.
const LINK_ROUTES = ['/', '/expenses', '/incomes', '/cards', '/recurring', '/goals', '/cobrancas', '/viagens', '/cotacao', '/fipe', '/import-export', '/settings'];

const loadAnnouncements = () => Promise.all([adminService.announcements(), adminService.pushStats()]);

function AnnouncementsTab() {
  const { data, error, reload } = useLoad(loadAnnouncements);
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState(null); // { ok: boolean, text }

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Skeleton />;
  const [list, push] = data;
  const audience = `${fmtInt(push.devices)} ${Number(push.devices) === 1 ? 'aparelho' : 'aparelhos'} (${fmtInt(push.users)} ${Number(push.users) === 1 ? 'pessoa' : 'pessoas'})`;

  async function sendPush(a) {
    try {
      setNotice({ ok: true, text: pushSummary(await adminService.pushAnnouncement(a.id)) });
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    }
    await reload();
  }

  async function act(action, okText) {
    try {
      await action();
      if (okText) setNotice({ ok: true, text: okText });
    } catch (err) {
      setNotice({ ok: false, text: err.message || 'Não foi possível concluir.' });
    }
    await reload();
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {notice && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-start gap-3 ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-negative'}`}>
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Fechar" className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-black/5 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Panel title="Novo aviso" subtitle="Aparece no topo do app pra todo mundo, até a pessoa fechar">
          <AnnouncementForm
            push={push}
            audience={audience}
            onConfirm={setConfirm}
            onDone={({ pushed, result, pushError }) => {
              setNotice(pushError
                ? { ok: false, text: `Aviso publicado, mas a notificação falhou: ${pushError}` }
                : { ok: true, text: pushed ? `Aviso publicado. ${pushSummary(result)}` : 'Aviso publicado — já aparece no app.' });
              reload();
            }}
          />
        </Panel>

        <Panel title="Notificações (push)" subtitle="Quem recebe aviso com o app fechado">
          <Row label="Aparelhos inscritos" value={fmtInt(push.devices)} />
          <Row label="Pessoas" value={fmtInt(push.users)} />
          <Row label="Novos em 30 dias" value={fmtInt(push.new_30d)} />
          <p className="text-[11px] text-ink-500 mt-3 leading-relaxed">
            Só recebe quem permitiu notificações no aparelho — hoje o app pede isso na tela de Cobranças.
            Inscrições vencidas (app desinstalado, permissão tirada) são apagadas no envio.
          </p>
        </Panel>
      </div>

      <Panel title="Avisos publicados" subtitle="Encerrar tira o aviso do app de quem ainda não fechou">
        {list.length === 0 && <p className="py-4 text-sm text-ink-500 text-center">Nenhum aviso ainda.</p>}
        <ul className="divide-y divide-ink-100">
          {list.map((a) => (
            <li key={a.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-900 break-words">{a.title}</p>
                  {a.body && <p className="text-xs text-ink-600 whitespace-pre-line break-words line-clamp-3">{a.body}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${a.active ? 'bg-emerald-50 text-positive' : 'bg-ink-100 text-ink-500'}`}>
                  {a.active ? 'No ar' : 'Encerrado'}
                </span>
              </div>
              <p className="text-[11px] text-ink-500 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>{new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                {a.url && <span>Botão → {ROUTE_NAMES[a.url] || a.url}</span>}
                <span>{fmtInt(a.reads)} {Number(a.reads) === 1 ? 'pessoa fechou' : 'pessoas fecharam'}</span>
                <span className="inline-flex items-center gap-1">
                  <Bell className="w-3 h-3" />
                  {!a.pushed_at ? 'Sem notificação' : a.push_sent == null ? 'Notificação sem resultado' : pushSummary({ sent: a.push_sent, failed: a.push_failed, removed: a.push_removed })}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {a.active && !a.pushed_at && Number(push.devices) > 0 && (
                  <button
                    onClick={() => setConfirm({
                      title: 'Enviar notificação',
                      message: `Mandar “${a.title}” para ${audience}? Notificação enviada não volta atrás.`,
                      confirmLabel: 'Enviar',
                      onConfirm: () => sendPush(a),
                    })}
                    className="btn-pill-sm"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar notificação
                  </button>
                )}
                <button
                  onClick={() => act(() => adminService.setAnnouncementActive(a.id, !a.active))}
                  className="btn-pill-sm"
                >
                  {a.active ? 'Encerrar' : 'Reativar'}
                </button>
                <button
                  onClick={() => setConfirm({
                    title: 'Excluir aviso',
                    message: `Excluir “${a.title}”? Some do app de quem ainda não fechou.`,
                    confirmLabel: 'Excluir',
                    tone: 'danger',
                    onConfirm: () => act(() => adminService.deleteAnnouncement(a.id), 'Aviso excluído.'),
                  })}
                  className="btn-pill-sm !text-negative"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function AnnouncementForm({ push, audience, onConfirm, onDone }) {
  const [form, setForm] = useState({ title: '', body: '', url: '', push: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const canPush = Number(push.devices) > 0;

  async function publish() {
    setSaving(true);
    setError(null);
    try {
      const id = await adminService.createAnnouncement({ title: form.title.trim(), body: form.body.trim(), url: form.url });
      let result = null;
      let pushError = null;
      if (form.push) {
        try { result = await adminService.pushAnnouncement(id); } catch (err) { pushError = err.message; }
      }
      setForm({ title: '', body: '', url: '', push: false });
      onDone({ pushed: form.push, result, pushError });
    } catch (err) {
      setError(err.message || 'Não foi possível publicar.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return setError('Dê um título ao aviso');
    if (!form.push) return publish();
    onConfirm({
      title: 'Publicar e notificar',
      message: `O aviso aparece no app pra todo mundo e a notificação vai para ${audience}. Notificação enviada não volta atrás.`,
      confirmLabel: 'Publicar e notificar',
      onConfirm: publish,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Título</label>
        <input className="input-field" value={form.title} onChange={set('title')} maxLength={80} placeholder="Ex: Novidade: Viagens" required />
      </div>
      <div>
        <label className="label">Mensagem (opcional)</label>
        <textarea className="input-field min-h-[88px] resize-y" value={form.body} onChange={set('body')} maxLength={500} placeholder="Ex: Anote os gastos da viagem à parte das despesas do mês." />
      </div>
      <div>
        <label className="label">Botão “Ver agora” leva para</label>
        <select className="input-field" value={form.url} onChange={set('url')}>
          <option value="">Sem botão</option>
          {LINK_ROUTES.map((r) => <option key={r} value={r}>{ROUTE_NAMES[r] || r}</option>)}
        </select>
      </div>

      <label className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
        !canPush ? 'border-ink-100 bg-ink-50 cursor-not-allowed opacity-70'
          : form.push ? 'border-ink-900 bg-accent/20 cursor-pointer' : 'border-ink-200 hover:border-ink-400 cursor-pointer'
      }`}>
        <input type="checkbox" checked={form.push} onChange={set('push')} disabled={!canPush} className="mt-0.5 w-5 h-5 accent-ink-900" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"><Bell className="w-4 h-4" /> Enviar também como notificação</span>
          <span className="block text-xs text-ink-600 mt-0.5">
            {canPush ? `Chega em ${audience}, mesmo com o app fechado.` : 'Ninguém ativou as notificações ainda.'}
          </span>
        </span>
      </label>

      {form.title.trim() && (
        <div>
          <p className="label">Prévia</p>
          <AnnouncementBanner announcement={{ title: form.title, body: form.body.trim(), url: form.url }} onDismiss={() => {}} onOpen={() => {}} />
        </div>
      )}

      {error && <p className="px-3 py-2 rounded-xl bg-red-50 text-sm text-negative font-medium">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto disabled:opacity-60">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Megaphone className="w-4 h-4" />}
        Publicar aviso
      </button>
    </form>
  );
}

const FEEDBACK_FILTERS = [
  { id: 'new', label: 'Abertas' },
  { id: 'done', label: 'Resolvidas' },
  { id: 'all', label: 'Todas' },
];

function FeedbackTab({ onOpenCount }) {
  const { data, error, reload } = useLoad(adminService.feedback);
  const [filter, setFilter] = useState('new');
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (data) onOpenCount(data.filter((f) => f.status === 'new').length);
  }, [data, onOpenCount]);

  const list = useMemo(() => (data || []).filter((f) => filter === 'all' || f.status === filter), [data, filter]);
  const count = (id) => (data || []).filter((f) => id === 'all' || f.status === id).length;

  async function setStatus(f, status) {
    setBusy(f.id);
    setActionError(null);
    try {
      await adminService.setFeedbackStatus(f.id, status);
      await reload();
    } catch (err) {
      setActionError(err.message || 'Não foi possível atualizar.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FEEDBACK_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 min-h-[36px] rounded-full text-xs font-bold transition-colors ${
              filter === f.id ? 'bg-gradient-dark text-white shadow-soft' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {f.label}{data && ` · ${count(f.id)}`}
          </button>
        ))}
        <span className="flex-1" />
        <ReloadButton onClick={reload} />
      </div>
      {actionError && <ErrorBox message={actionError} />}

      {error ? <ErrorBox message={error} /> : !data ? <Skeleton /> : (
        <div className="bg-white rounded-2xl border border-hairline-light shadow-soft overflow-hidden divide-y divide-ink-100">
          {list.length === 0 && (
            <p className="p-6 text-sm text-ink-500 text-center">
              {filter === 'new' ? 'Nenhuma mensagem aberta.' : 'Nenhuma mensagem.'}
            </p>
          )}
          {list.map((f) => <FeedbackRow key={f.id} f={f} busy={busy === f.id} onStatus={setStatus} />)}
        </div>
      )}
      <p className="text-[11px] text-ink-400">
        Chegam pelo “Relatar problema ou sugerir”, em Ajustes. Responder abre seu e-mail com a mensagem citada.
      </p>
    </div>
  );
}

function FeedbackRow({ f, busy, onStatus }) {
  const problem = f.kind === 'problem';
  const Icon = problem ? Bug : Lightbulb;
  const when = new Date(f.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const firstName = (f.user_name || '').split(' ')[0];
  const quoted = f.message.slice(0, 400).replace(/\n/g, '\n> ');
  const mailto = f.user_email && `mailto:${f.user_email}?subject=${encodeURIComponent('Sua mensagem no Cofre')}&body=${encodeURIComponent(
    `Oi, ${firstName}!\n\nSobre a mensagem que você mandou em ${when}:\n\n> ${quoted}\n\n`,
  )}`;

  return (
    <div className="p-3 md:p-4 space-y-2">
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${problem ? 'bg-red-50 text-negative' : 'bg-amber-50 text-amber-700'}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-bold text-ink-900 flex items-center gap-2">
              {problem ? 'Problema' : 'Sugestão'}
              {f.status === 'done' && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-positive text-[10px] font-semibold">Resolvida</span>
              )}
            </p>
            <time className="text-[11px] text-ink-400 whitespace-nowrap tabular-nums" dateTime={f.created_at}>{when}</time>
          </div>
          <p className="text-xs text-ink-500 truncate">{f.user_email ? `${f.user_name} · ${f.user_email}` : 'Conta excluída'}</p>
        </div>
      </div>
      <div className="sm:pl-11 space-y-2">
        <p className="text-sm text-ink-800 whitespace-pre-line break-words">{f.message}</p>
        {f.context && (
          <p className="text-[11px] text-ink-400 flex items-center gap-1"><Smartphone className="w-3 h-3 flex-shrink-0" /> {f.context}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {mailto && (
            <a href={mailto} className="btn-pill-sm"><Mail className="w-3.5 h-3.5" /> Responder por e-mail</a>
          )}
          <button onClick={() => onStatus(f, f.status === 'new' ? 'done' : 'new')} disabled={busy} className="btn-pill-sm disabled:opacity-60">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : f.status === 'new' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {f.status === 'new' ? 'Marcar como resolvida' : 'Reabrir'}
          </button>
        </div>
      </div>
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
          ? 'Falta rodar no Supabase as migrations do admin: supabase/migration_admin.sql e supabase/migration_admin_comms.sql.'
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
  // Só o que a pessoa usa — zero em tudo vira "Sem uso registrado".
  const uses = [
    [u.transactions, 'lançamento', 'lançamentos'],
    [u.debtors, 'devedor', 'devedores'],
    [u.goals, 'meta', 'metas'],
    [u.trips, 'viagem', 'viagens'],
    [u.quotes, 'cotação', 'cotações'],
    [u.page_views_30d, 'tela em 30 dias', 'telas em 30 dias'],
  ].filter(([n]) => Number(n) > 0);
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
          <span className="block text-xs text-ink-500 truncate">{u.email}{u.nick && ` · @${u.nick}`}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 md:flex-1">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${st.tone}`}>
          <StIcon className="w-3.5 h-3.5" /> {st.label}
        </span>
        <span>{u.last_seen_at ? `Último uso ${timeAgo(u.last_seen_at)}` : 'Nunca usou'}</span>
        <span>Desde {new Date(u.created_at).toLocaleDateString('pt-BR')}</span>
        <span>{u.provider === 'google' ? 'Google' : 'E-mail'}</span>
        {Number(u.push_devices) > 0 && (
          <span className="inline-flex items-center gap-1" title="Recebe notificações com o app fechado">
            <Bell className="w-3.5 h-3.5" /> Notificações
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 md:justify-end md:max-w-[260px]">
        {uses.length === 0 && <span>Sem uso registrado</span>}
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

/** "Notificação enviada para 5 aparelhos · 1 inscrição vencida removida". */
function pushSummary({ sent, failed, removed }) {
  const parts = [`Notificação enviada para ${fmtInt(sent)} ${Number(sent) === 1 ? 'aparelho' : 'aparelhos'}`];
  if (Number(removed) > 0) parts.push(`${fmtInt(removed)} ${Number(removed) === 1 ? 'inscrição vencida removida' : 'inscrições vencidas removidas'}`);
  if (Number(failed) > 0) parts.push(`${fmtInt(failed)} ${Number(failed) === 1 ? 'falhou' : 'falharam'}`);
  return parts.join(' · ');
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
