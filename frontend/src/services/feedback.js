import { supabase } from './supabase';

/**
 * Problemas e sugestões enviados em Ajustes → aba Mensagens da central do
 * administrador (migration_admin_comms.sql). A pessoa só envia; ler é do admin.
 */
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
