import { supabase } from './supabase';

/**
 * Comunicação admin ↔ usuários (migration_admin_comms.sql), do lado de quem
 * usa o app: avisos publicados na central do administrador e o envio de
 * problemas/sugestões em Ajustes.
 */
export const announcementService = {
  /** Avisos ativos que a pessoa ainda não fechou (mais novo primeiro). */
  async mine() {
    const { data, error } = await supabase.rpc('list_my_announcements');
    if (error) throw error;
    return data || [];
  },
  async dismiss(id) {
    const { error } = await supabase.rpc('dismiss_announcement', { p_id: id });
    if (error) throw error;
  },
};

export const feedbackService = {
  /** @param {{ kind: 'problem'|'suggestion', message: string }} fields */
  async send({ kind, message }) {
    const { error } = await supabase
      .from('app_feedback')
      .insert({ kind, message, context: describeDevice() });
    if (error) throw error;
  },
};

/**
 * "Android · Chrome · app instalado · tela 412×915" — o suficiente pra
 * reproduzir um problema, sem o user-agent inteiro (nada que identifique).
 */
function describeDevice() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Outro sistema';
  const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Edg(A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari'
    : 'Outro navegador';
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  return `${os} · ${browser} · ${installed ? 'app instalado' : 'no navegador'} · tela ${window.innerWidth}×${window.innerHeight}`;
}
