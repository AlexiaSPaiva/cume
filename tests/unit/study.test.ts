import { describe, expect, it } from 'vitest';
import { addDays, today } from '../../src/lib/dates';
import { dueReminders } from '../../src/lib/reminders';
import { necessity, necessityLevel, planByNecessity, trackEvents, trackSummary } from '../../src/lib/study';
import type { QuestionLog, Subject, Task, Topic, Track } from '../../src/lib/types';
import { emptyData } from './helpers';

const exam: Track = { id: 1, type: 'exam', title: 'Prefeitura', status: 'ativa', targetAccuracy: 75, hoursPerWeek: 7 };
const sub = (id: number, name: string, weight: number): Subject => ({ id, trackId: 1, name, weight, questionsCount: 10 });
const topics = (subjectId: number, done: number, total: number): Topic[] =>
  Array.from({ length: total }, (_, i) => ({ id: subjectId * 100 + i, subjectId, name: `t${i}`, status: i < done ? 'studied' : 'todo' }));
const log = (subjectId: number, correct: number, total = 100): QuestionLog => ({ subjectId, date: '2026-10-01', total, correct });

describe('estudos: necessidade (concurso)', () => {
  it('peso × distância até a meta × parte do edital que falta', () => {
    const d = emptyData({ topics: [...topics(1, 0, 10), ...topics(2, 5, 10)], questionLogs: [log(1, 54), log(2, 80)] });
    // BD: peso 2, acerto 54%, meta 75%, nada estudado → 2 × 0,21 × 1 = 0,42
    expect(necessity(d, sub(1, 'Banco de Dados', 2))).toBeCloseTo(0.42, 3);
    // Português: acima da meta → 0
    expect(necessity(d, sub(2, 'Português', 1))).toBe(0);
    expect(necessityLevel(0.42, 0.42)).toBe('alta');
    expect(necessityLevel(0.1, 0.42)).toBe('baixa');
  });

  it('gerar cronograma: mais blocos para quem mais precisa, sem sobrepor a Agenda', () => {
    const from = addDays(today(), 1);
    const d = emptyData({
      subjects: [sub(1, 'BD', 2), sub(2, 'Português', 1), sub(3, 'Redes', 1)],
      topics: [...topics(1, 0, 10), ...topics(2, 8, 10), ...topics(3, 5, 10)],
      questionLogs: [log(1, 50), log(2, 74), log(3, 60)],
      tasks: [{ title: 'Inglês', area: 'pessoal', status: 'afazer', priority: 'media', date: from, start: '19:00', durationMin: 60 } as Task],
    });
    const blocks = planByNecessity(d, exam, { from });
    expect(blocks).toHaveLength(7);
    const count = (id: number) => blocks.filter((b) => b.subjectId === id).length;
    expect(count(1)).toBeGreaterThan(count(3));
    expect(count(3)).toBeGreaterThanOrEqual(count(2));
    expect(blocks.every((b) => b.trackId === 1 && b.area === 'academica')).toBe(true);
    // 19:00 do 1º dia já estava ocupado
    expect(blocks.some((b) => b.date === from && b.start === '19:00')).toBe(false);
  });
});

describe('estudos: resumo de cada trilha', () => {
  it('concurso, curso, graduação e pesquisa', () => {
    const d = emptyData({
      subjects: [sub(1, 'BD', 2), { id: 5, trackId: 2, name: 'M1', done: true }, { id: 6, trackId: 2, name: 'M2' }, { id: 7, trackId: 3, name: 'Cálculo', grade: 8.5 }, { id: 8, trackId: 3, name: 'Física', grade: 6 }],
      topics: topics(1, 3, 10), questionLogs: [log(1, 68)],
      articleNotes: [{ attachmentId: 1, trackId: 4, status: 'fichado' }, { attachmentId: 2, trackId: 4, status: 'a triar' }],
      journal: [{ trackId: 4, date: addDays(today(), -2), text: 'triagem' }],
    });
    expect(trackSummary(d, exam)).toMatchObject({ metric: 'Edital 30% coberto', detail: 'Acertos 68% · meta 75%', progress: 30 });
    expect(trackSummary(d, { id: 2, type: 'course', title: 'Python', status: 'ativa' })).toMatchObject({ metric: 'Módulo 2 de 2', progress: 50 });
    expect(trackSummary(d, { id: 3, type: 'degree', title: 'Mackenzie', status: 'ativa', targetGrade: 7 })).toMatchObject({ metric: 'Média 7,3 · meta ≥ 7', detail: 'Disciplinas 1/2 em dia' });
    const r = trackSummary(d, { id: 4, type: 'research', title: 'GEUX', status: 'ativa', stage: 2 });
    expect(r.metric).toBe('Etapa: triagem 1/2');
    expect(r.detail).toBe('Último registro há 2 dias');
  });

  it('datas da trilha só vão para o Calendário geral se a trilha pedir', () => {
    const t2: Track = { ...exam, id: 2, showInCalendar: false, examDate: '2026-11-30' };
    const d = emptyData({ tracks: [{ ...exam, examDate: '2026-11-30', examTime: '08:00' }, t2], trackDates: [{ trackId: 1, label: 'Cartão de confirmação', date: '2026-11-20', kind: 'edital' }, { trackId: 2, label: 'Recursos', date: '2026-12-02', kind: 'edital' }] });
    const ev = trackEvents(d);
    expect(ev.map((e) => e.title).sort()).toEqual(['Prefeitura · Cartão de confirmação', 'Prefeitura · prova']);
    expect(ev.find((e) => e.title.endsWith('prova'))).toMatchObject({ kind: 'prazo', start: '08:00' });
  });
});

describe('estudos: alarmes', () => {
  const at = (h: number, m = 0) => { const x = new Date(); x.setHours(h, m, 0, 0); return x; };
  it('avisa antes do bloco; no "silenciar no trabalho" só passa o urgente', () => {
    const t0 = today();
    const d = emptyData({
      tasks: [{ id: 9, title: 'BD', area: 'academica', status: 'afazer', priority: 'media', date: t0, start: '10:00', durationMin: 60, trackId: 1 }],
      tracks: [exam], trackDates: [{ id: 3, trackId: 1, label: 'Prova', date: t0, time: '12:00', kind: 'prova', alert: true }],
    });
    d.settings.study = { quiet: false, remindMin: 10 };
    expect(dueReminders(d, at(9, 52), []).map((r) => r.msg)).toContain('Em 8 min: BD (10:00)');
    const dow = new Date().getDay();
    d.settings.study = { quiet: true, remindMin: 10 };
    const quiet = dueReminders(d, at(9, 52), []);
    if (dow >= 1 && dow <= 5) expect(quiet.map((r) => r.msg)).not.toContain('Em 8 min: BD (10:00)');
    expect(quiet.some((r) => r.urgent && r.msg.includes('Prova hoje às 12:00'))).toBe(true);
    // não repete o que já foi avisado
    expect(dueReminders(d, at(9, 52), quiet.map((r) => r.key))).toHaveLength(0);
  });
});
