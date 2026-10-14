import { expect, test } from '@playwright/test';
import { useBuild } from './helpers';

/**
 * Screenshots for the README (sample data). Not part of the suite:
 * README_SHOTS=docs/screenshots pnpm exec playwright test readme-shots --project=chrome
 */
const DIR = process.env.README_SHOTS;

test('readme screenshots', async ({ page }) => {
  test.skip(!DIR, 'set README_SHOTS');
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/${name}.png` });
  };
  await useBuild(page, 'a');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('Seu e-mail').fill('demo@cume.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await shot('desktop-home');
  await page.goto('/metas');
  await shot('desktop-goals');
  await page.goto('/agenda');
  await shot('desktop-agenda');
  await page.goto('/planejamento');
  await shot('desktop-planning');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await shot('mobile-home');
  await page.goto('/tarefas');
  await shot('mobile-tasks');
});
