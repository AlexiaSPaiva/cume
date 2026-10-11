import { expect, test } from '@playwright/test';
import { signup, useBuild } from './helpers';

test('Histórico: menu com selo novo, períodos, navegação, comparação e filtro de área', async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
  const link = page.locator('aside.side').getByRole('link', { name: /Histórico/ });
  await expect(link).toContainText(/novo/i);
  await link.click();
  await expect(page).toHaveURL(/\/historico$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Histórico e desempenho' })).toBeVisible();
  await expect(page).toHaveTitle('Cume° · Histórico');

  const periodo = page.getByRole('radiogroup', { name: 'Período' });
  await expect(periodo.getByRole('radio', { name: 'Mês' })).toHaveAttribute('aria-checked', 'true');
  for (const k of ['Horas produtivas', 'Tarefas concluídas', 'Adiamentos', 'Imprevistos', 'Metas que avançaram']) {
    await expect(page.locator('.stats')).toContainText(k);
  }
  const label = page.locator('.hist-nav b');
  const atual = await label.innerText();
  await page.getByRole('button', { name: 'Período anterior' }).click();
  await expect(label).not.toHaveText(atual);
  await expect(page).toHaveURL(/data=\d{4}-\d{2}-01/);
  await page.getByRole('button', { name: 'hoje' }).click();
  await expect(label).toHaveText(atual);

  await periodo.getByRole('radio', { name: 'Semana' }).click();
  await expect(page).toHaveURL(/periodo=semana/);
  await page.getByRole('radiogroup', { name: 'Comparar com' }).getByRole('radio', { name: 'Média 3 semanas' }).click();
  await expect(page).toHaveURL(/comparar=media/);
  await page.getByLabel('Filtrar por área').selectOption('saude');
  await expect(page).toHaveURL(/area=saude/);
  // filtro de área: o gráfico mostra só a área escolhida
  await expect(page.locator('.area-bars .ab-col')).toHaveCount(1);

  // mapa do mês: tocar num dia abre aquele dia
  await periodo.getByRole('radio', { name: 'Mês' }).click();
  await page.locator('.heat .hc').first().click();
  await expect(page).toHaveURL(/periodo=dia/);
  await expect(periodo.getByRole('radio', { name: 'Dia' })).toHaveAttribute('aria-checked', 'true');
});

test('métrica própria: criar, lançar valor e ver na tabela; Exportar PDF abre a impressão', async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
  await page.addInitScript(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed++; }; });
  await page.goto('/historico');
  await page.getByRole('button', { name: '+ criar métrica própria' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nova métrica' });
  await dlg.getByLabel('Nome').fill('Copos de água');
  await dlg.getByLabel('Unidade').fill('copos');
  await dlg.getByRole('button', { name: 'Criar métrica' }).click();
  const det = page.getByRole('dialog', { name: 'Copos de água' });
  await det.getByLabel('Valor').fill('8');
  await det.getByRole('button', { name: 'Lançar' }).click();
  await det.getByLabel('Valor').fill('6');
  await det.getByRole('button', { name: 'Lançar' }).click();
  await expect(det.locator('.row')).toHaveCount(2);
  await page.keyboard.press('Escape');

  const row = page.locator('.table.metrics tr', { hasText: 'Copos de água' });
  await expect(row).toContainText('você');
  await expect(row).toContainText('14 copos'); // soma no mês

  await page.reload();
  await expect(page.locator('.table.metrics tr', { hasText: 'Copos de água' })).toContainText('14 copos');
  await page.getByRole('button', { name: 'Exportar PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});

test('fechamento automático no dia 1º às 08:00: chega no sino e fica salvo', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 20, 10, 0) });
  await useBuild(page, 'a');
  await signup(page);
  await expect(page.getByRole('button', { name: 'Notificações' })).toBeVisible();

  // passa para 1º de novembro, 09:00, e reabre o app
  await page.clock.setFixedTime(new Date(2026, 10, 1, 9, 0));
  await page.reload();
  await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible();
  await page.getByRole('button', { name: 'Notificações' }).click();
  const note = page.getByRole('button', { name: /Fechamento de outubro/ });
  await expect(note).toBeVisible();
  await note.click();
  await expect(page).toHaveURL(/\/historico\?periodo=mes&data=2026-10-01/);
  await expect(page.locator('.resumo .note')).toContainText('outubro');

  // reabrir não duplica o fechamento
  await page.reload();
  await page.getByRole('button', { name: 'Notificações' }).click();
  await expect(page.getByRole('button', { name: /Fechamento de outubro/ })).toHaveCount(1);
});
