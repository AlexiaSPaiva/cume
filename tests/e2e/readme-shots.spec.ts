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
    // the sample data mirrors a real routine: swap personal names for generic ones before the picture
    await page.evaluate(() => {
      const swaps: [RegExp, string][] = [
        [/Reunião extra na Antena 1/g, 'Reunião extra no trabalho'], [/Antena 1 · dev técnico/g, 'Trabalho · sprint'],
        [/Antena 1/g, 'Trabalho'], [/Nubank/g, 'cartão A'], [/Itaú/g, 'cartão B'], [/Candidaturas LinkedIn/g, 'Revisar portfólio'],
        [/Candidaturas/g, 'Portfólio'], [/Proposta WomanTech/g, 'Proposta freelance'], [/WomanTech/g, 'freelance'],
        [/Mackenzie e Cruzeiro do Sul/g, 'Faculdade e pós'], [/Mackenzie/g, 'Faculdade'], [/Cruzeiro/g, 'Pós'], [/GEUX/g, 'Grupo de estudos'],
        [/Renda R\$ 10k\/mês/g, 'Renda extra'], [/R\$ 10k\/mês até/g, 'até'], [/R\$ 10k\/mês/g, 'meta'],
      ];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        let t = n.nodeValue ?? '';
        for (const [re, to] of swaps) t = t.replace(re, to);
        if (t !== n.nodeValue) n.nodeValue = t;
      }
    });
    await page.waitForTimeout(400);
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
