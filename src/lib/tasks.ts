import { addRecord, db } from './db';
import { today } from './dates';
import type { Task, TaskStatus } from './types';

/**
 * Muda a situação de uma tarefa (quadro, menu ⋯). Mantém o mesmo id e os vínculos.
 * Devolve true quando a conclusão também avançou uma meta.
 */
export async function moveTask(id: number, s: TaskStatus): Promise<boolean> {
  const t = await db.tasks.get(id);
  if (!t) return false;
  const patch: Partial<Task> = { status: s };
  if (s === 'hoje') patch.date = today();
  if (s === 'concluido') { patch.doneAt = today(); patch.progress = 100; }
  if (s === 'adiada' && t.status !== 'adiada') patch.postponedCount = (t.postponedCount ?? 0) + 1;
  await db.tasks.update(id, patch);
  if (s === 'concluido' && t.status !== 'concluido' && t.goalId) {
    await addRecord(t.goalId, 1, `Concluiu: ${t.title}`);
    return true;
  }
  return false;
}

/** cópia nova (outro id), sem histórico de adiamento nem conclusão */
export async function duplicateTask(t: Task): Promise<number> {
  const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, doneAt: _done, postponedCount: _p, top3Today: _top, ...rest } = t;
  return db.tasks.add({
    ...rest,
    title: `${t.title} (cópia)`,
    status: t.status === 'concluido' ? 'andamento' : t.status,
    progress: t.status === 'concluido' ? 0 : t.progress,
  } as Task) as Promise<number>;
}
