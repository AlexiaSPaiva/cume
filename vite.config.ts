import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// identifica cada build (aparece em Configurações e permite testar a troca de versão do service worker)
const APP_VERSION = `${pkg.version}+${process.env.MEUPLANO_BUILD_ID ?? new Date().toISOString().slice(0, 16)}`;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  // iPhones com iOS mais antigo (Safari 14–16.3) também precisam funcionar: sem isso o CSS sai com
  // "@media (width<=767.98px)", que eles não entendem, e o celular caía no layout de computador
  build: {
    target: ['es2020', 'safari14', 'chrome100', 'firefox100', 'edge100'],
    cssTarget: ['safari14', 'chrome100', 'firefox100', 'edge100'],
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a versão nova espera a usuária clicar em "Atualizar"; nunca recarrega sozinho no meio de uma edição
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-cume.png'],
      manifest: {
        // id = o start_url de sempre: o app já instalado continua sendo reconhecido como o mesmo
        id: '/',
        name: 'Cume° · Personal Life OS',
        short_name: 'Cume°',
        description: 'Foco · Clareza · Ação. Objetivos, metas, agenda, tarefas e imprevistos em um só lugar.',
        lang: 'pt-BR',
        theme_color: '#0a0f1f',
        background_color: '#0a0f1f',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/cume-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/cume-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/cume-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/cume-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // cenários: não entram no pré-cache (só a cena do momento é baixada); ficam guardados depois do 1º uso, para o offline
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/scenes/'),
          handler: 'CacheFirst',
          options: { cacheName: 'cume-scenes', expiration: { maxEntries: 40 } },
        }],
        // offline só precisa das fontes do português; os outros alfabetos o navegador baixa se um dia precisar
        globIgnores: ['**/*-cyrillic*', '**/*-greek*', '**/*-vietnamese*', '**/*-math*', '**/*-symbols*'],
        navigateFallback: '/index.html',
        // /api (calendário do celular) nunca é a tela do app
        navigateFallbackDenylist: [/^\/api\//],
        // o service worker só mexe nos caches de assets (nomes versionados pelo Workbox);
        // ele nunca toca no IndexedDB, onde ficam os dados e arquivos da usuária
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
});
