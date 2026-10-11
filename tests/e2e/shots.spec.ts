import { expect, test } from '@playwright/test';
import { useBuild } from './helpers';

// gera capturas para revisão visual (não faz parte da suíte: rode com SHOTS=<pasta>)
test.skip(!process.env.SHOTS, 'só para revisão visual');
test.use({ hasTouch: true });

test('capturas', async ({ page }) => {
  const dir = process.env.SHOTS;
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${dir}/${name}.png` });
  };
  await useBuild(page, 'a');
  await page.goto('/');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('E-mail').fill('teste@meuplano.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await shot('d-inicio');
  await page.setViewportSize({ width: 900, height: 1000 });
  await shot('t-inicio');
  await page.goto('/tarefas');
  await shot('t-tarefas');

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await shot('m-inicio');
  await page.goto('/tarefas');
  await page.getByRole('heading', { name: 'Tarefas', level: 1 }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 380);
  await shot('m-tarefas');
  await page.goto('/area/adultices/cofre');
  await page.getByRole('heading', { name: 'Meus arquivos' }).scrollIntoViewIfNeeded();
  await shot('m-cofre');
  await page.getByRole('navigation', { name: 'Atalhos' }).getByRole('button', { name: 'Adicionar' }).click();
  await shot('m-sheet-add');
  await page.getByRole('button', { name: /Tarefa/ }).first().click();
  await shot('m-sheet-tarefa');
});

test('capturas etapa 3', async ({ page }) => {
  const dir = process.env.SHOTS;
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/${name}.png` });
  };
  await useBuild(page, 'a');
  await page.goto('/');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('E-mail').fill('teste@meuplano.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await shot('3d-inicio');
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await shot('3d-recolhido');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.goto('/tarefas');
  const first = page.locator('.cols5 .tcard').first();
  await first.locator('.item-menu button').click();
  await shot('3d-menu');
  await page.keyboard.press('Escape');
  await page.goto('/agenda');
  await page.getByRole('button', { name: 'Abrir a tela em modo foco' }).click();
  await shot('3d-agenda-foco');
  await page.keyboard.press('Escape');
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Foco por área em tela cheia' }).click();
  await shot('3d-card-foco');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto('/imprevistos');
  await shot('3t-imprevistos');

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await shot('3m-inicio');
  await page.getByRole('button', { name: 'Abrir Top 3 de hoje em tela cheia' }).click();
  await shot('3m-card-foco');
  await page.keyboard.press('Escape');
  await page.goto('/area/adultices/cofre');
  await page.getByRole('heading', { name: /Meus arquivos/ }).scrollIntoViewIfNeeded();
  await shot('3m-cofre');
});
