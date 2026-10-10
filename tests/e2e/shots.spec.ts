import { expect, test } from '@playwright/test';
import { useBuild } from './helpers';

// gera capturas para revisão visual (não faz parte da suíte: rode com SHOTS=<pasta>)
test.skip(!process.env.SHOTS, 'só para revisão visual');

test('capturas', async ({ page }) => {
  const dir = process.env.SHOTS;
  await useBuild(page, 'a');
  await page.goto('/');
  await page.screenshot({ path: `${dir}/login-1280.png` });
  await page.getByLabel('Como quer ser chamada').fill('Alexia');
  await page.getByLabel('E-mail').fill('teste@meuplano.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/inicio-1280.png` });
  // planeja mais Saúde na semana que vem e confere que o foco muda
  await page.goto('/planejamento');
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'mais horas em Saúde' }).click();
  await page.goto('/');
  await page.getByRole('tab', { name: 'Próxima' }).click();
  await page.getByRole('heading', { name: /Foco por área/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/foco-proxima-1280.png` });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/inicio-360.png` });
});
