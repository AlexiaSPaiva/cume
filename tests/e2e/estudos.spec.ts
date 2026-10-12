import { expect, test, type Page } from '@playwright/test';
import { PDF, signup, useBuild } from './helpers';

async function newTrack(page: Page, type: string, title: string, extra?: (dlg: ReturnType<Page['getByRole']>) => Promise<void>) {
  await page.goto('/area/academica');
  await page.getByRole('button', { name: '+ Nova trilha' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Nova trilha' });
  await dlg.getByRole('radio', { name: type, exact: true }).click();
  await dlg.getByLabel('Nome da trilha').fill(title);
  await dlg.getByLabel('Horas por semana').fill('7');
  if (extra) await extra(dlg);
  await dlg.getByRole('button', { name: 'Criar trilha' }).click();
  await expect(page).toHaveURL(/\/area\/academica\/trilha\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

// data local (toISOString é UTC: depois das 21h no Brasil já seria o dia seguinte)
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test.beforeEach(async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
});

test('concurso: matérias, necessidade, questões, gerar cronograma, edital no Calendário e boleto no Financeiro', async ({ page }) => {
  test.setTimeout(150_000);
  await newTrack(page, 'Concurso', 'Prefeitura · Analista', async (dlg) => {
    await dlg.getByLabel('Data da prova').fill(inDays(50));
    await dlg.getByLabel('Meta de acertos (%)').fill('75');
  });
  const tabs = page.getByRole('navigation', { name: 'Abas da trilha' });
  for (const t of ['Visão geral', 'Matérias', 'Cronograma', 'Edital e prazos', 'Documentos', 'Simulados']) await expect(tabs.getByRole('button', { name: t })).toBeVisible();
  await expect(page.locator('.stats')).toContainText('50 dias');

  // matérias com tópicos
  for (const [name, weight, tops] of [['Banco de Dados', '2', 'Modelo relacional\nNormalização\nSQL'], ['Português', '1', 'Crase\nRegência']] as const) {
    await page.getByRole('button', { name: '+ Matéria' }).first().click();
    const m = page.getByRole('dialog', { name: 'Nova matéria' });
    await m.getByLabel('Matéria', { exact: true }).fill(name);
    await m.getByLabel('Questões na prova').fill('10');
    await m.getByLabel('Peso').fill(weight);
    await m.getByLabel(/Tópicos/).fill(tops);
    await m.getByRole('button', { name: 'Salvar' }).click();
  }
  // lançar questões: Português acima da meta, BD abaixo
  for (const [name, total, correct] of [['Português', '20', '18'], ['Banco de Dados', '20', '10']] as const) {
    await page.getByRole('button', { name: '+ Lançar questões' }).click();
    const q = page.getByRole('dialog', { name: 'Lançar questões' });
    await q.getByLabel('Matéria').selectOption({ label: name });
    await q.getByLabel('Questões').fill(total);
    await q.getByLabel('Acertos').fill(correct);
    await q.getByRole('button', { name: 'Lançar' }).click();
  }
  await expect(page.locator('.stats')).toContainText('Banco de Dados'); // maior necessidade
  const bd = page.locator('tr', { hasText: 'Banco de Dados' });
  await expect(bd).toContainText('50%');
  await expect(bd).toContainText('alta');
  await expect(page.locator('tr', { hasText: 'Português' })).toContainText('baixa');

  await page.getByRole('button', { name: 'Gerar cronograma pela necessidade' }).click();
  await expect(page.getByRole('status')).toContainText('blocos criados');
  await tabs.getByRole('button', { name: 'Cronograma' }).click();
  // os blocos começam amanhã: podem cair na semana seguinte
  // (espera a semana desenhar antes de decidir; olhar cedo demais pulava para a semana errada)
  const blk = page.locator('.cg-blk:not(.other)').first();
  try { await expect(blk).toBeVisible({ timeout: 2500 }); } catch { await page.getByRole('button', { name: 'Próximo' }).click(); }
  await expect(blk).toBeVisible();

  // edital: data com alerta e no Calendário geral
  await tabs.getByRole('button', { name: 'Edital e prazos' }).click();
  await page.getByLabel('Nome da data').fill('Cartão de confirmação');
  await page.getByLabel('Data', { exact: true }).fill(inDays(3));
  await page.getByRole('button', { name: '+ data' }).click();
  await expect(page.locator('.list', { hasText: 'Cartão de confirmação' }).first()).toBeVisible();
  await page.getByRole('button', { name: /Edital lido/ }).click();
  await expect(page.locator('.stepper li.done')).toHaveCount(1);
  await page.goto('/calendario');
  await expect(page.getByText('Prefeitura · Analista · Cartão de confirmação').first()).toBeVisible();

  // boleto → vencimento no Financeiro
  await page.goBack();
  await page.getByRole('navigation', { name: 'Abas da trilha' }).getByRole('button', { name: 'Documentos' }).click();
  await page.getByLabel('Tipo do anexo').selectOption('boleto');
  await page.getByTestId('att-file').setInputFiles({ name: 'boleto.pdf', mimeType: 'application/pdf', buffer: PDF });
  const b = page.getByRole('dialog', { name: 'Boleto da inscrição' });
  await b.getByLabel('Valor (R$)').fill('95,00');
  await b.getByLabel('Vencimento').fill(inDays(5));
  await b.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('.att-row', { hasText: 'boleto.pdf' })).toContainText('R$ 95,00');
  await expect(page.locator('.att-row', { hasText: 'boleto.pdf' })).toContainText('a pagar');
  await page.goto('/area/financeiro?aba=contas');
  await expect(page.getByText('Boleto · Prefeitura · Analista').first()).toBeVisible();
});

test('pesquisa: artigo com nota salva sozinha e diário com data', async ({ page }) => {
  await newTrack(page, 'Pesquisa', 'GEUX · iniciação científica');
  await page.getByRole('button', { name: '+ anexar PDF' }).click();
  await page.getByTestId('att-file').setInputFiles({ name: 'Usability of mHealth apps.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.locator('.art', { hasText: 'Usability of mHealth apps.pdf' })).toBeVisible();
  await page.getByLabel('Objetivo').fill('Mapear métodos de avaliação de usabilidade');
  await page.getByLabel('Objetivo').blur(); // sair do campo grava na hora
  await page.getByLabel('O que você avançou hoje?').fill('Triagem de 8 artigos');
  await page.getByLabel('Horas').fill('1,5');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.locator('.timeline li').first()).toContainText('Triagem de 8 artigos');
  await expect(page.locator('.timeline li').first()).toContainText('1h30');
  await page.reload();
  await expect(page.getByLabel('Objetivo')).toHaveValue('Mapear métodos de avaliação de usabilidade');
  await expect(page.locator('.stats')).toContainText('há 0 dias');
});

test('curso: módulos e progresso; estudar agora registra a sessão; Planejamento abre o Cronograma em modo foco', async ({ page }) => {
  await newTrack(page, 'Curso', 'Python para Dados');
  await page.getByRole('navigation', { name: 'Abas da trilha' }).getByRole('button', { name: 'Módulos' }).click();
  for (const m of ['Pandas', 'Visualização']) {
    await page.getByRole('button', { name: '+ módulo' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Módulo', { exact: true }).fill(m);
    await dlg.getByRole('button', { name: 'Salvar' }).click();
  }
  await page.getByLabel('Pandas concluído').click();
  await expect(page.getByLabel('Pandas concluído')).toBeChecked();
  await page.goto('/area/academica');
  const card = page.locator('.track', { hasText: 'Python para Dados' });
  await expect(card).toContainText('Módulo 2 de 2');
  await expect(card).toContainText('50% do curso');

  await card.getByRole('button', { name: '▶ Estudar agora' }).click();
  const timer = page.getByRole('dialog', { name: 'Estudar · Python para Dados' });
  await expect(timer).toContainText('Foco');
  await timer.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByRole('status')).toContainText('Sessão registrada');

  await page.goto('/planejamento');
  await expect(page.getByRole('heading', { name: /Estudos da semana/ })).toBeVisible();
  await expect(page.getByText('via Cronograma de estudos')).toBeVisible();
  await page.getByRole('link', { name: 'Abrir planejamento de estudos ›' }).click();
  await expect(page).toHaveURL(/cronograma\?foco=1/);
  await expect(page.locator('.shell.page-focus')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/planejamento$/);
});

test('colar o conteúdo do edital: só os itens numerados viram tópicos, agrupados por seção', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const edital = readFileSync('tests/fixtures/edital-historia.txt', 'utf-8');
  await newTrack(page, 'Concurso', 'Vestibular');
  await page.getByRole('navigation', { name: 'Abas da trilha' }).getByRole('button', { name: 'Matérias' }).click();
  await page.getByRole('button', { name: '+ Matéria' }).first().click();
  const m = page.getByRole('dialog', { name: 'Nova matéria' });
  await m.getByLabel('Matéria', { exact: true }).fill('História');
  await m.getByLabel(/Tópicos/).fill(edital);
  await expect(m.getByTestId('topics-preview')).toContainText('38 tópicos em 7 seções');
  await m.getByRole('button', { name: 'Salvar' }).click();

  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'História' }) });
  await expect(card.locator('.topic-row')).toHaveCount(38);
  await expect(card.locator('.topic-section')).toHaveText(['Antiguidade', 'Mundo Medieval', 'Mundo Moderno', 'Mundo Contemporâneo', 'Brasil Colônia', 'Brasil Império', 'Brasil República']);
  await expect(card.locator('.topic-row').first()).toContainText('1.1Os povos do Oriente Próximo');
  await expect(card.getByText('ANTIGUIDADE', { exact: true })).toHaveCount(0);

  // colar direto no campo "+ tópico" também funciona
  await card.getByLabel('Novo tópico de História').focus();
  await page.evaluate((t) => {
    const el = document.activeElement as HTMLInputElement;
    const dt = new DataTransfer(); dt.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, '8. EXTRA\n8.1. Tópico colado no campo.\n8.2. Outro tópico.');
  await expect(card.locator('.topic-row')).toHaveCount(40);
  await expect(card.locator('.topic-section').last()).toHaveText('Extra');
});
