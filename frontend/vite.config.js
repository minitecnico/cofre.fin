import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // A entrada da lib de logos também exporta um componente Vue (importa
      // 'vue'). Apontamos direto pro core, que é JS puro e só gera o SVG.
      {
        find: /^@edusites\/bancos-brasil$/,
        replacement: fileURLToPath(new URL('./node_modules/@edusites/bancos-brasil/src/core.js', import.meta.url)),
      },
    ],
  },
  server: {
    port: 5173,
  },
});
