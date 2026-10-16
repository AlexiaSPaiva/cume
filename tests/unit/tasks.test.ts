import { describe, expect, it } from 'vitest';
import { addDays, today } from '../../src/lib/dates';
import { kpis, periodRange } from '../../src/lib/history';
import { freeByDay, lastReason, postponeTask, rescheduleTask, suggestSlot, wasFor } from '../../src/lib/tasks';
import type { Task } from '../../src/lib/types';
import { emptyData, open, uniqueName } from './helpers';

const base: Task = { title: 'Corrida no parque', area: 'saude', status: 'afazer', priority: 'media', date: '2026-10-04', start: '07:00', durationMin: 30, goalId: 7 };

describe('tarefas adiadas e realocar', () => {
  it('adiar guarda o motivo; realocar mantém o mesmo id e a meta, e entra no histórico', async () => {
    const d = open(uniqueName('adi'));
    const id = (await d.tasks.add({ ...base })) as number;
    await postponeTask(id, { text: 'Consulta de última hora', imprevistoId: 3 }, d);
    await postponeTask(id, { text: 'de novo' }, d); // já adiada: não conta duas vezes
    let t = (await d.tasks.get(id))!;
    expect(t.status).toBe('adiada');
    expect(t.postponedCount).toBe(1);
    expect(lastReason(t, [{ id: 3, title: 'Consulta de última hora' }])).toBe('Consulta de última hora');
    expect(wasFor(t)).toBe('2026-10-04');

    const day = addDays(today(), 2);
    await rescheduleTask(id, { kind: 'dia', date: day, start: '07:00' }, { remindMin: 15 }, d);
    t = (await d.tasks.get(id))!;
    expect(t.id).toBe(id);
    expect(t.goalId).toBe(7);
    expect(t.status).toBe('afazer');
    expect(t.date).toBe(day);
    expect(t.remindMin).toBe(15);
    expect(await d.tasks.count()).toBe(1); // nunca cria cópia
    expect(t.postponeLog!.map((e) => e.kind)).toEqual(['adiada', 'realocada']);
    expect(t.postponeLog![1]).toMatchObject({ from: '2026-10-04', to: `${day} 07:00` });

    // adiar de novo soma; mandar para o backlog tira o dia
    await postponeTask(id, { text: 'Sem tempo' }, d);
    await rescheduleTask(id, { kind: 'backlog' }, {}, d);
    t = (await d.tasks.get(id))!;
    expect(t.postponedCount).toBe(2);
    expect(t.date).toBeUndefined();
    expect(t.postponeLog!.at(-1)).toMatchObject({ kind: 'realocada', to: 'backlog' });
    d.close();
  });

  it('quebrar em 2 sessões: divide a duração e liga a 2ª sessão à tarefa original', async () => {
    const d = open(uniqueName('adi'));
    const id = (await d.tasks.add({ ...base, durationMin: 60 })) as number;
    const day = addDays(today(), 1);
    await rescheduleTask(id, { kind: 'dia', date: day, start: '19:00' }, { split: 2 }, d);
    const all = await d.tasks.toArray();
    expect(all).toHaveLength(2);
    expect(all.find((x) => x.id === id)!.durationMin).toBe(30);
    const s2 = all.find((x) => x.sessionOf === id)!;
    expect(s2).toMatchObject({ durationMin: 30, date: addDays(day, 1), start: '19:00', goalId: 7 });
    d.close();
  });

  it('horas livres e sugestão de horário pelo costume da área', () => {
    const ws = '2026-10-12';
    const d = emptyData({
      settings: { ...emptyData().settings, weekCapacityH: 70 },
      tasks: [
        { ...base, date: '2026-10-13', start: '07:00', durationMin: 120, status: 'afazer' },
        { ...base, title: 'feita', date: '2026-10-01', start: '07:30', status: 'concluido' },
        { ...base, title: 'feita 2', date: '2026-10-02', start: '07:00', status: 'concluido' },
      ],
    });
    const free = freeByDay(d, ws);
    expect(free).toHaveLength(7);
    // a base é o dia real de 24h (a semana de 168h), não mais a capacidade configurada
    expect(free.find((x) => x.date === '2026-10-13')!.freeMin).toBe(24 * 60 - 120);
    const s = suggestSlot(d, { ...base, postponedCount: 3 }, '2026-10-14');
    expect(s.start).toBe('07:00');
    expect(s.why).toMatch(/de manhã/);
  });

  it('Histórico conta os adiamentos pelo histórico (cada vez que adiou)', () => {
    const d = emptyData({
      tasks: [{
        ...base, status: 'afazer', postponedCount: 2,
        postponeLog: [
          { kind: 'adiada', from: '2025-09-02', at: '2025-09-02T10:00:00.000Z' },
          { kind: 'realocada', to: '2025-09-05', at: '2025-09-03T10:00:00.000Z' },
          { kind: 'adiada', from: '2025-09-05', at: '2025-09-05T10:00:00.000Z' },
          { kind: 'adiada', from: '2025-10-01', at: '2025-10-01T10:00:00.000Z' },
        ],
      }],
    });
    expect(kpis(d, periodRange('mes', '2025-09-01')).postponed).toBe(2);
  });
});
