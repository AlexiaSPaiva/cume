import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// identifica cada build (aparece em Configurações e permite testar a troca de versão do service worker)
const APP_VERSION = `${pkg.version}+${process.env.MEUPLANO_BUILD_ID ?? new Date().toISOString().slice(0, 16)}`;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a versão nova espera a usuária clicar em "Atualizar"; nunca recarrega sozinho no meio de uma edição
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MeuPlano · Personal Life OS',
        short_name: 'MeuPlano',
        description: 'Foco · Clareza · Ação. Objetivos, metas, agenda, tarefas e imprevistos em um só lugar.',
        lang: 'pt-BR',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        navigateFallback: '/index.html',
        // o service worker só mexe nos caches de assets (nomes versionados pelo Workbox);
        // ele nunca toca no IndexedDB, onde ficam os dados e arquivos da usuária
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
});
