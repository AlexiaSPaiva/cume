import { devices, expect, test, type Page } from '@playwright/test';
import { useBuild } from './helpers';

/**
 * iPhone de verdade (motor WebKit, o do Safari): nenhum botão, campo ou link pode ficar por cima de outro,
 * e nenhum texto pode vazar do próprio botão. Roda em 375 (iPhone SE/mini) e 390 px (iPhone 12–15).
 */
const ROUTES = [
  '/', '/semana', '/agenda', '/tarefas', '/tarefas?aba=lista', '/tarefas?aba=adiadas', '/tarefas?aba=lixeira', '/planejamento', '/calendario', '/metas', '/imprevistos', '/historico',
  '/area/academica', '/area/financeiro', '/area/financeiro?aba=renda-extra', '/area/financeiro?aba=reserva', '/area/adultices',
  '/area/adultices/cofre', '/personalizar',
];

async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'a[href], button, input:not([type=hidden]):not([type=file]), select, textarea, .tag, .seg';
    // com uma folha/diálogo aberto, só o que está nela importa (o resto fica coberto)
    const root: ParentNode = document.querySelector('.overlay') ?? document;
    const els = [...root.querySelectorAll<HTMLElement>(sel)].filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden], .sr-only, .bottom-nav, .menu');
    });
    const name = (el: HTMLElement) => `${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.className).trim().slice(0, 24)}"`;
    for (let i = 0; i < els.length; i++) {
      const a = els[i], ra = a.getBoundingClientRect();
      // texto que vaza do botão
      if ((a.tagName === 'BUTTON' || a.classList.contains('btn')) && a.scrollWidth > a.clientWidth + 2 && getComputedStyle(a).overflow === 'visible') {
        out.push(`${name(a)}: texto maior que o botão (${a.scrollWidth} > ${a.clientWidth})`);
      }
      for (let j = i + 1; j < els.length; j++) {
        const b = els[j];
        if (a.contains(b) || b.contains(a)) continue;
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 3 && h > 3) out.push(`${name(a)} × ${name(b)} (${Math.round(w)}×${Math.round(h)})`);
      }
    }
    return out;
  });
}

// 320 = iPhone pequeno ou Safari com o texto ampliado (aA → 115–125%): a página fica "mais estreita"
for (const [dev, label] of [['iPhone 13', '390'], ['iPhone SE', '375'], ['iPhone 14 Pro Max', '430'], ['iPhone SE', '320']] as const) {
  test.describe(`iPhone ${label}px`, () => {
    const { defaultBrowserType: _b, ...device } = devices[dev];
    test.use(label === '320' ? { ...device, viewport: { width: 320, height: 568 } } : device);

    test('nada se sobrepõe em nenhuma tela', async ({ page }) => {
      test.setTimeout(240_000);
      await useBuild(page, 'a');
      await page.goto('/?exemplos=1');
      await page.getByLabel('Como quer ser chamada').fill('Teste');
      await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
      await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
      await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
      await page.getByRole('button', { name: 'Criar e entrar' }).click();
      await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible({ timeout: 30_000 });
      const all: string[] = [];
      for (const r of ROUTES) {
        await page.goto(r);
        await page.waitForTimeout(250);
        all.push(...(await problems(page)).map((p) => `${r}: ${p}`));
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (wide > 1) all.push(`${r}: a página passa ${wide}px da largura da tela`);
        // campo com letra menor que 16px faz o Safari dar zoom ao tocar
        const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), select, textarea')]
          .filter((el) => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16)
          .map((el) => (el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.tagName).slice(0, 24)));
        all.push(...small.map((x) => `${r}: campo "${x}" com letra < 16px (zoom do Safari)`));
      }
      // diálogos (folhas que sobem de baixo)
      await page.goto('/');
      await page.getByRole('navigation', { name: 'Atalhos' }).getByRole('button', { name: 'Adicionar' }).click();
      await page.getByRole('button', { name: 'Tarefa', exact: true }).click();
      await page.waitForTimeout(300);
      all.push(...(await problems(page)).map((p) => `nova tarefa: ${p}`));
      expect(all, all.join('\n')).toEqual([]);
    });

    test('login e cadastro', async ({ page }) => {
      await useBuild(page, 'a');
      await page.goto('/');
      await page.waitForTimeout(300);
      const p = await problems(page);
      expect(p, p.join('\n')).toEqual([]);
    });
  });
}
