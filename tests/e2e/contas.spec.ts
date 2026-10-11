import { expect, test, type Page } from '@playwright/test';
import { closeWelcome, useBuild } from './helpers';

async function signupAs(page: Page, name: string, email: string) {
  const f = page.getByRole('form', { name: 'Criar conta' });
  // espera a tela decidir: cadastro aberto (aparelho sem contas) ou o botão "Criar conta"
  const btn = page.getByRole('button', { name: 'Criar conta' });
  await expect(f.or(btn)).toBeVisible();
  if (await btn.isVisible()) await btn.click();
  await expect(f).toBeVisible();
  await f.getByLabel('Como quer ser chamada').fill(name);
  await f.getByLabel('Seu e-mail').fill(email);
  await f.getByLabel('Crie uma senha').fill('senha-123456');
  await f.getByLabel('Confirmar senha').fill('senha-123456');
  await f.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Olá, ${name}`) })).toBeVisible({ timeout: 20_000 });
  await closeWelcome(page);
}

async function loginAs(page: Page, email: string, pw = 'senha-123456') {
  const f = page.getByRole('form', { name: 'Entrar' });
  await f.getByLabel('E-mail').fill(email);
  await f.getByLabel('Senha').fill(pw);
  await f.getByRole('button', { name: 'Entrar' }).click();
}

async function logout(page: Page) {
  await page.goto('/personalizar');
  await page.getByRole('button', { name: /Sair/ }).click();
  await expect(page.getByRole('form', { name: 'Entrar' })).toBeVisible();
}

async function addTask(page: Page, title: string) {
  await page.getByRole('button', { name: '+ Tarefa', exact: true }).click();
  await page.getByRole('dialog').getByPlaceholder('Ex.: Estudar Matemática').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: /Criar tarefa/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await found(page, title)).toBe(true);
}

/** procura pela busca do topo (acha a tarefa esteja onde estiver) */
async function found(page: Page, title: string) {
  await page.goto('/tarefas');
  await page.getByLabel('Buscar').fill(title);
  const hit = page.locator('.search-res button', { hasText: title });
  try { await hit.first().waitFor({ timeout: 3000 }); return true; } catch { return false; }
}

test('entrada: "Entrar" em cima e "Criar conta" embaixo; app novo começa vazio', async ({ page }) => {
  await useBuild(page, 'a');
  await page.goto('/');
  const entrar = page.getByRole('form', { name: 'Entrar' });
  const criar = page.getByRole('form', { name: 'Criar conta' });
  await expect(entrar).toBeVisible();
  await expect(criar).toBeVisible(); // aparelho sem nenhuma conta: o cadastro já vem aberto
  expect((await entrar.boundingBox())!.y).toBeLessThan((await criar.boundingBox())!.y);
  await expect(page.getByText(/dados de exemplo/)).toHaveCount(0);

  await signupAs(page, 'Ana', 'ana@cume.test');
  await page.goto('/tarefas');
  await expect(page.locator('.cols5 .tcard')).toHaveCount(0); // nada fictício
});

test('duas contas no mesmo aparelho, cada uma com os próprios dados', async ({ page }) => {
  test.setTimeout(120_000);
  await useBuild(page, 'a');
  await page.goto('/');
  await signupAs(page, 'Ana', 'ana@cume.test');
  await addTask(page, 'Tarefa da Ana');
  await logout(page);

  // com conta no aparelho, o cadastro fica num botão logo abaixo do "Entrar"
  await expect(page.getByRole('button', { name: 'Criar conta' })).toBeVisible();
  await signupAs(page, 'Bia', 'bia@cume.test');
  expect(await found(page, 'Tarefa da Ana')).toBe(false);
  await addTask(page, 'Tarefa da Bia');
  await logout(page);

  await loginAs(page, 'ana@cume.test', 'senha-errada');
  await expect(page.getByRole('alert')).toContainText('senha não confere');
  await loginAs(page, 'ninguem@cume.test');
  await expect(page.getByRole('alert')).toContainText('Não há conta com esse e-mail neste navegador');
  await loginAs(page, 'ana@cume.test');
  await expect(page.getByRole('heading', { name: /Olá, Ana/ })).toBeVisible({ timeout: 20_000 });
  await closeWelcome(page);
  expect(await found(page, 'Tarefa da Ana')).toBe(true);
  expect(await found(page, 'Tarefa da Bia')).toBe(false);

  // e-mail repetido não cria outra conta
  await logout(page);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  const f = page.getByRole('form', { name: 'Criar conta' });
  await f.getByLabel('Como quer ser chamada').fill('Outra');
  await f.getByLabel('Seu e-mail').fill('ANA@cume.test');
  await f.getByLabel('Crie uma senha').fill('senha-123456');
  await f.getByLabel('Confirmar senha').fill('senha-123456');
  await f.getByRole('button', { name: 'Criar e entrar' }).click();
  await expect(f.getByRole('alert')).toContainText('Já existe uma conta');
});

test('conta da versão anterior (sem banco próprio) entra e encontra os mesmos dados', async ({ page }) => {
  test.setTimeout(120_000);
  await useBuild(page, 'a');
  await page.goto('/');
  await signupAs(page, 'Alexia', 'alexia@cume.test');
  await addTask(page, 'Dado de antes');
  // volta a conta ao formato antigo: sem dbName, como estava no aparelho dela
  await page.evaluate(() => new Promise<void>((ok, fail) => {
    const req = indexedDB.open('meuplano');
    req.onsuccess = () => {
      const tx = req.result.transaction('account', 'readwrite');
      const st = tx.objectStore('account');
      const g = st.get('alexia@cume.test');
      g.onsuccess = () => { const a = g.result; delete a.dbName; st.put(a); };
      tx.oncomplete = () => { req.result.close(); ok(); };
      tx.onerror = () => fail(tx.error);
    };
    req.onerror = () => fail(req.error);
  }));
  await page.evaluate(() => localStorage.removeItem('meuplano.db'));
  await logout(page);
  await loginAs(page, 'alexia@cume.test');
  await expect(page.getByRole('heading', { name: /Olá, Alexia/ })).toBeVisible({ timeout: 20_000 });
  await closeWelcome(page);
  expect(await found(page, 'Dado de antes')).toBe(true);
});
