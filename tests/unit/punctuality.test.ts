import { describe, expect, it } from 'vitest';
import { punctuality } from '../../src/lib/punctuality';
import type { Task } from '../../src/lib/types';

const base: Task = { id: 1, title: 'Antena 1', area: 'profissional', status: 'afazer', priority: 'media', start: '09:00', durationMin: 420, repeatDays: [1, 2, 3, 4, 5], clock: true };

describe('pontualidade', () => {
  it('calcula atraso, % no horário (tolerância 5 min) e saída em relação ao fim', () => {
    const p = punctuality([{ ...base, punches: {
      '2026-10-19': { in: '09:03', out: '16:00' },
      '2026-10-20': { in: '09:20', out: '15:50' },
      '2026-10-21': { in: '08:50' },
      '2026-10-22': { in: '09:30', out: '16:20' },
    } }]);
    expect(p.recorded).toBe(4);
    expect(p.onTimePct).toBe(50);
    expect(p.avgLate).toBe(25);
    expect(p.avgExtra).toBe(Math.round((0 - 10 + 20) / 3));
    expect(p.days.map((d) => d.late)).toEqual([3, 20, -10, 30]);
    expect(p.days[0].end).toBe('16:00');
  });

  it('ignora tarefas sem ponto, dias antes do início e dias vazios', () => {
    const p = punctuality([
      { ...base, clock: false, punches: { '2026-10-19': { in: '10:00' } } },
      { ...base, id: 2, punches: { '2026-10-10': { in: '10:00' }, '2026-10-19': {} } },
    ], '2026-10-16');
    expect(p.days).toEqual([]);
    expect(p.onTimePct).toBe(0);
  });
});
