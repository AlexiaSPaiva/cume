import { describe, expect, it } from 'vitest';
import { dueIn, expandEvents } from '../../src/lib/bills';
import { withTaskProgress } from '../../src/lib/data';
import { trackIndicators } from '../../src/lib/study';
import type { CalendarEvent, Goal, Task, Track } from '../../src/lib/types';
import { emptyData } from './helpers';

describe('vencimentos das contas', () => {
  const aluguel: CalendarEvent = { id: 1, title: 'Aluguel', date: '2026-10-31', area: 'adultices', kind: 'vencimento', source: 'local', repeat: 'mensal', amount: 1800 };

  it('conta mensal aparece todo mês, e dia 31 vira o último dia dos meses curtos', () => {
    const occ = expandEvents([aluguel], '2026-10-01', '2027-03-31').map((e) => e.date);
    expect(occ).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
    expect(dueIn('2026-10-05', '2027-02')).toBe('2027-02-05');
  });

  it('respeita a data final e não mexe nos eventos comuns', () => {
    const fim = { ...aluguel, repeatUntil: '2026-12-15' };
    const evento: CalendarEvent = { id: 2, title: 'Consulta', date: '2026-11-10', area: 'saude', kind: 'evento', source: 'local' };
    const out = expandEvents([fim, evento], '2026-10-01', '2027-06-30');
    expect(out.filter((e) => e.id === 1).map((e) => e.date)).toEqual(['2026-10-31', '2026-11-30']);
    expect(out.filter((e) => e.id === 2)).toHaveLength(1);
  });
});

describe('metas e objetivos ligados a trilhas de estudo', () => {
  const tr: Track = { id: 7, type: 'exam', title: 'Concurso TRT', status: 'ativa', targetAccuracy: 80, createdAt: '2026-10-01T10:00:00.000Z', hoursPerWeek: 10 };
  const study = (id: number, status: Task['status'], extra: Partial<Task> = {}): Task =>
    ({ id, title: `Sessão ${id}`, area: 'academica', status, priority: 'media', trackId: 7, durationMin: 120, date: '2026-10-05', ...extra });

  it('meta com "todas as tarefas da trilha": conta as sessões da trilha sem ligar uma a uma', () => {
    const g: Goal = { id: 1, title: 'Cumprir o plano', metric: 'tarefas', initial: 0, current: 0, target: 0, area: 'academica', byTasks: true, trackId: 7, trackAll: true };
    const tasks = [study(10, 'concluido'), study(11, 'afazer'), study(12, 'concluido'), { ...study(13, 'afazer'), trackId: 99 }];
    const [p] = withTaskProgress([g], tasks);
    expect([p.current, p.target]).toEqual([2, 3]);
  });

  it('meta com "só as que eu escolher": conta apenas as ligadas', () => {
    const g: Goal = { id: 1, title: 'Revisões', metric: 'tarefas', initial: 0, current: 0, target: 0, area: 'academica', byTasks: true, trackId: 7, trackAll: false };
    const tasks = [study(10, 'concluido', { goalId: 1 }), study(11, 'afazer'), study(12, 'afazer', { goalId: 1 })];
    const [p] = withTaskProgress([g], tasks);
    expect([p.current, p.target]).toEqual([1, 2]);
  });

  it('a trilha mede o objetivo: tempo estudado, edital, acertos (questões + simulados) e último simulado', () => {
    const d = emptyData({
      tracks: [tr],
      tasks: [study(10, 'concluido'), study(11, 'concluido'), study(12, 'afazer')],
      subjects: [{ id: 1, trackId: 7, name: 'Direito do Trabalho', targetAccuracy: 80 }, { id: 2, trackId: 7, name: 'Português' }],
      topics: [{ id: 1, subjectId: 1, name: 'A', status: 'studied' }, { id: 2, subjectId: 1, name: 'B', status: 'todo' }],
      questionLogs: [{ id: 1, subjectId: 1, date: '2026-10-05', total: 20, correct: 12 }, { id: 2, subjectId: 2, date: '2026-10-06', total: 10, correct: 9 }],
      mockExams: [{ id: 1, trackId: 7, title: 'Simulado 1', date: '2026-10-10', total: 50, correct: 35 }],
    } as never);
    const ind = trackIndicators(d, tr, '2026-10-14');
    const by = Object.fromEntries(ind.parts.map((p) => [p.label, p]));
    // 2 semanas × 10h = 20h esperadas; 4h estudadas → 20%
    expect(by.Tempo.pct).toBe(20);
    expect(by.Edital.pct).toBe(50);
    // (12 + 9 + 35) / (20 + 10 + 50) = 70% de acerto; meta 80% → 88%
    expect(by.Acertos.value).toBe('70% · meta 80%');
    expect(by.Acertos.pct).toBe(88);
    // último simulado 70% → 88% da meta
    expect(by.Simulados.pct).toBe(88);
    expect(ind.progress).toBe(Math.round((20 + 50 + 88 + 88) / 4));
    expect(ind.bySubject.map((s) => [s.name, s.acc])).toEqual([['Direito do Trabalho', 60], ['Português', 90]]);
  });
});
