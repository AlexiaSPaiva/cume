import { describe, expect, it } from 'vitest';
import { currentSubject, itemMinutes, studyPlan } from '../../src/lib/studyToday';
import type { Subject, Topic, Track } from '../../src/lib/types';

const tracks: Track[] = [{ id: 1, title: 'Mackenzie', type: 'degree', status: 'ativa' } as Track];
const subjects: Subject[] = [
  { id: 10, trackId: 1, name: 'CTS', order: 1 },
  { id: 11, trackId: 1, name: 'Ética', order: 2 },
];
const top = (id: number, subjectId: number, code: string, name: string, status: Topic['status'] = 'todo'): Topic => ({ id, subjectId, code, name, status });

describe('estudo do dia', () => {
  it('tempo do item: vídeo + 5 min, ou estimativa pelo tipo', () => {
    expect(itemMinutes('A1 – Professor Explica (Duração – 00:14:41) · leitura')).toBe(20);
    expect(itemMinutes('A1 – Aplicando Conhecimento · atividade')).toBe(40);
    expect(itemMinutes('qualquer coisa')).toBe(15);
  });

  it('matéria da vez pula a concluída e a que não tem nada por fazer', () => {
    const topics = [top(1, 10, '1.1', 'x', 'studied'), top(2, 11, '1.1', 'y')];
    expect(currentSubject({ tracks, subjects, topics }, 1)?.name).toBe('Ética');
  });

  it('enche o bloco com os próximos itens, na ordem das aulas (2.10 depois de 2.9)', () => {
    const topics = [
      top(1, 10, '2.10', 'C · atividade'), top(2, 10, '2.9', 'B · leitura'), top(3, 10, '1.1', 'A · leitura', 'studied'),
      top(4, 10, '3.1', 'D · leitura'),
    ];
    const p = studyPlan({ tracks, subjects, topics }, { trackId: 1, durationMin: 60 })!;
    expect(p.subject.name).toBe('CTS');
    expect(p.items.map((t) => t.name)).toEqual(['B · leitura', 'C · atividade', 'D · leitura']);
    expect(p.minutes).toBe(60);
  });

  it('bloco curto ainda leva um item; trilha que não é graduação não tem plano', () => {
    const topics = [top(1, 10, '1.1', 'Grande · atividade')];
    expect(studyPlan({ tracks, subjects, topics }, { trackId: 1, durationMin: 10 })!.items).toHaveLength(1);
    expect(studyPlan({ tracks: [{ ...tracks[0], type: 'course' }], subjects, topics }, { trackId: 1, durationMin: 60 })).toBeNull();
  });
});
