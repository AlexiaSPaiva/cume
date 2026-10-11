import type { AreaId, Goal, Imprevisto, Task } from './types';
import { dow, toMin, weekDays } from './dates';
import { zeroByArea } from './areas';

export interface Occurrence {
  task: Task;
  date: string;
  start?: string;
  durationMin: number;
  /** instância de um bloco que se repete toda semana */
  repeating: boolean;
}

/** expande tarefas (incluindo blocos fixos que se repetem) para os dias da semana */
export function occurrencesForWeek(tasks: Task[], start: string): Occurrence[] {
  const days = weekDays(start);
  const out: Occurrence[] = [];
  for (const t of tasks) {
    if (t.repeatDays?.length) {
      for (const d of days) {
        if (t.repeatDays.includes(dow(d)) && (!t.date || t.date <= d)) {
          out.push({ task: t, date: d, start: t.start, durationMin: t.durationMin ?? 60, repeating: true });
        }
      }
    } else if (t.date && days.includes(t.date)) {
      out.push({ task: t, date: t.date, start: t.start, durationMin: t.durationMin ?? 0, repeating: false });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '99').localeCompare(b.start ?? '99'));
}

export function impsForWeek(imps: Imprevisto[], start: string): Imprevisto[] {
  const days = new Set(weekDays(start));
  return imps.filter((i) => days.has(i.date));
}

/** minutos planejados por área (tarefas não adiadas) */
export function plannedByArea(occ: Occurrence[]): Record<AreaId, number> {
  const r = zeroByArea();
  for (const o of occ) if (o.task.status !== 'adiada') r[o.task.area] += o.durationMin;
  return r;
}

export function impByArea(imps: Imprevisto[]): Record<AreaId, number> {
  const r = zeroByArea();
  for (const i of imps) r[i.area] += i.durationMin;
  return r;
}

export function sum(r: Record<string, number>): number {
  return Object.values(r).reduce((a, b) => a + b, 0);
}

/** minutos por semana que a pessoa considera disponíveis para planejar (configurável em Personalizar) */
export function capacityMin(s: { weekCapacityH?: number }): number {
  return (s.weekCapacityH ?? 80) * 60;
}

export function goalPct(g: Goal): number {
  // meta pelas tarefas sem nenhuma tarefa ligada ainda: 0%, não 100%
  if (g.byTasks && !g.target) return 0;
  const span = g.target - g.initial;
  if (span === 0) return g.current >= g.target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((g.current - g.initial) / span) * 100)));
}

export function overlaps(aStart: string, aDur: number, bStart: string, bDur: number): boolean {
  const a = toMin(aStart), b = toMin(bStart);
  return a < b + bDur && b < a + aDur;
}
