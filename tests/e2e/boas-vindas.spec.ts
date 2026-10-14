import { expect, test } from '@playwright/test';
import { useBuild } from './helpers';

test('boas-vindas: explica o Cume°, ensina a usar, fecha e pode não aparecer mais', async ({ page, context }) => {
  await useBuild(page, 'a');
  await page.goto('/');
  const f = page.getByRole('form', { name: 'Criar conta' });
  await f.getByLabel('Como quer ser chamada').fill('Lia');
  await f.getByLabel('Seu e-mail').fill('lia@cume.test');
  await f.getByLabel('Crie uma senha').fill('senha-123456');
  await f.getByLabel('Confirmar senha').fill('senha-123456');
  await f.getByRole('button', { name: 'Criar e entrar' }).click();

  const w = page.getByRole('dialog', { name: 'Boas-vindas ao Cume°' });
  await expect(w).toBeVisible();
  await expect(w).toContainText('Olá, Lia');
  await expect(w).toContainText('topo da sua vida');
  await expect(w).toContainText('objetivo que você alcança');

  // resumo: objetivo × meta × tarefa
  await expect(w).toContainText('aonde você quer chegar');
  await expect(w).toContainText('com número e prazo');
  await expect(w).toContainText('o que fazer hoje');

  // vídeo logo depois do resumo: toca, pausa, pula de capítulo e tem o roteiro em texto
  const v = w.getByRole('region', { name: 'Vídeo: tour do Cume°' });
  await expect(v).toBeVisible();
  await v.getByRole('button', { name: 'Assistir ao vídeo' }).click();
  await expect(v).toContainText('Em 3 minutos');
  await expect(v.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await v.getByRole('button', { name: /Capítulo 6: Como tudo se liga/ }).click();
  await expect(v).toContainText('6/15 · Como tudo se liga');
  await expect(v).toContainText('cada tarefa feita faz a meta andar');
  await v.getByRole('button', { name: 'Desligar a música' }).click();
  await expect(v.getByRole('button', { name: 'Ligar a música' })).toBeVisible();
  await v.getByRole('button', { name: 'Pausar' }).click();
  await expect(v.getByRole('button', { name: 'Reproduzir' })).toBeVisible();
  await v.getByText('Ler o roteiro do vídeo').click();
  await expect(v).toContainText('Calendário: o mês inteiro');

  // tutorial em passos
  await w.getByRole('button', { name: 'Como usar o app' }).click();
  await expect(w).toContainText('Passo 1 de 5');
  await expect(w).toContainText('Objetivos e Metas');
  for (let i = 2; i <= 5; i++) {
    await w.getByRole('button', { name: 'Próximo' }).click();
    await expect(w).toContainText(`Passo ${i} de 5`);
  }
  await w.getByRole('button', { name: 'Voltar' }).click();
  await expect(w).toContainText('Passo 4 de 5');
  await w.getByRole('button', { name: 'Próximo' }).click();

  // fechar sem marcar: some agora, volta quando o app abrir de novo
  await w.getByRole('button', { name: 'Começar a subida' }).click();
  await expect(w).toBeHidden();
  const p2 = await context.newPage();
  await p2.goto('/');
  const w2 = p2.getByRole('dialog', { name: 'Boas-vindas ao Cume°' });
  await expect(w2).toBeVisible();

  // "Não mostrar de novo"
  await w2.getByLabel('Não mostrar de novo').check();
  await w2.getByRole('button', { name: 'Pular' }).click();
  await expect(w2).toBeHidden();
  const p3 = await context.newPage();
  await p3.goto('/');
  await expect(p3.getByRole('heading', { name: /Olá, Lia/ })).toBeVisible();
  await p3.waitForTimeout(500);
  await expect(p3.getByRole('dialog', { name: 'Boas-vindas ao Cume°' })).toHaveCount(0);

  // dá para rever em Personalizar
  await p3.goto('/personalizar');
  await p3.getByRole('button', { name: 'Ver as boas-vindas' }).click();
  await expect(p3.getByRole('dialog', { name: 'Boas-vindas ao Cume°' })).toBeVisible();
});
