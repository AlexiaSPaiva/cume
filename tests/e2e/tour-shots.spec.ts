import { expect, test } from '@playwright/test';
import { useBuild } from './helpers';

/**
 * Revisão visual do vídeo de boas-vindas: assiste ao vídeo inteiro e fotografa o fim de cada cena.
 * Só roda com TOUR_SHOTS=pasta (ex.: TOUR_SHOTS=../shots pnpm exec playwright test tour-shots).
 */
const DIR = process.env.TOUR_SHOTS;

for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['celular', { width: 390, height: 844 }]] as const) {
  test(`tour: cenas no ${name}`, async ({ page }) => {
    test.skip(!DIR, 'defina TOUR_SHOTS');
    test.setTimeout(300_000);
    await page.setViewportSize(vp);
    await useBuild(page, 'a');
    await page.goto('/');
    const f = page.getByRole('form', { name: 'Criar conta' });
    await f.getByLabel('Como quer ser chamada').fill('Lia');
    await f.getByLabel('Seu e-mail').fill('lia@cume.test');
    await f.getByLabel('Crie uma senha').fill('senha-123456');
    await f.getByLabel('Confirmar senha').fill('senha-123456');
    await f.getByRole('button', { name: 'Criar e entrar' }).click();
    const w = page.getByRole('dialog', { name: 'Boas-vindas ao Cume°' });
    await expect(w).toBeVisible();
    await w.screenshot({ path: `${DIR}/${name}-00-janela.png` });
    const player = w.locator('.tv-player');
    await player.scrollIntoViewIfNeeded();
    await player.screenshot({ path: `${DIR}/${name}-01-capa.png` });

    const segs = w.getByRole('group', { name: 'Capítulos' }).getByRole('button');
    const n = await segs.count();
    const durs = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tv-seg')].map((e) => Number(e.style.flexGrow)));
    await w.getByRole('button', { name: 'Assistir ao vídeo' }).click();
    const t0 = Date.now();
    let end = 0;
    for (let i = 0; i < n; i++) {
      end += durs[i];
      await page.waitForTimeout(Math.max(0, t0 + (end - 0.8) * 1000 - Date.now()));
      await player.screenshot({ path: `${DIR}/${name}-s${String(i + 1).padStart(2, '0')}.png` });
    }
  });
}
