import { describe, expect, it } from 'vitest';
import type { Data } from '../../src/lib/data';
import { planHours, toPercents } from '../../src/lib/derive';
import { addDays, today, weekStart } from '../../src/lib/dates';
import { emptyData } from './helpers';
import type { Task, WeekPlan } from '../../src/lib/types';

function data(p: { tasks?: Task[]; plans?: WeekPlan[] }): Data {
  return emptyData({ tasks: p.tasks ?? [], plans: p.plans ?? [] });
}

const next = addDays(weekStart(today()), 7);
const hoursByArea = { academica: 18, profissional: 30, saude: 4, pessoal: 6, financeiro: 2, adultices: 3 };

describe('foco por área planejado', () => {
  it('porcentagens inteiras que somam 100', () => {
    const p = toPercents(hoursByArea);
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBe(100);
    expect(p.profissional).toBe(48); // 30 de 63h
  });

  it('responde ao Planejamento: mudar as horas muda a porcentagem', () => {
    const before = toPercents(planHours(data({ plans: [{ weekStart: next, hoursByArea, top3: [] }] }), next).hours);
    const after = toPercents(planHours(data({ plans: [{ weekStart: next, hoursByArea: { ...hoursByArea, saude: 14 }, top3: [] }] }), next).hours);
    expect(after.saude).toBeGreaterThan(before.saude);
    expect(after.profissional).toBeLessThan(before.profissional);
  });

  it('sem Planejamento salvo, usa os blocos agendados na semana', () => {
    const tasks: Task[] = [
      { title: 'Estudo', area: 'academica', status: 'afazer', priority: 'media', date: next, start: '19:00', durationMin: 180 },
      { title: 'Corrida', area: 'saude', status: 'afazer', priority: 'media', date: addDays(next, 1), start: '07:00', durationMin: 60 },
    ];
    const r = planHours(data({ tasks }), next);
    expect(r.source).toBe('agenda');
    expect(toPercents(r.hours)).toMatchObject({ academica: 75, saude: 25, profissional: 0 });
  });

  it('semana vazia não divide por zero', () => {
    expect(Object.values(toPercents(planHours(data({}), next).hours)).every((v) => v === 0)).toBe(true);
  });
});
