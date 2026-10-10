import { describe, expect, it } from 'vitest';
import { seedExample } from '../../src/lib/seed';
import { open, uniqueName } from './helpers';

describe('dados de exemplo', () => {
  it('entram só com o banco vazio e nunca de novo', async () => {
    const d = open(uniqueName('seed'));
    expect(await seedExample(d)).toBe(true);
    const n = await d.tasks.count();
    expect(n).toBeGreaterThan(0);
    expect(await seedExample(d)).toBe(false);
    expect(await d.tasks.count()).toBe(n);
  });

  it('não entram se já existe qualquer dado real', async () => {
    const d = open(uniqueName('seed-real'));
    await d.tasks.add({ title: 'minha tarefa', area: 'pessoal', status: 'afazer', priority: 'media' });
    expect(await seedExample(d)).toBe(false);
    expect(await d.tasks.count()).toBe(1);
  });
});
