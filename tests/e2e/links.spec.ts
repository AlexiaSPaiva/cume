import { expect, test } from '@playwright/test';
import { expectViewer, PDF, signup, useBuild } from './helpers';

test.beforeEach(async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
});

test('PDF da trilha abre no visualizador; links na trilha, na matéria e no tópico abrem com um toque', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/area/academica');
  await page.getByRole('button', { name: '+ Nova trilha' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Nova trilha' });
  await dlg.getByRole('radio', { name: 'Concurso', exact: true }).click();
  await dlg.getByLabel('Nome da trilha').fill('Fuvest 2027');
  await dlg.getByRole('button', { name: 'Criar trilha' }).click();
  await expect(page).toHaveURL(/\/trilha\/\d+$/);
  const tabs = page.getByRole('navigation', { name: 'Abas da trilha' });

  // "ver" do PDF anexado abre o visualizador (antes: nada acontecia no iPhone)
  await tabs.getByRole('button', { name: 'Documentos' }).click();
  await page.getByLabel('Tipo do anexo').selectOption('material');
  await page.getByTestId('att-file').setInputFiles({ name: 'Fuvest2027_Revisao.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.locator('.att-row', { hasText: 'Fuvest2027_Revisao.pdf' }).getByRole('button', { name: 'ver' }).click();
  await expectViewer(page);

  // link da trilha (Visão geral)
  await tabs.getByRole('button', { name: 'Visão geral' }).click();
  const geral = page.locator('.card', { hasText: 'Links da trilha' });
  await geral.getByRole('button', { name: '+ link' }).click();
  await geral.getByLabel('Link', { exact: true }).fill('https://fuvest.br/vestibular');
  await geral.getByRole('button', { name: 'Guardar' }).click();
  await expect(geral.getByRole('link', { name: /fuvest\.br\/vestibular/ })).toHaveAttribute('href', 'https://fuvest.br/vestibular');

  // matéria com tópico: link na matéria e no tópico
  await tabs.getByRole('button', { name: 'Matérias' }).click();
  await page.getByRole('button', { name: '+ Matéria' }).first().click();
  const m = page.getByRole('dialog', { name: 'Nova matéria' });
  await m.getByLabel('Matéria', { exact: true }).fill('História');
  await m.getByLabel('Tópicos (opcional)').fill('Revolução Francesa');
  await m.getByRole('button', { name: 'Salvar' }).click();
  const card = page.locator('.card', { hasText: 'História' });
  await card.getByRole('button', { name: '+ link' }).click();
  await card.getByLabel('Link', { exact: true }).fill('youtube.com/watch?v=aula1');
  await card.getByLabel('Nome do link').fill('Aula 1');
  await card.getByRole('button', { name: 'Guardar' }).click();
  await expect(card.getByRole('link', { name: 'Aula 1' })).toHaveAttribute('href', 'https://youtube.com/watch?v=aula1');

  await card.locator('.topic-row', { hasText: 'Revolução Francesa' }).getByRole('button', { name: 'Ações: Revolução Francesa' }).click();
  await page.getByRole('menuitem', { name: 'Adicionar link' }).click();
  await card.getByLabel('Link', { exact: true }).fill('https://pt.khanacademy.org/revolucao');
  await card.getByRole('button', { name: 'Guardar' }).click();
  await expect(card.locator('.topic-links').getByRole('link')).toHaveAttribute('href', 'https://pt.khanacademy.org/revolucao');

  // durante o estudo, os links ficam à mão
  await tabs.getByRole('button', { name: 'Visão geral' }).click();
  await page.getByRole('button', { name: '▶ Estudar agora' }).first().click();
  const st = page.getByRole('dialog');
  await expect(st.locator('.study-links')).toContainText('fuvest.br');
});
