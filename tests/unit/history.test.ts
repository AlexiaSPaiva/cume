import { describe, expect, it } from 'vitest';
import {
  aggregate, compareKpis, delta, fmtH, kpis, minutesByDay, monthToClose, pattern, periodLabel, periodRange, shiftAnchor,
} from '../../src/lib/history';
import type { GoalRecord, Imprevisto, Metric, MetricEntry, Task } from '../../src/lib/types';
import { emptyData } from './helpers';

const t = (p: Partial<Task> & Pick<Task, 'title' | 'area'>): Task => ({ status: 'afazer', priority: 'media', ...p });
const imp = (date: string, min: number, type: Imprevisto['type'] = 'Trabalho'): Imprevisto => ({
  title: 'x', area: 'profissional', type, date, start: '14:00', end: '15:00', durationMin: min, postponedTasks: false,
});
const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe('histórico: períodos', () => {
  it('semana começa na segunda; mês e ano completos; navegação ‹ ›', () => {
    expect(periodRange('semana', '2025-09-10')).toEqual({ start: '2025-09-08', end: '2025-09-14' });
    expect(periodRange('mes', '2025-09-10')).toEqual({ start: '2025-09-01', end: '2025-09-30' });
    expect(periodRange('ano', '2025-09-10')).toEqual({ start: '2025-01-01', end: '2025-12-31' });
    expect(shiftAnchor('mes', '2025-01-15', -1)).toBe('2024-12-01');
    expect(shiftAnchor('semana', '2025-09-10', 1)).toBe('2025-09-15');
    expect(periodLabel('mes', '2025-09-10')).toBe('Setembro 2025');
  });
});

describe('histórico: tempo produtivo', () => {
  it('conta blocos fixos que se repetem e ignora adiadas, descanso e reservas', () => {
    const tasks = [
      t({ title: 'Trabalho', area: 'profissional', repeatDays: [1, 2, 3, 4, 5], date: '2025-09-01', start: '09:00', durationMin: 180 }),
      t({ title: 'Estudo', area: 'academica', date: '2025-09-10', durationMin: 120 }),
      t({ title: 'Adiada', area: 'saude', status: 'adiada', date: '2025-09-11', durationMin: 60 }),
      t({ title: 'Descanso', area: 'pessoal', soft: true, date: '2025-09-12', durationMin: 60 }),
      t({ title: 'Reserva', area: 'profissional', bufferFor: 'x', repeatDays: [2], durationMin: 120 }),
    ];
    const by = minutesByDay(tasks, periodRange('mes', '2025-09-01'));
    let prof = 0, acad = 0, others = 0;
    for (const v of by.values()) { prof += v.profissional; acad += v.academica; others += v.saude + v.pessoal; }
    expect(prof).toBe(22 * 180); // setembro/2025 tem 22 dias úteis
    expect(acad).toBe(120);
    expect(others).toBe(0);
  });

  it('indicadores: no prazo, renda extra fora de "tarefas", imprevistos e metas que avançaram', () => {
    const d = emptyData({
      tasks: [
        t({ title: 'A', area: 'academica', status: 'concluido', doneAt: '2025-09-05', deadline: '2025-09-06' }),
        t({ title: 'B', area: 'academica', status: 'concluido', doneAt: '2025-09-09', deadline: '2025-09-06' }),
        t({ title: 'Freela', area: 'financeiro', status: 'concluido', doneAt: '2025-09-03', date: '2025-09-03', durationMin: 420, freelanceEntryId: 1 }),
        t({ title: 'C', area: 'saude', status: 'adiada', date: '2025-09-20', postponedCount: 2 }),
      ],
      imprevistos: [imp('2025-09-02', 90), imp('2025-09-16', 60, 'Saúde'), imp('2025-08-30', 300)],
      goals: [
        { id: 1, title: 'g1', metric: 'tarefas', initial: 0, current: 3, target: 10, area: 'academica' },
        { id: 2, title: 'g2', metric: 'tarefas', initial: 0, current: 0, target: 10, area: 'saude' },
      ],
      records: [{ goalId: 1, value: 1, date: '2025-09-05' } as GoalRecord, { goalId: 2, value: 1, date: '2025-08-05' } as GoalRecord],
    });
    const k = kpis(d, periodRange('mes', '2025-09-01'));
    expect(k.done).toBe(2);
    expect(k.onTime).toBe(50);
    expect(k.minutes).toBe(420); // a renda extra conta horas
    expect(k.byArea.financeiro).toBe(420);
    expect(k.postponed).toBe(1);
    expect(k.impMin).toBe(150);
    expect(k.impTopType).toBe('Trabalho');
    expect(k.goalsAdvanced).toBe(1);
    expect(k.goalsTotal).toBe(2);
    // filtro de área
    expect(kpis(d, periodRange('mes', '2025-09-01'), 'saude')).toMatchObject({ done: 0, postponed: 1, impMin: 0, goalsTotal: 1 });
  });

  it('média dos 3 períodos anteriores', () => {
    const d = emptyData({
      tasks: [
        t({ title: 'jun', area: 'pessoal', date: '2025-06-10', durationMin: 60 }),
        t({ title: 'jul', area: 'pessoal', date: '2025-07-10', durationMin: 120 }),
        t({ title: 'ago', area: 'pessoal', date: '2025-08-10', durationMin: 180 }),
      ],
    });
    expect(compareKpis(d, 'mes', '2025-09-01', 'anterior').minutes).toBe(180);
    expect(compareKpis(d, 'mes', '2025-09-01', 'media').minutes).toBe(120);
  });
});

describe('histórico: comparação e métricas', () => {
  it('"menos é melhor" inverte a cor da variação', () => {
    expect(delta(9, 12, 'n', false)).toEqual({ text: '▼ 3', good: true });
    expect(delta(212 * 60, 196 * 60, 'pct')).toEqual({ text: '▲ 8%', good: true });
    expect(delta(21 * 60, 17 * 60, 'h', false)).toEqual({ text: '▲ 4h', good: false });
    expect(delta(5, null, 'n')).toBeNull();
    expect(fmtH(370)).toBe('6h10');
  });

  it('métrica própria: soma, média ou último valor no período', () => {
    const e = (date: string, value: number): MetricEntry => ({ metricId: 1, date, value });
    const entries = [e('2025-09-01', 6), e('2025-09-15', 7), e('2025-09-30', 5), e('2025-10-01', 99)];
    const r = periodRange('mes', '2025-09-01');
    const m = (aggregation: Metric['aggregation']): Metric => ({ id: 1, name: 'x', unit: 'h', aggregation });
    expect(aggregate(m('sum'), entries, r)).toBe(18);
    expect(aggregate(m('avg'), entries, r)).toBe(6);
    expect(aggregate(m('last'), entries, r)).toBe(5);
    expect(aggregate(m('sum'), entries, periodRange('mes', '2025-07-01'))).toBeNull();
  });

  it('padrão: encontra o dia útil que rende menos', () => {
    const ref = '2025-10-13'; // segunda
    const d = emptyData({
      tasks: [
        t({ title: 'manhã', area: 'profissional', repeatDays: [2, 3, 4, 5], date: '2025-01-01', durationMin: 300 }),
        t({ title: 'segunda', area: 'profissional', repeatDays: [1], date: '2025-01-01', durationMin: 120 }),
      ],
    });
    expect(pattern(d, undefined, ref)).toMatch(/^Segundas rendem \d+% menos\./);
  });
});

describe('histórico: fechamento mensal', () => {
  it('fecha o mês anterior a partir do dia 1º às 08:00', () => {
    expect(monthToClose(new Date(2026, 9, 1, 7, 59))).toBe('2026-08-01');
    expect(monthToClose(new Date(2026, 9, 1, 8, 0))).toBe('2026-09-01');
    expect(monthToClose(new Date(2026, 0, 15, 12, 0))).toBe('2025-12-01');
  });

  it('período no futuro não tem dados', () => {
    const d = emptyData({ tasks: [t({ title: 'x', area: 'pessoal', date: '2099-01-02', durationMin: 60 })] });
    expect(total(kpis(d, periodRange('mes', '2099-01-01')).byArea)).toBe(0);
  });
});
