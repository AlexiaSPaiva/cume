import { describe, expect, it } from 'vitest';
import { withTaskProgress } from '../../src/lib/data';
import type { Goal, Task } from '../../src/lib/types';
import { goalPct } from '../../src/lib/week';

const g = (p: Partial<Goal>): Goal => ({ id: 1, title: 'Meta', metric: 'tarefas', initial: 0, current: 0, target: 0, area: 'academica', ...p });
const t = (p: Partial<Task>): Task => ({ title: 'x', area: 'academica', status: 'afazer', priority: 'media', ...p });

describe('metas pelas tarefas', () => {
  it('progresso = tarefas concluídas ÷ tarefas ligadas', () => {
    const [m] = withTaskProgress([g({ byTasks: true })], [
      t({ goalId: 1, status: 'concluido' }), t({ goalId: 1 }), t({ goalId: 1, status: 'adiada' }), t({ goalId: 1, status: 'concluido' }),
      t({ goalId: 2, status: 'concluido' }), t({}),
    ]);
    expect(m).toMatchObject({ current: 2, target: 4 });
    expect(goalPct(m)).toBe(50);
  });

  it('meta nova sem tarefas fica em 0% (não 100%)', () => {
    const [m] = withTaskProgress([g({ byTasks: true, current: 0, target: 0 })], []);
    expect(goalPct(m)).toBe(0);
  });

  it('meta antiga (por valores) passa a andar pelas tarefas assim que ganha uma tarefa; sem tarefas, fica como era', () => {
    const old = g({ id: 5, metric: 'páginas', unit: 'págs', initial: 0, current: 180, target: 500 });
    expect(withTaskProgress([old], [])[0]).toEqual(old);
    const [m] = withTaskProgress([old], [t({ goalId: 5, status: 'concluido' }), t({ goalId: 5 }), t({ goalId: 5 }), t({ goalId: 5 })]);
    expect(m).toMatchObject({ byTasks: true, current: 1, target: 4, unit: 'tarefas' });
    expect(goalPct(m)).toBe(25);
  });
});
