import { expect, test } from '@playwright/test';
import { signup, useBuild } from './helpers';

test.beforeEach(async ({ page }) => {
  await useBuild(page, 'a');
  await signup(page); // sem dados de exemplo
});

test('renda extra é aba do Financeiro, não área nova', async ({ page }) => {
  const areas = page.locator('aside.side .nav a.dot');
  await expect(areas).toHaveCount(6);
  await page.goto('/area/financeiro');
  await page.getByRole('navigation', { name: 'Abas do Financeiro' }).getByRole('link', { name: /Renda extra/ }).click();
  await expect(page).toHaveURL(/\/area\/financeiro\?aba=renda-extra$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Financeiro · Renda extra' })).toBeVisible();
  await expect(page.locator('aside.side .nav a.dot.active')).toHaveText(/Financeiro/);
});

test('registrar trabalho pago: entra no saldo, bloqueia a Agenda e dias ↔ horas não muda o que foi salvo', async ({ page }) => {
  await page.goto('/area/financeiro?aba=renda-extra');
  const form = page.locator('form.entry-form');
  await form.getByLabel('Cliente').fill('Studio Lume');
  await form.getByLabel('Projeto').fill('Landing page');
  await form.getByLabel(/Quantidade/).fill('1,5');
  await expect(form.getByText('≈ 10h30')).toBeVisible();
  await form.getByLabel(/Valor por dia/).fill('400');
  await expect(form.getByText('total R$ 600')).toBeVisible();
  await form.getByRole('radio', { name: 'pago' }).click();
  await form.getByRole('button', { name: 'Salvar registro' }).click();
  await expect(page.getByRole('status')).toContainText('Entrou no saldo');

  const kpis = page.locator('.stats');
  await expect(kpis.getByText('R$ 600').first()).toBeVisible();
  const worked = page.getByTestId('worked');
  await expect(worked).toHaveText('1,5 dia');
  const unit = page.getByRole('radiogroup', { name: 'Unidade', exact: true });
  await unit.getByRole('radio', { name: 'Horas' }).click();
  await expect(worked).toHaveText('10h30');
  await unit.getByRole('radio', { name: 'Dias' }).click();
  await expect(worked).toHaveText('1,5 dia');

  // projeto e cliente entraram sozinhos
  await expect(page.locator('.proj', { hasText: 'Landing page' })).toContainText('Studio Lume');

  // continua tudo lá depois de recarregar, e o valor salvo não mudou
  await page.reload();
  await expect(page.getByTestId('worked')).toHaveText('1,5 dia');
  await expect(page.locator('.entry-row')).toContainText('R$ 600');

  // saldo do Financeiro
  await page.getByRole('link', { name: 'Reserva' }).click();
  await expect(page.locator('.stats')).toContainText('R$ 600');
  await page.getByRole('link', { name: 'Visão geral' }).click();
  await expect(page.locator('.stats')).toContainText('Saldo');
  await expect(page.locator('.stats')).toContainText('R$ 600');

  // o tempo foi para a Agenda, na área Financeiro
  await page.goto('/agenda');
  await expect(page.getByText('Renda extra · Landing page').first()).toBeVisible();
});

test('a receber → Recebi entra no saldo; excluir vai para a Lixeira com Desfazer', async ({ page }) => {
  await page.goto('/area/financeiro?aba=renda-extra');
  const form = page.locator('form.entry-form');
  await form.getByLabel('Cliente').fill('Clínica Sol');
  await form.getByRole('radio', { name: 'Horas', exact: true }).click();
  await form.getByLabel(/Quantidade/).fill('8');
  await form.getByRole('radio', { name: 'Fechado' }).click();
  await form.getByLabel(/Valor total/).fill('400');
  await form.getByRole('button', { name: 'Salvar registro' }).click();

  const aReceber = page.locator('section.card', { has: page.getByRole('heading', { name: /A receber/ }) });
  await expect(aReceber).toContainText('Clínica Sol');
  await aReceber.getByRole('button', { name: 'Recebi' }).click();
  await expect(page.getByRole('status')).toContainText('R$ 400 entrou no saldo');
  await expect(aReceber).toContainText('Nada a receber');

  const row = page.locator('.entry-row').first();
  await row.getByRole('button', { name: /Ações/ }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await expect(page.locator('.entry-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.locator('.entry-row')).toHaveCount(1);
});
