import { defineConfig } from '@playwright/test';

const PORT = 4317;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 860 },
  },
  projects: [
    // usa o Google Chrome já instalado
    { name: 'chrome', use: { channel: 'chrome' }, testIgnore: /iphone[\w-]*\.spec/ },
    // motor do Safari (WebKit), para o que só aparece no iPhone
    { name: 'iphone', use: { browserName: 'webkit' }, testMatch: /iphone[\w-]*\.spec/ },
  ],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: `http://localhost:${PORT}/__switch?to=a`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
