import { addDays, dow, today } from './dates';
import { db, type MeuPlanoDB } from './db';
import type { Goal, Task } from './types';

/**
 * Tarefas que se repetem toda semana (ex.: "Estudar Matemática" seg/qua/sex até 31/12).
 * Cada dia marcado é uma vez a cumprir; o que foi feito fica em `doneDates`.
 * Numa meta, o progresso conta esses dias: feitos ÷ todos os dias até o fim da repetição.
 */

export const isWeekly = (t: Pick<Task, 'repeatDays'>) => !!t.repeatDays?.length;

/** repetição que a pessoa planeja e marca dia a dia (ligada a meta ou com data final); as outras são blocos fixos (trabalho…) */
export const isPlannedWeekly = (t: Task) => isWeekly(t) && (t.goalId != null || !!t.repeatUntil);

/** primeiro dia da repetição */
export const repeatStart = (t: Task) => t.date ?? t.createdAt?.slice(0, 10) ?? today();

/** a tarefa acontece neste dia? */
export function occursOn(t: Task, day: string): boolean {
  if (!t.repeatDays?.includes(dow(day))) return false;
  if (t.date && day < t.date) return false;
  return !t.repeatUntil || day <= t.repeatUntil;
}

/** todos os dias da repetição, do início até `end` (no máximo ~5 anos) */
export function scheduledDates(t: Task, end: string): string[] {
  const out: string[] = [];
  let d = repeatStart(t);
  for (let i = 0; d <= end && i < 1900; i++, d = addDays(d, 1)) if (occursOn(t, d)) out.push(d);
  return out;
}

export interface WeeklyProgress {
  /** dias já cumpridos */
  done: number;
  /** todos os dias até o fim da repetição (sem fim: até hoje) */
  total: number;
  /** dias que já passaram (até hoje) */
  dueSoFar: number;
  end?: string;
}

/** fim: a data final da repetição; sem ela, o prazo da meta; sem nenhum, conta até hoje */
export function weeklyProgress(t: Task, g?: Pick<Goal, 'deadline'>, ref = today()): WeeklyProgress {
  const end = t.repeatUntil ?? g?.deadline;
  const dates = scheduledDates(t, end ?? ref);
  const set = new Set(dates);
  const done = (t.doneDates ?? []).filter((d) => set.has(d)).length;
  return { done, total: dates.length, dueSoFar: dates.filter((d) => d <= ref).length, end };
}

export const isDoneOn = (t: Task, day: string) => !!t.doneDates?.includes(day);

/** marca ou desmarca o dia como feito */
export async function toggleOccurrence(id: number, day: string, d: MeuPlanoDB = db): Promise<boolean> {
  const t = await d.tasks.get(id);
  if (!t) return false;
  const on = !t.doneDates?.includes(day);
  const doneDates = on ? [...(t.doneDates ?? []), day].sort() : (t.doneDates ?? []).filter((x) => x !== day);
  await d.tasks.update(id, { doneDates });
  return on;
}
