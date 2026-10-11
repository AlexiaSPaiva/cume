import { expect, test, type Page } from '@playwright/test';
import { useBuild } from './helpers';

async function withExamples(page: Page) {
  await useBuild(page, 'a');
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Teste');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible({ timeout: 20_000 });
}

test('Adiadas: abas, realocar a mesma tarefa, histórico, adiar com motivo, lixeira', async ({ page }) => {
  await withExamples(page);
  await page.goto('/tarefas');
  const tabs = page.getByRole('navigation', { name: 'Abas de Tarefas' });
  await tabs.getByRole('button', { name: /Adiadas/ }).click();
  await expect(page).toHaveURL(/aba=adiadas/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tarefas adiadas' })).toBeVisible();
  for (const k of ['Adiadas agora', 'Adiadas no mês', 'Mais adiada', 'Motivo mais comum', 'Taxa de retomada']) await expect(page.locator('.stats')).toContainText(k);

  const rows = page.locator('.adi-row');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  const title = (await rows.first().locator('.adi-title').innerText()).trim();

  // Realocar: abre a gaveta, mostra horas livres e sugestão
  await rows.first().getByRole('button', { name: 'Realocar' }).click();
  const dlg = page.getByRole('dialog', { name: 'Realocar tarefa' });
  await expect(dlg).toContainText(title);
  await expect(dlg).toContainText('Horas livres');
  await expect(dlg).toContainText('Sugestão');
  await dlg.getByRole('button', { name: /^Realocar para/ }).click();
  await expect(page.getByRole('status')).toContainText('realocada');
  await expect(page.locator('.adi-row', { hasText: title })).toHaveCount(0);
  await expect(page.locator('.hist-item', { hasText: title })).toContainText('realocada');

  // Adiar com motivo pelo menu ⋯ do quadro
  await tabs.getByRole('button', { name: 'Quadro' }).click();
  const card = page.locator('.cols5 .tcard').filter({ hasNotText: 'Renda extra' }).first();
  const t2 = (await card.locator('b').first().innerText()).trim();
  await card.getByRole('button', { name: `Ações: ${t2}` }).click();
  await page.getByRole('menuitem', { name: 'Adiar' }).click();
  const adiar = page.getByRole('dialog', { name: 'Adiar tarefa' });
  await adiar.getByRole('radio', { name: 'Sem energia' }).click();
  await adiar.getByRole('button', { name: 'Adiar' }).click();
  await tabs.getByRole('button', { name: /Adiadas/ }).click();
  const row2 = page.locator('.adi-row', { hasText: t2 });
  await expect(row2).toContainText('Sem energia');

  // excluir → Lixeira → restaurar
  await row2.getByRole('button', { name: /Ações/ }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await expect(page.locator('.adi-row', { hasText: t2 })).toHaveCount(0);
  await expect(page.locator('.hist-item', { hasText: t2 })).toContainText('excluída');
  await tabs.getByRole('button', { name: 'Lixeira' }).click();
  await page.locator('.hist-item', { hasText: t2 }).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.locator('.hist-item', { hasText: t2 })).toHaveCount(0);
  await tabs.getByRole('button', { name: /Adiadas/ }).click();
  await expect(page.locator('.adi-row', { hasText: t2 })).toHaveCount(1);
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('deslizar um item revela Realocar e Excluir', async ({ page }) => {
    await withExamples(page);
    await page.goto('/tarefas?aba=adiadas');
    const front = page.locator('.swipe-front').first();
    const box = (await front.boundingBox())!;
    const y = box.y + box.height / 2;
    await front.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: box.x + box.width - 20, clientY: y, isPrimary: true });
    for (const dx of [20, 60, 120, 200]) {
      await front.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 1, clientX: box.x + box.width - 20 - dx, clientY: y, isPrimary: true });
    }
    await front.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1, clientX: box.x + box.width - 220, clientY: y, isPrimary: true });
    const sw = page.locator('.swipe.open').first();
    await expect(sw).toBeVisible();
    await sw.getByRole('button', { name: 'Realocar' }).click();
    await expect(page.getByRole('dialog', { name: 'Realocar tarefa' })).toBeVisible();
  });
});
