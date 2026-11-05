import { supabase } from './supabase';

/**
 * Central do administrador (migration_admin.sql).
 *
 * Tudo vem de RPCs que conferem is_admin() no banco — esconder o menu é só
 * conforto; a trava de verdade é o Postgres. O painel só recebe contagens e
 * datas, nunca valores ou descrições dos usuários.
 */
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const adminService = {
  /** false também quando a migration não existe — o menu simplesmente não aparece. */
  async isAdmin() {
    const { data, error } = await supabase.rpc('is_admin');
    return !error && !!data;
  },
  overview: () => rpc('admin_overview'),
  daily: (days = 30) => rpc('admin_daily', { p_days: days }).then((d) => d || []),
  users: () => rpc('admin_users').then((d) => d || []),
  featureUsage: (days = 30) => rpc('admin_feature_usage', { p_days: days }).then((d) => d || []),
  logs: (source = null, limit = 300) => rpc('admin_logs', { p_source: source, p_limit: limit }).then((d) => d || []),
  publicLinks: () => rpc('admin_public_links').then((d) => d || []),

  // Avisos (migration_admin_comms.sql)
  announcements: () => rpc('admin_announcements').then((d) => d || []),
  createAnnouncement: ({ title, body, url }) =>
    rpc('admin_announcement_create', { p_title: title, p_body: body || null, p_url: url || null }),
  setAnnouncementActive: (id, active) => rpc('admin_announcement_set_active', { p_id: id, p_active: active }),
  deleteAnnouncement: (id) => rpc('admin_announcement_delete', { p_id: id }),
  pushStats: () => rpc('admin_push_stats'),

  /**
   * Manda o aviso como notificação pra todos os aparelhos inscritos. Quem envia
   * é o servidor (/api/push-broadcast), que confere o token e se é admin.
   * @returns {Promise<{ sent: number, failed: number, removed: number }>}
   */
  async pushAnnouncement(id) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/push-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => null);
    // Sem JSON = a rota não existe (ex.: rodando local, sem a Vercel).
    if (!data) throw new Error('A notificação só sai pelo app publicado na Vercel.');
    if (!res.ok) throw new Error(data.error || 'Falha ao enviar a notificação.');
    return data;
  },

  // Mensagens (problemas e sugestões)
  feedback: () => rpc('admin_feedback').then((d) => d || []),
  setFeedbackStatus: (id, status) => rpc('admin_feedback_set_status', { p_id: id, p_status: status }),
};

let errorsSent = 0;

/**
 * Registra uso do app (`page_view` com a rota, `error` com a mensagem).
 * Fire-and-forget: sem login, offline ou sem a migration, falha calado — nunca
 * atrapalha a tela. Erros têm teto por sessão pra um loop não inundar a tabela.
 */
export function trackEvent(kind, detail) {
  if (kind === 'error' && ++errorsSent > 20) return;
  supabase
    .from('app_events')
    .insert({ kind, detail: String(detail ?? '').slice(0, 500) })
    .then(() => {}, () => {});
}
