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
