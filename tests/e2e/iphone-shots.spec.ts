import { devices, expect, test } from '@playwright/test';
import { useBuild } from './helpers';

const { defaultBrowserType: _b, ...device } = devices['iPhone 13'];
test.use(device);
test.skip(!process.env.SHOTS, 'só para revisão visual');

test('capturas iPhone', async ({ page }) => {
  test.setTimeout(240_000);
  const dir = process.env.SHOTS;
  const shot = async (name: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${dir}/ip-${name}.png` }); };
  await useBuild(page, 'a');
  await page.goto('/');
  await shot('entrada');
  const f = page.getByRole('form', { name: 'Criar conta' });
  await f.getByLabel('Como quer ser chamada').fill('Alexia');
  await f.getByLabel('Seu e-mail').fill('a@cume.test');
  await f.getByLabel('Crie uma senha').fill('senha-123456');
  await f.getByLabel('Confirmar senha').fill('senha-123456');
  await f.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('dialog', { name: 'Boas-vindas ao Cume°' })).toBeVisible({ timeout: 20_000 });
  await shot('boasvindas');
  await page.keyboard.press('Escape');
  for (const [r, n] of [['/', 'inicio'], ['/tarefas', 'tarefas'], ['/tarefas?aba=adiadas', 'adiadas'], ['/planejamento', 'planejamento'],
    ['/agenda', 'agenda'], ['/semana', 'semana'], ['/metas', 'metas'], ['/historico', 'historico'], ['/area/financeiro?aba=renda-extra', 'renda'],
    ['/personalizar', 'personalizar'], ['/calendario', 'calendario'], ['/imprevistos', 'imprevistos']] as const) {
    await page.goto(r);
    await shot(n);
  }
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Atalhos' }).getByRole('button', { name: 'Adicionar' }).click();
  await shot('adicionar');
  await page.getByRole('button', { name: 'Tarefa', exact: true }).click();
  await shot('nova-tarefa');
});
