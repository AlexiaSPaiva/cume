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
