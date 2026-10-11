import { expect, test, type Page } from '@playwright/test';
import { useBuild } from './helpers';

async function signupWithExamples(page: Page) {
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Teste');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await useBuild(page, 'a');
  await signupWithExamples(page);
});

test('card abre em tela cheia, fecha com Esc e com ✕ sem perder o estado nem a rolagem', async ({ page }) => {
  await page.goto('/imprevistos');
  const card = page.locator('section.card', { has: page.getByRole('heading', { name: /Histórico/ }) });
  await card.getByRole('button', { name: '30 dias' }).click();
  await page.evaluate(() => window.scrollTo(0, 300));
  const y = await page.evaluate(() => window.scrollY);

  await card.getByRole('button', { name: 'Abrir Histórico em tela cheia' }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Modo foco')).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThan(1200);
  expect(box.height).toBeGreaterThan(800);
  // o mesmo conteúdo (não remontado): o filtro escolhido continua marcado
  await expect(dialog.getByRole('button', { name: '30 dias' })).toHaveClass(/on/);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card.getByRole('button', { name: '30 dias' })).toHaveClass(/on/);
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  await expect(card.getByRole('button', { name: 'Abrir Histórico em tela cheia' })).toBeFocused();

  await card.getByRole('button', { name: 'Abrir Histórico em tela cheia' }).click();
  await dialog.getByRole('button', { name: 'Fechar modo foco' }).click();
  await expect(dialog).toBeHidden();
});

test('foco do teclado fica preso no card em tela cheia', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Foco por área em tela cheia' }).click();
  const dialog = page.getByRole('dialog', { name: 'Foco por área' });
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
});

test('Esc com um diálogo aberto por cima fecha só o diálogo', async ({ page }) => {
  await page.goto('/imprevistos');
  await page.getByRole('button', { name: 'Abrir Histórico em tela cheia' }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico' });
  await dialog.locator('.tcard-open').first().click();
  await expect(page.getByRole('dialog', { name: 'Editar imprevisto' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Editar imprevisto' })).toBeHidden();
  await expect(dialog).toBeVisible();
});

test('modo foco da tela inteira (⛶ no topo) esconde menu e cenário', async ({ page }) => {
  await page.goto('/agenda');
  await page.getByRole('button', { name: 'Abrir a tela em modo foco' }).click();
  await expect(page.locator('aside.side')).toBeHidden();
  await expect(page.locator('.hero-bg')).toBeHidden();
  await expect(page.getByText('Modo foco').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('aside.side')).toBeVisible();
});

test('menu lateral recolhido continua recolhido depois de recarregar', async ({ page }) => {
  const side = page.locator('aside.side');
  expect((await side.boundingBox())!.width).toBeGreaterThan(150);
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await expect.poll(async () => (await side.boundingBox())!.width).toBeLessThan(90);
  await expect(side.getByRole('link', { name: 'Minha semana' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible();
  expect((await side.boundingBox())!.width).toBeLessThan(90);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect.poll(async () => (await side.boundingBox())!.width).toBeGreaterThan(150);
});

test('menu ⋯ segue a ordem padrão e excluir mostra Desfazer', async ({ page }) => {
  await page.goto('/tarefas');
  // uma tarefa comum (blocos de renda extra se repetem em vários dias com o mesmo nome)
  const first = page.locator('.cols5 .tcard').filter({ hasNotText: 'Renda extra' }).first();
  const title = (await first.locator('b').first().innerText()).trim();
  await first.getByRole('button', { name: `Ações: ${title}` }).click();
  const items = await page.getByRole('menuitem').allInnerTexts();
  const order = ['Abrir', 'Editar', 'Mover', 'Adiar', 'Duplicar', 'Excluir'];
  const idx = items.map((t) => order.findIndex((o) => t.trim().startsWith(o)));
  expect(idx.every((v) => v >= 0)).toBe(true);
  expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  expect(items[items.length - 1].trim()).toBe('Excluir');

  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await expect(page.getByRole('status')).toContainText('Lixeira');
  await expect(page.locator('.cols5 .tcard b', { hasText: title })).toHaveCount(0);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.locator('.cols5 .tcard b', { hasText: title }).first()).toBeVisible();
});

test('duplicar cria uma cópia nova', async ({ page }) => {
  await page.goto('/tarefas');
  const first = page.locator('.cols5 .tcard').filter({ hasNotText: 'Renda extra' }).first();
  const title = (await first.locator('b').first().innerText()).trim();
  await first.getByRole('button', { name: `Ações: ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(page.locator('.cols5 .tcard b', { hasText: `${title} (cópia)` })).toBeVisible();
});

test('sem internet aparece o selo "salvo no aparelho"', async ({ page, context }) => {
  await expect(page.getByText('salvo no aparelho')).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByText('salvo no aparelho')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('salvo no aparelho')).toHaveCount(0);
});

test.describe('celular', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test('card em tela cheia cobre a barra inferior e fecha arrastando para baixo', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir Foco por área em tela cheia' }).click();
    const dialog = page.getByRole('dialog', { name: 'Foco por área' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Atalhos' })).toBeHidden();
    const h = (await dialog.locator('.focus-handle').boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y + 200, { steps: 8 });
    await page.mouse.up();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Atalhos' })).toBeVisible();
  });
});
