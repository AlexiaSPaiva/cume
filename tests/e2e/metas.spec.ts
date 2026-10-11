import { expect, test } from '@playwright/test';
import { signup, useBuild } from './helpers';

test('meta nova: sem alvo nem valores; o progresso anda conforme as tarefas são concluídas', async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
  await page.goto('/metas');
  await page.getByRole('button', { name: '+ Nova meta' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nova meta' });
  await expect(dlg.getByLabel('Alvo')).toHaveCount(0);
  await expect(dlg.getByLabel('Valor inicial')).toHaveCount(0);
  await dlg.getByLabel('Meta', { exact: true }).fill('Terminar o módulo de SQL');
  for (const x of ['Aula 1', 'Aula 2', 'Exercícios', 'Projeto']) {
    await dlg.getByLabel('Nova tarefa para esta meta').fill(x);
    await dlg.getByRole('button', { name: 'Adicionar' }).click();
  }
  await expect(dlg).toContainText('0 de 4 = 0%');
  await dlg.getByRole('button', { name: 'Salvar' }).click();

  const row = page.locator('.metric', { hasText: 'Terminar o módulo de SQL' });
  await expect(row).toContainText('0%');

  // concluir uma tarefa ligada → 25%
  await row.getByRole('button', { name: 'Tarefas de Terminar o módulo de SQL' }).click();
  const tasks = page.getByRole('dialog', { name: /Tarefas · Terminar o módulo de SQL/ });
  await expect(tasks).toContainText('0 de 4');
  await tasks.getByRole('button', { name: 'Aula 1' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar tarefa' });
  await edit.getByLabel('Situação').selectOption('concluido');
  await page.keyboard.press('Escape');
  await expect(page.locator('.metric', { hasText: 'Terminar o módulo de SQL' })).toContainText('25%');
});

test('meta por valor (atual e alvo): ideal para dinheiro e quantidades', async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
  await page.goto('/metas');
  await page.getByRole('button', { name: '+ Nova meta' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nova meta' });
  await dlg.getByLabel('Meta', { exact: true }).fill('Reserva de emergência');
  await dlg.getByRole('radio', { name: 'Por valor (atual e alvo)' }).click();
  await dlg.getByLabel('Unidade (opcional)').fill('R$');
  await dlg.getByLabel('Atual').fill('3500');
  await dlg.getByLabel('Alvo').fill('10000');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  const row = page.locator('.metric', { hasText: 'Reserva de emergência' });
  await expect(row).toContainText('R$ 3.500/10.000');
  await expect(row).toContainText('35%');
  // + registra um novo valor (soma ao atual)
  await row.getByRole('button', { name: 'Registrar valor de Reserva de emergência' }).click();
  const rec = page.getByRole('dialog', { name: /Registrar · Reserva de emergência/ });
  await rec.getByRole('spinbutton').first().fill('1500');
  await rec.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.locator('.metric', { hasText: 'Reserva de emergência' })).toContainText('50%');
});

test('tarefa semanal da meta: repete até a data final e o progresso conta os dias', async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
  await page.goto('/metas');
  await page.getByRole('button', { name: '+ Nova meta' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nova meta' });
  await dlg.getByLabel('Meta', { exact: true }).fill('Estudar para o vestibular');
  await dlg.getByLabel('Nova tarefa para esta meta').fill('Estudar Matemática');
  // todos os dias, de hoje até daqui a 6 dias = 7 dias de estudo
  for (const d of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) await dlg.getByRole('group', { name: 'Dias da semana da tarefa nova' }).getByRole('button', { name: d }).click();
  const end = await page.evaluate(() => { const x = new Date(); x.setDate(x.getDate() + 6); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
  await dlg.getByLabel('Repetir até').fill(end);
  await dlg.getByRole('button', { name: 'Adicionar' }).click();
  await expect(dlg).toContainText('0 de 7 dias');
  await expect(dlg).toContainText('0 de 7 = 0%');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('.metric', { hasText: 'Estudar para o vestibular' })).toContainText('0%');

  // aparece em Minha semana e marca o dia de hoje
  await page.goto('/semana');
  await page.getByRole('button', { name: /^Marcar Estudar Matemática como feita em/ }).click();
  await expect(page.getByRole('button', { name: /^Desfazer Estudar Matemática em/ })).toHaveCount(1);
  await page.goto('/metas');
  await expect(page.locator('.metric', { hasText: 'Estudar para o vestibular' })).toContainText('14%');
});
