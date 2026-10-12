import { expect, test } from '@playwright/test';
import { signup, useBuild } from './helpers';

const ym = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d; };
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

test.beforeEach(async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page);
});

test('conta com vencimento mensal: aparece em Vencimentos e no Calendário de todo mês, e pode ser marcada como paga', async ({ page }) => {
  await page.goto('/area/financeiro?aba=contas');
  await page.getByRole('button', { name: '+ Conta' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Nova conta' });
  await dlg.getByLabel('Conta').fill('Aluguel');
  const d = new Date(); d.setDate(d.getDate() + 2);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await dlg.getByLabel('Primeiro vencimento').fill(iso);
  await dlg.getByLabel('Valor (R$, opcional)').fill('1.800');
  await dlg.getByRole('button', { name: 'Salvar' }).click();

  const venc = page.locator('.card', { has: page.getByRole('heading', { name: 'Vencimentos' }) });
  await expect(venc).toContainText('Aluguel');
  await expect(venc).toContainText('R$ 1.800');
  await venc.getByRole('button', { name: /^Marcar Aluguel de .* como paga$/ }).first().click();
  await expect(venc.getByRole('button', { name: /^Desmarcar Aluguel/ }).first()).toBeVisible();

  // no Calendário geral, este mês e os próximos
  await page.goto('/calendario');
  await expect(page.locator('.card', { hasText: `${MESES[ym(0).getMonth()]}` }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Próximo' }).first().click();
  await page.getByRole('button', { name: 'Próximo' }).first().click();
  await expect(page.getByText(`${MESES[ym(2).getMonth()]} ${ym(2).getFullYear()}`)).toBeVisible();
  // o dia do vencimento tem a marca de vencimento; abrindo o dia, a conta aparece
  await page.locator('.mcell', { hasText: new RegExp(`^${d.getDate()}`) }).first().click();
  await expect(page.getByText('Aluguel').first()).toBeVisible();
});

test('meta ligada a uma trilha inteira e objetivo medido pela trilha', async ({ page }) => {
  // trilha de concurso com uma sessão de estudo concluída
  await page.goto('/area/academica');
  await page.getByRole('button', { name: '+ Nova trilha' }).first().click();
  const nt = page.getByRole('dialog', { name: 'Nova trilha' });
  await nt.getByRole('radio', { name: 'Concurso', exact: true }).click();
  await nt.getByLabel('Nome da trilha').fill('TRT · Analista');
  await nt.getByLabel('Horas por semana').fill('10');
  await nt.getByRole('button', { name: 'Criar trilha' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'TRT · Analista' })).toBeVisible();

  // objetivo medido pela trilha
  await page.goto('/metas');
  await page.getByRole('button', { name: '+ Novo objetivo' }).first().click();
  const ob = page.getByRole('dialog', { name: 'Novo objetivo' });
  await ob.getByLabel('Objetivo', { exact: true }).fill('Aprovação no TRT');
  await ob.getByLabel('Área').selectOption('academica');
  await ob.getByLabel('Como medir o andamento').selectOption({ label: 'Pela trilha: TRT · Analista' });
  await ob.getByRole('button', { name: 'Salvar' }).click();
  const card = page.locator('.card.obj', { hasText: 'Aprovação no TRT' });
  await expect(card.getByTestId('obj-track')).toContainText('medido pela trilha TRT · Analista');
  await expect(card.getByTestId('obj-track')).toContainText('Tempo');

  // meta ligada à trilha: todas as tarefas
  await card.getByRole('button', { name: '+ meta' }).click();
  const gm = page.getByRole('dialog', { name: 'Nova meta' });
  await gm.getByLabel('Meta', { exact: true }).fill('Cumprir o cronograma');
  await gm.getByLabel('Trilha de estudos da meta').selectOption({ label: 'TRT · Analista' });
  await expect(gm.getByRole('radio', { name: 'Todas as tarefas da trilha' })).toHaveAttribute('aria-checked', 'true');
  await expect(gm).toContainText('as que você criar depois entram sozinhas');
  await gm.getByRole('button', { name: 'Salvar' }).click();
  await expect(card).toContainText('Cumprir o cronograma');
});
