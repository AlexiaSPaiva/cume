import { devices, expect, test } from '@playwright/test';
import { expectViewer, PDF, signup, useBuild } from './helpers';

const { defaultBrowserType: _b, ...iphone } = devices['iPhone 13'];
test.use(iphone);

test('iPhone: anexar cabe na caixa e "ver" abre o PDF', async ({ page }) => {
  test.setTimeout(90_000);
  await useBuild(page, 'a');
  await signup(page);
  await page.goto('/area/academica');
  await page.getByRole('button', { name: '+ Nova trilha' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Nova trilha' });
  await dlg.getByRole('radio', { name: 'Concurso', exact: true }).click();
  await dlg.getByLabel('Nome da trilha').fill('Fuvest 2027');
  await dlg.getByRole('button', { name: 'Criar trilha' }).click();
  await page.getByRole('navigation', { name: 'Abas da trilha' }).getByRole('button', { name: 'Documentos' }).click();

  // nada da caixa "Anexar" passa da borda (antes o "Guardar link" vazava)
  const out = await page.locator('.att-drop').evaluate((box) => {
    const r = box.getBoundingClientRect();
    return [...box.querySelectorAll<HTMLElement>('input:not([type=file]), select, button')]
      .filter((el) => { const e = el.getBoundingClientRect(); return e.left < r.left - 1 || e.right > r.right + 1 || el.scrollWidth > el.clientWidth + 2; })
      .map((el) => el.innerText || el.getAttribute('aria-label'));
  });
  expect(out).toEqual([]);

  await page.getByLabel('Tipo do anexo').selectOption('material');
  await page.getByTestId('att-file').setInputFiles({ name: 'Fuvest2027_Questoes.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.locator('.att-row', { hasText: 'Fuvest2027_Questoes.pdf' }).getByRole('button', { name: 'ver' }).click();
  await expectViewer(page);
});
