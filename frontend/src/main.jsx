import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
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
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Falha ao registrar o service worker:', err);
    });
  });
}
