import { devices, expect, test } from '@playwright/test';
import { useBuild } from './helpers';

test.use({ ...devices['iPhone 13'], defaultBrowserType: undefined });

test('iPhone: vídeo de boas-vindas toca, troca de capítulo e cabe na tela', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await useBuild(page, 'a');
  await page.goto('/');
  const f = page.getByRole('form', { name: 'Criar conta' });
  await f.getByLabel('Como quer ser chamada').fill('Lia');
  await f.getByLabel('Seu e-mail').fill('lia@cume.test');
  await f.getByLabel('Crie uma senha').fill('senha-123456');
  await f.getByLabel('Confirmar senha').fill('senha-123456');
  await f.getByRole('button', { name: 'Criar e entrar' }).click();

  const v = page.getByRole('region', { name: 'Vídeo: tour do Cume°' });
  await v.scrollIntoViewIfNeeded();
  await v.getByRole('button', { name: 'Assistir ao vídeo' }).click();
  await v.getByRole('button', { name: /Capítulo 8:/ }).click();
  await expect(v).toContainText('Três jeitos de ver o seu tempo');
  await page.waitForTimeout(1500);

  // o palco não passa da largura da tela
  const box = await v.locator('.tv-stage').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  if (process.env.REVIEW) await v.locator('.tv-player').screenshot({ path: `${process.env.REVIEW}/iphone-tour.png` });
  expect(errors).toEqual([]);
});
