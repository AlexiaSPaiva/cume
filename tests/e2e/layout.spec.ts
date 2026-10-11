import { expect, test, type Page } from '@playwright/test';
import { useBuild } from './helpers';

const ROUTES = [
  '/', '/semana', '/agenda', '/tarefas', '/tarefas?aba=lista', '/tarefas?aba=adiadas', '/tarefas?aba=lixeira', '/planejamento', '/calendario', '/metas', '/imprevistos',
  '/area/academica', '/area/academica/cronograma', '/historico', '/area/profissional', '/area/saude', '/area/pessoal', '/area/financeiro', '/area/adultices',
  '/area/adultices/cofre', '/personalizar',
];
const WIDTHS = [360, 767, 768, 1199, 1200, 1280];

async function signupWithExamples(page: Page) {
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Teste');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible();
}

test('nenhuma tela tem rolagem horizontal (360 a 1280 px, incluindo os limites 767/768 e 1199/1200)', async ({ page }) => {
  await useBuild(page, 'a');
  await signupWithExamples(page);
  const problems: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForTimeout(120);
      const { sw, cw, culprit } = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        let culprit = '';
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const rect = el.getBoundingClientRect();
          if (rect.right > cw + 1 && rect.width > 0 && getComputedStyle(el).position !== 'fixed') {
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

test('casca: menu lateral no desktop, trilho no tablet, barra inferior no celular', async ({ page }) => {
  await useBuild(page, 'a');
  await signupWithExamples(page);
  const side = page.locator('aside.side');
  const bottom = page.getByRole('navigation', { name: 'Atalhos' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(side).toBeVisible();
  await expect(side.getByText('Minha semana')).toBeVisible();
  await expect(bottom).toBeHidden();

  await page.setViewportSize({ width: 900, height: 800 });
  await expect(side).toBeVisible();
  expect((await side.boundingBox())!.width).toBeLessThan(90);
  await expect(side.getByRole('link', { name: 'Minha semana' })).toBeVisible(); // ícone com nome acessível
  await expect(bottom).toBeHidden();

  await page.setViewportSize({ width: 360, height: 780 });
  await expect(side).toBeHidden();
  await expect(bottom).toBeVisible();
  await bottom.getByRole('link', { name: 'Semana' }).click();
  await expect(page).toHaveURL(/\/semana$/);
  await bottom.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByRole('dialog', { name: 'Adicionar' })).toBeVisible();
  await page.getByRole('button', { name: 'Imprevisto' }).click();
  await expect(page.getByRole('dialog', { name: 'Registrar imprevisto' })).toBeVisible();
  await page.keyboard.press('Escape');
  await bottom.getByRole('button', { name: 'Mais' }).click();
  await page.getByRole('dialog', { name: 'Mais' }).getByRole('link', { name: 'Planejamento' }).click();
  await expect(page).toHaveURL(/\/planejamento$/);
});

test.describe('celular com toque', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test('botões, campos e atalhos têm pelo menos 44×44 px', async ({ page }) => {
    await useBuild(page, 'a');
    await signupWithExamples(page);
    const small: string[] = [];
    for (const r of ['/', '/tarefas', '/planejamento', '/area/adultices/cofre', '/personalizar']) {
      await page.goto(r);
      await page.waitForTimeout(120);
      const found = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('.content button, .content .btn, .content input:not([type=hidden]):not([type=range]), .content select, .bottom-nav a, .bottom-nav button')) {
          // caixa de seleção: o alvo é a linha inteira do rótulo
          const target = (el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio' ? el.closest('label') ?? el : el;
          const b = target.getBoundingClientRect();
          if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden') continue;
          if (el.closest('[hidden]') || (el as HTMLInputElement).type === 'file') continue;
          if (b.height < 43.5 || b.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
        return out;
      });
      small.push(...found.map((f) => `${r}: ${f}`));
    }
    expect(small, small.join('\n')).toEqual([]);
  });
});
