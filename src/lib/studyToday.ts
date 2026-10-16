import type { Subject, Task, Topic, Track } from './types';

/** minutos de vídeo escritos no nome do tópico, ex.: "(Duração – 00:14:41)" */
export function topicMinutes(name: string): number {
  const m = /(\d{2}):(\d{2}):(\d{2})/.exec(name);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60 : 0;
}

// estimativa por tipo de item do AVA (o tipo vem no fim do nome: "… · leitura")
const BY_TYPE: Record<string, number> = { leitura: 10, material: 15, 'fórum': 20, quiz: 15, atividade: 40, link: 10 };

/** quanto tempo um item deve levar: vídeo + 5 min de anotação, ou a estimativa do tipo */
export function itemMinutes(name: string): number {
  const v = topicMinutes(name);
  if (v) return Math.ceil(v) + 5;
  return BY_TYPE[name.split(' · ').pop() ?? ''] ?? 15;
}

type D = { tracks: Track[]; subjects: Subject[]; topics: Topic[] };

/** a matéria da vez: a primeira (na ordem) que não está concluída e ainda tem tópico por fazer */
export function currentSubject(d: D, trackId: number): Subject | undefined {
  return d.subjects
    .filter((s) => s.trackId === trackId && !s.done)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .find((s) => d.topics.some((t) => t.subjectId === s.id && t.status === 'todo'));
}

export interface StudyPlan { subject: Subject; items: Topic[]; minutes: number }

/**
 * O que estudar num bloco de uma trilha de graduação: a matéria da vez e os próximos itens,
 * na ordem das aulas, até encher o tempo do bloco (pelo menos um item).
 */
export function studyPlan(d: D, task: Pick<Task, 'trackId' | 'durationMin'>): StudyPlan | null {
  if (task.trackId == null) return null;
  const track = d.tracks.find((t) => t.id === task.trackId);
  if (!track || track.type !== 'degree') return null;
  const subject = currentSubject(d, track.id!);
  if (!subject) return null;
  const todo = d.topics.filter((t) => t.subjectId === subject.id && t.status === 'todo')
    .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true }));
  const budget = task.durationMin ?? 60;
  const items: Topic[] = [];
  let minutes = 0;
  for (const t of todo) {
    const m = itemMinutes(t.name);
    if (items.length && minutes + m > budget) break;
    items.push(t);
    minutes += m;
  }
  return { subject, items, minutes };
}
