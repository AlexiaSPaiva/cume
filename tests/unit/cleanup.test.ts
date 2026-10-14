import { describe, expect, it } from 'vitest';
import { removeExampleData, restoreEditedExamples } from '../../src/lib/cleanup';
import { defaultSettings, seedExample } from '../../src/lib/seed';
import { open, uniqueName } from './helpers';

async function deviceWithOldExamples() {
  const d = open(uniqueName('limpa'));
  await d.account.put({ email: 'alexiapaivadev@gmail.com', salt: 's', passwordHash: 'h' });
  await d.settings.put(defaultSettings('Alexia', 'Alexia Silva Paiva'));
  await seedExample(d);
  // como as contas criadas antes desta versão: exemplo sem a marca "pedido de propósito"
  await d.meta.delete('exemplos');
  const later = new Date(Date.now() + 3_600_000).toISOString();
  await d.tasks.add({ title: 'Minha tarefa de verdade', area: 'pessoal', status: 'afazer', priority: 'media', createdAt: later });
  await d.goals.add({ title: 'Minha meta', metric: 'tarefas', initial: 0, current: 1, target: 5, area: 'saude', createdAt: later });
  await d.imprevistos.add({ title: 'Pneu furado', area: 'pessoal', type: 'Transporte', date: '2026-10-10', start: '08:00', end: '09:00', durationMin: 60, postponedTasks: false, createdAt: later });
  return d;
}

describe('remover dados de exemplo', () => {
  it('tira tudo o que é exemplo e mantém conta, configurações e o que a pessoa criou', async () => {
    const d = await deviceWithOldExamples();
    expect(await d.tasks.count()).toBeGreaterThan(10);
    const n = await removeExampleData(d);
    expect(n).toBeGreaterThan(20);

    expect((await d.tasks.toArray()).map((t) => t.title)).toEqual(['Minha tarefa de verdade']);
    expect((await d.goals.toArray()).map((g) => g.title)).toEqual(['Minha meta']);
    expect((await d.imprevistos.toArray()).map((i) => i.title)).toEqual(['Pneu furado']);
    for (const t of ['objectives', 'events', 'docs', 'clients', 'freelanceEntries', 'financeTxs', 'metrics', 'metricEntries'] as const) {
      expect(await d.table(t).count()).toBe(0);
    }
    expect(await d.plans.count()).toBe(0);
    expect(await d.account.get('alexiapaivadev@gmail.com')).toBeTruthy();
    const s = await d.settings.get('me');
    expect(s?.name).toBe('Alexia');
    expect(s?.freelanceGoal).toBeUndefined();
    // cópia de segurança do que saiu
    expect((await d.meta.get('exemplos-removidos-copia'))?.value).toBeTruthy();

    // roda uma vez só
    await d.tasks.add({ title: 'Antena 1', area: 'profissional', status: 'afazer', priority: 'media' });
    expect(await removeExampleData(d)).toBe(0);
    expect(await d.tasks.count()).toBe(2);
    d.close();
  });

  it('não mexe em exemplo pedido de propósito nem em conta sem exemplo', async () => {
    const a = open(uniqueName('limpa'));
    await a.settings.put(defaultSettings('Demo'));
    await seedExample(a);
    const before = await a.tasks.count();
    expect(await removeExampleData(a)).toBe(0);
    expect(await a.tasks.count()).toBe(before);
    a.close();

    const b = open(uniqueName('limpa'));
    await b.settings.put(defaultSettings('Nova'));
    await b.tasks.add({ title: 'Academia', area: 'saude', status: 'afazer', priority: 'media' });
    expect(await removeExampleData(b)).toBe(0);
    expect(await b.tasks.count()).toBe(1);
    b.close();
  });

  it('o que a pessoa editou ou usa fica: exemplo editado, meta ligada a uma tarefa dela e o objetivo dessa meta', async () => {
    const d = await deviceWithOldExamples();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const [edited] = (await d.tasks.toArray()).filter((x) => x.title === 'Estudar Matemática');
    await d.tasks.update(edited.id!, { title: 'Estudar Matemática (minha)', updatedAt: later });
    const goal = (await d.goals.toArray()).find((g) => g.objectiveId)!;
    await d.tasks.add({ title: 'Tarefa real ligada', area: 'academica', status: 'afazer', priority: 'media', goalId: goal.id, createdAt: later });
    await removeExampleData(d);
    expect(await d.tasks.get(edited.id!)).toBeTruthy();
    expect(await d.goals.get(goal.id!)).toBeTruthy();
    expect(await d.objectives.get(goal.objectiveId!)).toBeTruthy();
    d.close();
  });

  it('devolve da cópia o que a versão anterior da limpeza tirou mas tinha sido editado', async () => {
    const d = await deviceWithOldExamples();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const [t] = (await d.tasks.toArray()).filter((x) => x.title === 'Estudar Matemática');
    // simula a 1ª versão da limpeza: tirou a tarefa editada e guardou a cópia
    const row = { ...t, title: 'Estudar Matemática (minha)', updatedAt: later };
    await d.tasks.delete(t.id!);
    await d.meta.put({ key: 'exemplos-removidos-copia', value: { removed: { tasks: [row, { ...t, id: 99999 }] } } });
    await d.meta.put({ key: 'exemplos-removidos-v1', value: 'feito' });
    expect(await restoreEditedExamples(d)).toBe(1);
    expect((await d.tasks.get(t.id!))?.title).toBe('Estudar Matemática (minha)');
    expect(await d.tasks.get(99999)).toBeUndefined(); // não editado: não volta
    expect(await restoreEditedExamples(d)).toBe(0); // uma vez só
    d.close();
  });
});

describe('pacote de exemplo antigo', () => {
  it('os títulos de antes da troca por nomes genéricos continuam reconhecidos (só por hash)', async () => {
    const { labelHash } = await import('../../src/lib/labelHash');
    const { LEGACY_EXAMPLE_HASHES } = await import('../../src/lib/seedLegacy');
    // títulos que existiam no pacote antigo e saíram do atual
    for (const old of ['Resultado 42', 'Recarregar Riocard']) expect(LEGACY_EXAMPLE_HASHES.tasks).toContain(labelHash(old));
    expect(LEGACY_EXAMPLE_HASHES.tasks).not.toContain(labelHash('Minha tarefa de verdade'));
  });
});
