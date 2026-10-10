import { expect, test, type Page } from '@playwright/test';
import { useBuild } from './helpers';

const ROUTES = [
  '/', '/semana', '/agenda', '/tarefas', '/planejamento', '/calendario', '/metas', '/imprevistos',
  '/area/academica', '/area/profissional', '/area/saude', '/area/pessoal', '/area/financeiro', '/area/adultices',
  '/area/adultices/cofre', '/personalizar',
];
const WIDTHS = [360, 768, 1280];

async function signupWithExamples(page: Page) {
  await page.goto('/');
  await page.getByLabel('Como quer ser chamada').fill('Teste');
  await page.getByLabel('E-mail').fill('teste@meuplano.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible();
}

test('nenhuma tela tem rolagem horizontal (360, 768 e 1280 px)', async ({ page }) => {
  await useBuild(page, 'a');
  await signupWithExamples(page);
  const problems: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForTimeout(150);
      const { sw, cw, culprit } = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        let culprit = '';
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const rect = el.getBoundingClientRect();
          if (rect.right > cw + 1 && rect.width > 0 && getComputedStyle(el).position !== 'fixed') {
            // ignora o que está dentro de um container com rolagem própria
            let p = el.parentElement, scrolls = false;
            while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scrolls = true; break; } p = p.parentElement; }
            if (!scrolls) { culprit = `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80); break; }
          }
        }
        return { sw: document.documentElement.scrollWidth, cw, culprit };
      });
      if (sw > cw) problems.push(`${w}px ${r}: largura ${sw} > ${cw} (${culprit})`);
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
