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
