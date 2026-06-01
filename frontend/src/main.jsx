import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

/**
 * Registro do service worker (PWA instalável + offline).
 *
 * Só registra em produção (import.meta.env.PROD) para não atrapalhar o HMR
 * do Vite em dev. O SW vive em /sw.js (public/), com escopo na raiz.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);

    try {
      window.sessionStorage.removeItem('cofre:sw-reloaded');
    } catch {
      // Storage opcional: a atualização continua disponível no próximo acesso.
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;

      try {
        if (window.sessionStorage.getItem('cofre:sw-reloaded')) return;
        window.sessionStorage.setItem('cofre:sw-reloaded', '1');
      } catch {
        // Se o storage estiver bloqueado, uma atualização manual continua funcionando.
        return;
      }

      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((err) => {
        console.error('Falha ao registrar o service worker:', err);
      });
  });
}
