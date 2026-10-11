import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPdf, captureOpens, expectPdfOpens, signup, useBuild, closeWelcome } from './helpers';

test.beforeEach(async ({ page }) => {
  await useBuild(page, 'a');
  await captureOpens(page);
});

test('PDF anexado continua lá e abre depois de recarregar a página', async ({ page }) => {
  await signup(page);
  await attachPdf(page);
  await page.reload();
  await expectPdfOpens(page);
});

test('troca de versão do service worker não apaga dados nem rascunhos', async ({ page }) => {
  await signup(page);
  // espera o service worker da versão A ficar ativo e passar a controlar a página
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await attachPdf(page);
  // rascunho de tarefa em andamento (não salvo como tarefa)
  await page.getByRole('button', { name: /Tarefa/ }).first().click();
  await page.getByLabel('O que fazer').fill('Rascunho que não pode sumir');
  await expect(page.getByText(/rascunho salvo às/)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');

  // publica a versão B no mesmo endereço e o app procura atualização
  await useBuild(page, 'b');
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  const banner = page.getByTestId('update-banner');
  await expect(banner).toBeVisible({ timeout: 30_000 });
  // não recarrega sozinho: a versão só troca quando a usuária pede
  // "Atualizar" ativa o service worker novo e recarrega a página; espera esse recarregamento terminar
  await Promise.all([page.waitForEvent('load'), banner.getByRole('button', { name: 'Atualizar' }).click()]);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.update ?? 'none')).toBe('none');

  await page.goto('/personalizar');
  await expect(page.getByText(/versão 1\.0\.0\+B/)).toBeVisible();
  await expectPdfOpens(page);
  await page.getByRole('button', { name: /Tarefa/ }).first().click();
  await expect(page.getByLabel('O que fazer')).toHaveValue('Rascunho que não pode sumir');
});

test('fechar e reabrir o app (mesmo perfil do navegador) mantém o PDF', async ({ baseURL }) => {
  const dir = mkdtempSync(join(tmpdir(), 'meuplano-e2e-'));
  try {
    let ctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', baseURL });
    let page = ctx.pages()[0] ?? (await ctx.newPage());
    await captureOpens(page);
    await signup(page);
    await attachPdf(page, 'Boleto inscrição.pdf');
    await ctx.close();

    ctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', baseURL });
    page = ctx.pages()[0] ?? (await ctx.newPage());
    await captureOpens(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible();
    await closeWelcome(page); // app aberto de novo: as boas-vindas voltam até a pessoa marcar "Não mostrar de novo"
    await expectPdfOpens(page, 'Boleto inscrição.pdf');
    await ctx.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
