import { expect, test } from '@playwright/test';
import { useBuild } from './helpers';

test('Foco por área responde ao Planejamento', async ({ page }) => {
  await useBuild(page, 'a');
  await page.goto('/?exemplos=1');
  await page.getByLabel('Como quer ser chamada').fill('Teste');
  await page.getByLabel('Seu e-mail').fill('teste@meuplano.test');
  await page.getByLabel('Crie uma senha').fill('senha-de-teste-123');
  await page.getByLabel('Confirmar senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click(); // com os dados de exemplo
  await expect(page.getByRole('heading', { name: /Olá, Teste/ })).toBeVisible();

  const saude = () => page.locator('.card', { has: page.getByRole('heading', { name: 'Foco por área' }) }).getByTitle(/foco desejado 12%/);
  await page.getByRole('tab', { name: 'Próxima' }).click();
  await expect(saude()).toContainText('6%'); // 4h de 63h

  await page.goto('/planejamento');
  const mais = page.getByRole('button', { name: 'mais horas em Saúde' });
  for (let i = 0; i < 6; i++) await mais.click();
  // os 6 cliques rápidos contam todos (4h → 10h)
  await expect(page.locator('div', { has: mais }).getByText('10h', { exact: true }).first()).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Próxima' })).toHaveAttribute('aria-selected', 'true');
  await expect(saude()).toContainText('15%'); // 10h de 69h = 14,5% → 15% (as porcentagens somam 100)
  await expect(page.getByText('69h')).toBeVisible();
});
