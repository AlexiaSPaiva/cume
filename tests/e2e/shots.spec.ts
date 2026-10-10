import { expect, test } from '@playwright/test';
import { attachPdf, signup, useBuild } from './helpers';

// gera capturas para revisão visual (não faz parte da suíte: rode com SHOTS=1)
test.skip(!process.env.SHOTS, 'só para revisão visual');

test('capturas da etapa', async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
  await attachPdf(page);
  await page.goto('/area/adultices/cofre');
  await page.getByRole('button', { name: /Excluir Edital/ }).click();
  await expect(page.getByText(/foi para a Lixeira/)).toBeVisible();
  for (const w of [360, 768, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/personalizar');
    await page.getByText('Seus dados').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.SHOTS}/personalizar-${w}.png`, fullPage: false });
  }
});
