import { describe, expect, it } from 'vitest';
import { withTaskProgress } from '../../src/lib/data';
import { scheduledDates, toggleOccurrence, weeklyProgress } from '../../src/lib/recurring';
import { occurrencesForWeek } from '../../src/lib/week';
import type { Goal, Task } from '../../src/lib/types';
import { open, uniqueName } from './helpers';

// Estudar Matemática: seg, qua e sex, de 01/12/2026 (terça) até 31/12/2026 (quinta)
const mat: Task = {
  id: 1, title: 'Estudar Matemática', area: 'academica', status: 'afazer', priority: 'media',
  repeatDays: [1, 3, 5], date: '2026-12-01', repeatUntil: '2026-12-31', goalId: 10,
};
const goal: Goal = { id: 10, title: 'Estudar para o vestibular', metric: 'tarefas', initial: 0, current: 0, target: 0, area: 'academica', byTasks: true, objectiveId: 5 };

describe('tarefas semanais de metas', () => {
  it('conta os dias em que vai estudar até a data final', () => {
    const days = scheduledDates(mat, '2026-12-31');
    // dezembro/2026: 13 dias entre seg/qua/sex a partir de 01/12 (02,04,07,09,11,14,16,18,21,23,25,28,30)
    expect(days).toHaveLength(13);
    expect(days[0]).toBe('2026-12-02');
    expect(days.at(-1)).toBe('2026-12-30');
  });

  it('o progresso da meta = dias feitos ÷ dias até o fim (somando tarefas comuns)', () => {
    const done = { ...mat, doneDates: ['2026-12-02', '2026-12-04', '2026-12-07', '2027-01-04'] };
    expect(weeklyProgress(done, goal, '2026-12-08')).toMatchObject({ done: 3, total: 13, dueSoFar: 3 });
    const simulado: Task = { id: 2, title: 'Fazer simulado', area: 'academica', status: 'concluido', priority: 'alta', goalId: 10 };
    const [g] = withTaskProgress([goal], [done, simulado]);
    expect(g.current).toBe(4);
    expect(g.target).toBe(14);
  });

  it('sem data final na tarefa, usa o prazo da meta', () => {
    const t = { ...mat, repeatUntil: undefined };
    expect(weeklyProgress(t, { deadline: '2026-12-11' }).total).toBe(5);
  });

  it('não aparece na semana depois da data final, e marca feito por dia', async () => {
    expect(occurrencesForWeek([mat], '2026-12-28').map((o) => o.date)).toEqual(['2026-12-28', '2026-12-30']);
    expect(occurrencesForWeek([mat], '2027-01-04')).toHaveLength(0);

    const d = open(uniqueName('rec'));
    const id = (await d.tasks.add({ ...mat, id: undefined })) as number;
    expect(await toggleOccurrence(id, '2026-12-02', d)).toBe(true);
    const occ = occurrencesForWeek([(await d.tasks.get(id))!], '2026-11-30');
    expect(occ.find((o) => o.date === '2026-12-02')?.done).toBe(true);
    expect(occ.find((o) => o.date === '2026-12-04')?.done).toBe(false);
    expect(await toggleOccurrence(id, '2026-12-02', d)).toBe(false);
    expect((await d.tasks.get(id))?.doneDates).toEqual([]);
  });
});
