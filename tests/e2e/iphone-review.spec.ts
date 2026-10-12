import { devices, expect, test } from '@playwright/test';
import { useBuild } from './helpers';

const { defaultBrowserType: _b, ...device } = devices['iPhone 13'];
test.use(device);
test.skip(!process.env.REVIEW, 'só para revisão visual');

test('revisão iPhone', async ({ page }) => {
  test.setTimeout(400_000);
  const dir = process.env.REVIEW;
  let n = 0;
  const shot = async (name: string, full = true) => { await page.waitForTimeout(500); await page.screenshot({ path: `${dir}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full }); };
  await useBuild(page, 'a');
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible({ timeout: 30_000 });
  if (await page.getByRole('dialog', { name: 'Boas-vindas ao Cume°' }).isVisible()) await page.keyboard.press('Escape');
  for (const r of ['/', '/semana', '/agenda', '/tarefas', '/tarefas?aba=lista', '/tarefas?aba=adiadas', '/planejamento', '/calendario', '/metas', '/imprevistos', '/historico',
    '/area/academica', '/area/profissional', '/area/saude', '/area/pessoal', '/area/financeiro', '/area/adultices', '/area/adultices/cofre', '/area/academica/cronograma', '/personalizar']) {
    await page.goto(r);
    await shot(r.replace(/\W+/g, '_') || 'inicio');
  }
  await page.goto('/area/academica');
  const tracks = await page.locator('.track h3 a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
  for (const href of tracks.slice(0, 3)) {
    await page.goto(href);
    const tabs = page.getByRole('navigation', { name: 'Abas da trilha' }).getByRole('button');
    const k = await tabs.count();
    for (let i = 0; i < k; i++) { await tabs.nth(i).click(); await shot(`trilha${href.split('/').pop()}-${i}`); }
  }
  // menus e janelas
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Atalhos' });
  await nav.getByRole('button', { name: 'Adicionar' }).click(); await shot('adicionar', false);
  await page.getByRole('button', { name: 'Tarefa', exact: true }).click(); await shot('nova-tarefa', false);
  await page.keyboard.press('Escape');
  await nav.getByRole('button', { name: /Mais/ }).click(); await shot('mais', false);
  await page.keyboard.press('Escape');
  await page.goto('/metas');
  await page.getByRole('button', { name: '+ Nova meta' }).click(); await shot('nova-meta', false);
  await page.keyboard.press('Escape');
  await page.goto('/imprevistos');
  await page.getByRole('button', { name: /Imprevisto/ }).first().click(); await shot('novo-imprevisto', false);
  await page.keyboard.press('Escape');
  await page.goto('/');
  await page.locator('.card:has(> h2 .expand) h2 .expand').nth(1).click(); await shot('foco', false);
});
