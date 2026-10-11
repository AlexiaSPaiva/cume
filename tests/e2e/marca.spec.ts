import { expect, test, type Page } from '@playwright/test';
import { signup, useBuild } from './helpers';

const at = (h: number) => new Date(2026, 9, 9, h, 0, 0);

async function heroScene(page: Page) {
  return page.locator('.hero-bg .scene').getAttribute('data-scene');
}

test('nome Cume° na aba, no menu e no topo do celular; nenhum "MeuPlano" visível', async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
  await expect(page).toHaveTitle('Cume° · Início');
  await expect(page.locator('aside.side').getByRole('img', { name: 'Cume°' })).toBeVisible();
  await expect(page.locator('aside.side')).toContainText('Personal Life OS');
  await expect(page.locator('aside.side')).not.toContainText('Foco · Clareza · Ação');
  await page.goto('/tarefas');
  await expect(page).toHaveTitle('Cume° · Tarefas');
  for (const r of ['/', '/personalizar', '/area/financeiro?aba=renda-extra']) {
    await page.goto(r);
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/meu ?plano/i);
  }
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.locator('.top-brand').getByRole('img', { name: 'Cume°' })).toBeVisible();
  // logo pelo tamanho da fonte, sem esticar
  const tf = await page.locator('.top-brand .bm-logo').evaluate((el) => getComputedStyle(el).transform);
  expect(tf).toBe('none');
});

test('manifest: nome novo, ícones any + maskable, mesmo start_url e id', async ({ page }) => {
  await useBuild(page, 'a');
  await page.goto('/');
  const m = await (await page.request.get('/manifest.webmanifest')).json();
  expect(m.name).toBe('Cume° · Personal Life OS');
  expect(m.short_name).toBe('Cume°');
  expect(m.start_url).toBe('/');
  expect(m.id).toBe('/');
  expect(m.theme_color).toBe('#0a0f1f');
  expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  expect(m.icons.some((i: { purpose: string }) => i.purpose === 'any')).toBe(true);
  for (const i of m.icons) expect((await page.request.get(`/${i.src}`)).status()).toBe(200);
  for (const f of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon-cume.png']) expect((await page.request.get(f)).status()).toBe(200);
});

for (const [h, scene] of [[7, 'amanhecer'], [12, 'dia'], [17, 'entardecer'], [22, 'noite']] as const) {
  test(`cenário automático às ${h}h: ${scene}`, async ({ page }) => {
    await page.clock.install({ time: at(h) });
    await useBuild(page, 'a');
    await signup(page);
    expect(await heroScene(page)).toBe(scene);
    const bg = await page.locator('.hero-bg .scene-layer').first().evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain(`cume-bg-${scene}-hero`);
  });
}

test('cena fixada em Personalizar vale depois de recarregar; login usa a mesma cena em tela cheia', async ({ page }) => {
  await page.clock.install({ time: at(12) });
  await useBuild(page, 'a');
  await signup(page);
  await page.goto('/personalizar');
  await page.getByRole('radiogroup', { name: 'Cenário' }).getByRole('radio', { name: /Noite/ }).click();
  await expect.poll(() => heroScene(page)).toBe('noite');
  await page.reload();
  await expect.poll(() => heroScene(page)).toBe('noite');

  // modo foco com a cena ao fundo
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Foco por área em tela cheia' }).click();
  const bg = await page.getByRole('dialog', { name: 'Foco por área' }).evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('cume-bg-noite-login');
  await page.keyboard.press('Escape');

  await page.goto('/personalizar');
  await page.getByRole('button', { name: /Sair/ }).click();
  await expect(page.locator('.login .scene')).toHaveAttribute('data-scene', 'noite');
  const loginBg = await page.locator('.login .scene-layer').first().evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(loginBg).toContain('cume-bg-noite-login');
  await expect(page.locator('.login .box').first().getByRole('img', { name: 'Cume°' })).toBeVisible();
  await expect(page.locator('.login .box').first()).toContainText('Personal Life OS');
  await expect(page.locator('.login')).toContainText(/Foco · Clareza · Ação/i);
});
