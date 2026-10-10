import type { Data } from './data';
import type { AreaId, Task } from './types';
import { addDays, today, weekStart } from './dates';
import { goalPct, impByArea, impsForWeek, occurrencesForWeek, plannedByArea, sum } from './week';

export interface Deadline { date: string; title: string; area: AreaId; kind: string }

/** prazos e vencimentos (eventos + prazos de tarefas) nos próximos `days` dias */
export function upcomingDeadlines(d: Data, days: number, area?: AreaId): Deadline[] {
  const t = today(), lim = addDays(t, days);
  const fromEvents = d.events
    .filter((e) => e.kind !== 'evento' || e.source === 'local')
    .map((e) => ({ date: e.date, title: e.title, area: e.area, kind: e.kind }));
  const fromTasks = d.tasks
    .filter((x) => x.deadline && x.status !== 'concluido')
    .map((x) => ({ date: x.deadline!, title: x.title, area: x.area, kind: 'prazo' }));
  const seen = new Set<string>();
  return [...fromEvents, ...fromTasks]
    .filter((x) => x.date >= t && x.date <= lim && (!area || x.area === area))
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((x) => {
      const k = `${x.date}|${x.title.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function isTodayTask(t: Task, ref = today()): boolean {
  if (t.repeatDays?.length) return false;
  return t.status === 'hoje' || (t.status === 'afazer' && t.date === ref);
}

export interface WeekNumbers {
  planned: Record<AreaId, number>;
  imp: Record<AreaId, number>;
  total: Record<AreaId, number>;
  totalMin: number;
  impMin: number;
  impCount: number;
}

export function weekNumbers(d: Data, ref = today()): WeekNumbers {
  const ws = weekStart(ref);
  const occ = occurrencesForWeek(d.tasks, ws);
  const imps = impsForWeek(d.imprevistos, ws);
  const planned = plannedByArea(occ);
  const imp = impByArea(imps);
  const total = { ...planned };
  for (const k of Object.keys(total) as AreaId[]) total[k] += imp[k];
  return { planned, imp, total, totalMin: sum(total), impMin: sum(imp), impCount: imps.length };
}

export type AreaHealth = 'atenção' | 'no ritmo' | 'acima';

export interface AreaSummary {
  progress: number;
  realPct: number;
  desiredPct: number;
  health: AreaHealth;
  focusLabel: string;
}

export function areaSummary(d: Data, area: AreaId, wn: WeekNumbers): AreaSummary {
  const goals = d.goals.filter((g) => g.area === area);
  const progress = goals.length ? Math.round(goals.reduce((s, g) => s + goalPct(g), 0) / goals.length) : 0;
  const realPct = wn.totalMin ? Math.round((wn.total[area] / wn.totalMin) * 100) : 0;
  const desiredPct = d.settings.desiredFocus[area];
  const postponed = d.tasks.some((t) => t.area === area && t.status === 'adiada' && (t.postponedCount ?? 0) >= 2);
  let health: AreaHealth = 'no ritmo';
  let focusLabel = 'dentro do foco desejado';
  if (realPct < desiredPct * 0.75) { health = 'atenção'; focusLabel = 'abaixo do foco desejado'; }
  else if (realPct > desiredPct * 1.4) { focusLabel = 'acima do foco desejado'; }
  if (postponed) health = 'atenção';
  return { progress, realPct, desiredPct, health, focusLabel };
}

export type PlanSource = 'planejamento' | 'agenda' | 'vazio';

/**
 * Horas planejadas por área numa semana. É a mesma conta que a tela Planejamento mostra:
 * 1) o que você definiu no Planejamento para a semana (botões − / +);
 * 2) senão, as horas dos blocos já agendados naquela semana;
 * 3) senão, as horas agendadas na semana anterior (ponto de partida).
 */
export function planHours(d: Data, ws: string): { hours: Record<AreaId, number>; source: PlanSource } {
  const stored = d.plans.find((p) => p.weekStart === ws);
  if (stored) return { hours: { ...stored.hoursByArea }, source: 'planejamento' };
  const toHours = (min: Record<AreaId, number>) =>
    Object.fromEntries(Object.entries(min).map(([k, v]) => [k, Math.round(v / 60)])) as Record<AreaId, number>;
  const own = plannedByArea(occurrencesForWeek(d.tasks, ws));
  if (sum(own) > 0) return { hours: toHours(own), source: 'agenda' };
  const prev = plannedByArea(occurrencesForWeek(d.tasks, addDays(ws, -7)));
  return { hours: toHours(prev), source: sum(prev) > 0 ? 'agenda' : 'vazio' };
}

/** porcentagens inteiras que somam exatamente 100 (maior resto) */
export function toPercents(hours: Record<AreaId, number>): Record<AreaId, number> {
  const entries = Object.entries(hours) as [AreaId, number][];
  const total = entries.reduce((s, [, v]) => s + Math.max(0, v), 0);
  const out = Object.fromEntries(entries.map(([k]) => [k, 0])) as Record<AreaId, number>;
  if (!total) return out;
  const raw = entries.map(([k, v]) => ({ k, exact: (Math.max(0, v) / total) * 100 }));
  raw.forEach((r) => (out[r.k] = Math.floor(r.exact)));
  let left = 100 - raw.reduce((s, r) => s + Math.floor(r.exact), 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left <= 0) break;
    out[r.k]++;
    left--;
  }
  return out;
}
