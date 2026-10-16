import { toMin } from './dates';
import type { Task } from './types';

/** até quantos minutos depois do início ainda conta como "no horário" */
export const TOLERANCE_MIN = 5;

export interface PunchDay {
  date: string;
  taskId: number;
  title: string;
  /** horário planejado */
  start: string;
  end: string;
  /** horário real */
  in?: string;
  out?: string;
  /** minutos depois do início (negativo = chegou antes) */
  late?: number;
  /** minutos depois do fim (negativo = saiu antes) */
  extra?: number;
}

export interface Punctuality {
  days: PunchDay[];
  /** dias com chegada registrada */
  recorded: number;
  /** % dos dias com chegada até a tolerância */
  onTimePct: number;
  /** média de atraso só dos dias atrasados (min) */
  avgLate: number;
  /** média de minutos depois do fim (negativo = sai antes, em média) */
  avgExtra: number;
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** pontualidade dos blocos com ponto (do mais antigo ao mais novo), a partir de `from` */
export function punctuality(tasks: Task[], from = ''): Punctuality {
  const days: PunchDay[] = [];
  for (const t of tasks) {
    if (!t.clock || !t.start || t.deletedAt) continue;
    const s = toMin(t.start);
    const e = s + (t.durationMin ?? 60);
    for (const [date, p] of Object.entries(t.punches ?? {})) {
      if (date < from || (!p.in && !p.out)) continue;
      days.push({
        date, taskId: t.id!, title: t.title, start: t.start, end: fmt(e), in: p.in, out: p.out,
        late: p.in ? toMin(p.in) - s : undefined,
        extra: p.out ? toMin(p.out) - e : undefined,
      });
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const arr = days.filter((d) => d.late != null);
  const lates = arr.filter((d) => d.late! > TOLERANCE_MIN).map((d) => d.late!);
  const outs = days.filter((d) => d.extra != null).map((d) => d.extra!);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  return {
    days,
    recorded: arr.length,
    onTimePct: arr.length ? Math.round(((arr.length - lates.length) / arr.length) * 100) : 0,
    avgLate: avg(lates),
    avgExtra: avg(outs),
  };
}
