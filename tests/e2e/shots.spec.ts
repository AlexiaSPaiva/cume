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
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
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
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
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

test('capturas renda extra', async ({ page }) => {
  const dir = process.env.SHOTS;
  const shot = async (name: string, full = false) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: full });
  };
  await useBuild(page, 'a');
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/area/financeiro?aba=renda-extra');
  await shot('4d-renda', true);
  await page.goto('/area/financeiro');
  await shot('4d-visao');
  await page.goto('/area/financeiro?aba=reserva');
  await shot('4d-reserva');
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto('/area/financeiro?aba=renda-extra');
  await shot('4t-renda', true);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/area/financeiro?aba=renda-extra');
  await shot('4m-renda', true);
});

test('capturas marca Cume°', async ({ page }) => {
  const dir = process.env.SHOTS;
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/${name}.png` });
  };
  await page.clock.install({ time: new Date(2026, 9, 9, 17, 42) });
  await useBuild(page, 'a');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await shot('c-login-novo');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible();

  for (const s of ['amanhecer', 'dia', 'entardecer', 'noite']) {
    await page.goto('/personalizar');
    await page.getByRole('radiogroup', { name: 'Cenário' }).getByRole('radio', { name: new RegExp(`^${s}`, 'i') }).click();
    for (const [w, h, tag] of [[1280, 800, 'd'], [768, 1000, 't'], [360, 780, 'm']] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await shot(`c-${tag}-${s}`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  await page.goto('/personalizar');
  await shot('c-personalizar');
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await page.goto('/');
  await shot('c-recolhido');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Abrir Top 3 de hoje em tela cheia' }).click();
  await shot('c-foco');
  await page.keyboard.press('Escape');
  await page.goto('/personalizar');
  await page.getByRole('button', { name: /Sair/ }).click();
  await shot('c-login-d');
  await page.setViewportSize({ width: 360, height: 780 });
  await shot('c-login-m');
});

test('capturas histórico', async ({ page }) => {
  const dir = process.env.SHOTS;
  const shot = async (name: string, full = false) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: full });
  };
  await useBuild(page, 'a');
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/historico?periodo=semana');
  await shot('5d-semana', true);
  await page.goto('/historico');
  await shot('5d-mes', true);
  await page.goto('/historico?periodo=ano');
  await shot('5d-ano');
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto('/historico');
  await shot('5t-mes', true);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/historico');
  await shot('5m-mes', true);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.emulateMedia({ media: 'print' });
  await page.goto('/historico');
  await shot('5p-print', true);
});

test('capturas entrada e boas-vindas', async ({ page }) => {
  const dir = process.env.SHOTS;
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${dir}/${name}.png` });
  };
  await useBuild(page, 'a');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/');
  await shot('6d-entrada-vazia');
  const f = page.getByRole('form', { name: 'Criar conta' });
  await f.getByLabel('Como quer ser chamada').fill('Alexia');
  await f.getByLabel('Seu e-mail').fill('alexia@cume.test');
  await f.getByLabel('Crie uma senha').fill('senha-123456');
  await f.getByLabel('Confirmar senha').fill('senha-123456');
  await f.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('dialog', { name: 'Boas-vindas ao Cume°' })).toBeVisible();
  await shot('6d-boasvindas');
  await page.getByRole('button', { name: 'Como usar o app' }).click();
  await shot('6d-passo1');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('6m-passo1');
  await page.keyboard.press('Escape');
  await page.goto('/personalizar');
  await page.getByRole('button', { name: /Sair/ }).click();
  await shot('6m-entrada');
  await page.setViewportSize({ width: 1280, height: 860 });
  await shot('6d-entrada');
});

test('capturas estudos', async ({ page }) => {
  test.setTimeout(180_000);
  const dir = process.env.SHOTS;
  const shot = async (name: string, full = false) => { await page.waitForTimeout(600); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: full }); };
  await useBuild(page, 'a');
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('Seu e-mail').fill('a@cume.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible({ timeout: 20_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/area/academica');
  await shot('7d-academica');
  await page.locator('.track h3 a', { hasText: 'Prefeitura' }).click();
  await shot('7d-concurso', true);
  await page.getByRole('navigation', { name: 'Abas da trilha' }).getByRole('button', { name: 'Edital e prazos' }).click();
  await shot('7d-edital', true);
  await page.goto('/area/academica');
  await page.locator('.track h3 a', { hasText: 'Iniciação científica' }).click();
  await shot('7d-pesquisa');
  await page.goto('/area/academica/cronograma');
  await shot('7d-cronograma', true);
  await page.goto('/planejamento');
  await shot('7d-planejamento');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/area/academica');
  await shot('7m-academica', true);
  await page.locator('.track h3 a', { hasText: 'Prefeitura' }).click();
  await shot('7m-concurso', true);
});
