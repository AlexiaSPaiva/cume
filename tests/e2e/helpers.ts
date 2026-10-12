import { expect, type Page } from '@playwright/test';

export const PDF = Buffer.from('%PDF-1.4\n% edital de teste MeuPlano\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

/** volta o servidor para a versão A (cada teste começa do mesmo build) */
export async function useBuild(page: Page, v: 'a' | 'b') {
  await page.request.get(`/__switch?to=${v}`);
}

/** registra as URLs que o app tenta abrir (window.open), para conferir o conteúdo do PDF */
export async function captureOpens(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((u?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(u));
      return null;
    }) as typeof window.open;
  });
}

/** cria a conta local de teste (sem dados de exemplo) */
export async function signup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Como quer ser chamada').fill('Teste');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible();
  await closeWelcome(page);
}

/** fecha as boas-vindas (aparecem para quem entra numa conta nova) */
export async function closeWelcome(page: Page) {
  const w = page.getByRole('dialog', { name: 'Boas-vindas ao Cume°' });
  await expect(w).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(w).toBeHidden();
}

export async function attachPdf(page: Page, name = 'Edital concurso.pdf') {
  await page.goto('/area/adultices/cofre');
  await page.getByTestId('doc-file').setInputFiles({ name, mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Guardar no cofre' }).click();
  await expect(page.getByTestId('doc-open').filter({ hasText: name })).toBeVisible();
}

/** abre o PDF pelo app (visualizador) e confere que os bytes são exatamente os do arquivo anexado */
export async function expectPdfOpens(page: Page, name = 'Edital concurso.pdf') {
  await page.goto('/area/adultices/cofre');
  await page.getByTestId('doc-open').filter({ hasText: name }).click();
  await expectViewer(page);
}

/** o visualizador abriu e o "Baixar" entrega o PDF certo */
export async function expectViewer(page: Page) {
  const v = page.getByRole('dialog', { name: 'Arquivo' });
  await expect(v.getByRole('link', { name: /Abrir em tela cheia/ })).toBeVisible();
  const href = await v.getByRole('link', { name: 'Baixar' }).getAttribute('href');
  const content = await page.evaluate(async (u) => {
    const r = await fetch(u!);
    return { type: r.headers.get('content-type') ?? (await r.clone().blob()).type, text: await r.text() };
  }, href);
  expect(content.type).toContain('application/pdf');
  expect(content.text).toBe(PDF.toString());
  await page.keyboard.press('Escape');
  await expect(v).toBeHidden();
}
