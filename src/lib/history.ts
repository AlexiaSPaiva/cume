import { AREAS, zeroByArea } from './areas';
import type { Data } from './data';
import { addDays, DOW_LONG, dow, iso, MONTHS, parse, today, weekStart } from './dates';
import type { AreaId, HistPeriod, Metric, MetricEntry, Task } from './types';
import { occursOn } from './recurring';

/**
 * Histórico e desempenho: SÓ LÊ. Agrega Tarefas, Agenda (tarefas com dia/horário e blocos fixos),
 * Imprevistos, Metas (registros) e as métricas próprias. Nada aqui grava dados, exceto o fechamento mensal.
 */

export type Compare = 'anterior' | 'media' | 'meta';
export interface Range { start: string; end: string }

/* ---------- períodos ---------- */

export function periodRange(p: HistPeriod, anchor: string): Range {
  const d = parse(anchor);
  if (p === 'dia') return { start: anchor, end: anchor };
  if (p === 'semana') { const s = weekStart(anchor); return { start: s, end: addDays(s, 6) }; }
  if (p === 'mes') return { start: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  return { start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31` };
}

/** âncora do período n passos antes/depois */
export function shiftAnchor(p: HistPeriod, anchor: string, n: number): string {
  const d = parse(anchor);
  if (p === 'dia') return addDays(anchor, n);
  if (p === 'semana') return addDays(weekStart(anchor), 7 * n);
  if (p === 'mes') return iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
  return `${d.getFullYear() + n}-01-01`;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const ddmm = (s: string) => `${s.slice(8)}/${s.slice(5, 7)}`;

export function periodLabel(p: HistPeriod, anchor: string): string {
  const r = periodRange(p, anchor);
  const d = parse(anchor);
  if (p === 'dia') return `${cap(DOW_LONG[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  if (p === 'semana') return `${ddmm(r.start)} – ${ddmm(r.end)}`;
  if (p === 'mes') return `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
  return String(d.getFullYear());
}

/** nome curto do período anterior (para "agosto: 196h") */
export function prevLabel(p: HistPeriod, anchor: string): string {
  const prev = shiftAnchor(p, anchor, -1);
  if (p === 'mes') return MONTHS[parse(prev).getMonth()];
  if (p === 'ano') return prev.slice(0, 4);
  if (p === 'semana') return `semana ${ddmm(weekStart(prev))}`;
  return ddmm(prev);
}

export const COMPARE_LABEL: Record<HistPeriod, Record<Compare, string>> = {
  dia: { anterior: 'Dia anterior', media: 'Média 3 dias', meta: 'Meta' },
  semana: { anterior: 'Semana anterior', media: 'Média 3 semanas', meta: 'Meta' },
  mes: { anterior: 'Mês anterior', media: 'Média 3 meses', meta: 'Meta' },
  ano: { anterior: 'Ano anterior', media: 'Média 3 anos', meta: 'Meta' },
};

export function daysOf(r: Range): string[] {
  const out: string[] = [];
  for (let x = r.start; x <= r.end; x = addDays(x, 1)) out.push(x);
  return out;
}

/** o que já aconteceu: períodos em andamento contam só até hoje */
export function elapsed(r: Range, ref = today()): Range | null {
  if (r.start > ref) return null;
  return { start: r.start, end: r.end < ref ? r.end : ref };
}

/* ---------- tempo produtivo ---------- */

/** blocos que contam como tempo produtivo: nem adiados, nem descanso, nem reserva para imprevisto */
const productive = (t: Task) => t.status !== 'adiada' && !t.soft && !t.bufferFor;

/** minutos produtivos por dia e por área no intervalo (blocos fixos que se repetem incluídos) */
export function minutesByDay(tasks: Task[], r: Range, area?: AreaId): Map<string, Record<AreaId, number>> {
  const out = new Map<string, Record<AreaId, number>>();
  const days = daysOf(r);
  for (const day of days) out.set(day, zeroByArea());
  for (const t of tasks) {
    if (!productive(t) || (area && t.area !== area)) continue;
    if (t.repeatDays?.length) {
      for (const day of days) {
        if (occursOn(t, day)) out.get(day)![t.area] += t.durationMin ?? 60;
      }
    } else if (t.date && t.date >= r.start && t.date <= r.end) {
      out.get(t.date)![t.area] += t.durationMin ?? 0;
    }
  }
  return out;
}

const total = (x: Record<AreaId, number>) => Object.values(x).reduce((a, b) => a + b, 0);

/* ---------- indicadores ---------- */

export interface Kpis {
  /** minutos produtivos */
  minutes: number;
  byArea: Record<AreaId, number>;
  done: number;
  /** % concluídas no prazo (null se nenhuma tinha prazo) */
  onTime: number | null;
  postponed: number;
  impMin: number;
  impCount: number;
  impTopType?: string;
  goalsAdvanced: number;
  goalsTotal: number;
}

type HistData = Pick<Data, 'tasks' | 'imprevistos' | 'goals' | 'records'>;

export function kpis(d: HistData, range: Range, area?: AreaId): Kpis {
  const r = elapsed(range);
  const empty: Kpis = { minutes: 0, byArea: zeroByArea(), done: 0, onTime: null, postponed: 0, impMin: 0, impCount: 0, goalsAdvanced: 0, goalsTotal: 0 };
  const goals = d.goals.filter((g) => !area || g.area === area);
  if (!r) return { ...empty, goalsTotal: goals.length };
  const inR = (x?: string) => !!x && x >= r.start && x <= r.end;
  const byDay = minutesByDay(d.tasks, r, area);
  const byArea = zeroByArea();
  for (const m of byDay.values()) for (const a of AREAS) byArea[a.id] += m[a.id];

  // blocos de renda extra contam horas, mas não são "tarefas concluídas"
  const done = d.tasks.filter((t) => !t.repeatDays?.length && !t.freelanceEntryId && t.status === 'concluido' && inR(t.doneAt) && (!area || t.area === area));
  const withDue = done.filter((t) => t.deadline || t.date);
  const onTime = withDue.length ? Math.round((withDue.filter((t) => t.doneAt! <= (t.deadline ?? t.date)!).length / withDue.length) * 100) : null;
  // adiamentos: cada registro do histórico de adiamentos no período (tarefas antigas, sem histórico: pela situação)
  const postponed = d.tasks.filter((t) => !area || t.area === area).reduce((n, t) => {
    const log = (t.postponeLog ?? []).filter((e) => e.kind === 'adiada');
    if (log.length) return n + log.filter((e) => inR(e.at.slice(0, 10))).length;
    return n + (t.status === 'adiada' && inR(t.date ?? t.updatedAt?.slice(0, 10)) ? 1 : 0);
  }, 0);
  const imps = d.imprevistos.filter((i) => inR(i.date) && (!area || i.area === area));
  const byType = new Map<string, number>();
  for (const i of imps) byType.set(i.type, (byType.get(i.type) ?? 0) + i.durationMin);
  const impTopType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const goalIds = new Set(goals.map((g) => g.id));
  const advanced = new Set(d.records.filter((x) => inR(x.date) && x.value > 0 && goalIds.has(x.goalId)).map((x) => x.goalId));

  return {
    minutes: total(byArea), byArea, done: done.length, onTime, postponed,
    impMin: imps.reduce((s, i) => s + i.durationMin, 0), impCount: imps.length, impTopType,
    goalsAdvanced: advanced.size, goalsTotal: goals.length,
  };
}

/** a referência da comparação: período anterior, média dos 3 anteriores, ou a meta */
export type KpiRef = { [K in keyof Kpis]?: Kpis[K] | null };

export function compareKpis(d: Data, p: HistPeriod, anchor: string, cmp: Compare, area?: AreaId): KpiRef {
  if (cmp === 'anterior') return kpis(d, periodRange(p, shiftAnchor(p, anchor, -1)), area);
  if (cmp === 'media') {
    const xs = [1, 2, 3].map((n) => kpis(d, periodRange(p, shiftAnchor(p, anchor, -n)), area));
    const avg = (f: (k: Kpis) => number) => Math.round(xs.reduce((s, k) => s + f(k), 0) / xs.length);
    const byArea = zeroByArea();
    for (const a of AREAS) byArea[a.id] = avg((k) => k.byArea[a.id]);
    const ot = xs.filter((k) => k.onTime != null);
    return {
      minutes: avg((k) => k.minutes), byArea, done: avg((k) => k.done), postponed: avg((k) => k.postponed),
      onTime: ot.length ? Math.round(ot.reduce((s, k) => s + k.onTime!, 0) / ot.length) : null,
      impMin: avg((k) => k.impMin), impCount: avg((k) => k.impCount), goalsAdvanced: avg((k) => k.goalsAdvanced), goalsTotal: xs[0].goalsTotal,
    };
  }
  // meta: horas vêm do Planejamento (ou da capacidade semanal) e se dividem pelo foco desejado; metas: todas avançando
  const minutes = targetMinutes(d, periodRange(p, anchor), area);
  const byArea = zeroByArea();
  const all = targetMinutes(d, periodRange(p, anchor));
  for (const a of AREAS) byArea[a.id] = Math.round((all * d.settings.desiredFocus[a.id]) / 100);
  const goalsTotal = d.goals.filter((g) => !area || g.area === area).length;
  return { minutes, byArea, onTime: 100, postponed: 0, goalsAdvanced: goalsTotal, goalsTotal, done: null, impMin: null, impCount: null };
}

/** minutos que se pretendia trabalhar no intervalo: Planejamento da semana, ou a capacidade semanal */
export function targetMinutes(d: Pick<Data, 'plans' | 'settings'>, range: Range, area?: AreaId): number {
  const r = elapsed(range);
  if (!r) return 0;
  let m = 0;
  for (const day of daysOf(r)) {
    const plan = d.plans.find((x) => x.weekStart === weekStart(day));
    const week = plan
      ? (area ? plan.hoursByArea[area] : Object.values(plan.hoursByArea).reduce((a, b) => a + b, 0))
      : ((d.settings.weekCapacityH ?? 80) * (area ? d.settings.desiredFocus[area] / 100 : 1));
    m += (week * 60) / 7;
  }
  return Math.round(m);
}

/* ---------- variação ---------- */

export interface Delta { text: string; good: boolean | null }

/** "▲ 8%", "▼ 3", "▲ 4h"; good = a mudança é boa (respeita "menos é melhor") */
export function delta(cur: number, ref: number | null | undefined, kind: 'pct' | 'n' | 'h' | 'pp', higherIsBetter = true): Delta | null {
  if (ref == null) return null;
  const diff = cur - ref;
  if (Math.abs(diff) < 1e-9) return { text: '= igual', good: null };
  const up = diff > 0;
  const arrow = up ? '▲' : '▼';
  let v: string;
  if (kind === 'pct') v = ref ? `${Math.round(Math.abs(diff / ref) * 100)}%` : `${fmtH(Math.abs(diff))}`;
  else if (kind === 'h') v = fmtH(Math.abs(diff));
  else if (kind === 'pp') v = `${Math.round(Math.abs(diff))} pp`;
  else v = `${Math.round(Math.abs(diff) * 10) / 10}`.replace('.', ',');
  return { text: `${arrow} ${v}`, good: up === higherIsBetter };
}

/** minutos → "212h", "6h30", "40min" */
export function fmtH(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

/* ---------- métricas ---------- */

export interface MetricDef {
  key: string;
  name: string;
  source: 'sistema' | 'você';
  unit: string;
  higherIsBetter: boolean;
  /** valor do período (null = sem dados) */
  value: (r: Range) => number | null;
  target?: (r: Range) => number | null;
  fmt: (v: number) => string;
  kind: 'pct' | 'n' | 'h' | 'pp';
  link?: string;
  metric?: Metric;
}

export function aggregate(m: Metric, entries: MetricEntry[], r: Range): number | null {
  const xs = entries.filter((e) => e.metricId === m.id && e.date >= r.start && e.date <= r.end).sort((a, b) => a.date.localeCompare(b.date));
  if (!xs.length) return null;
  if (m.aggregation === 'sum') return xs.reduce((s, e) => s + e.value, 0);
  if (m.aggregation === 'avg') return Math.round((xs.reduce((s, e) => s + e.value, 0) / xs.length) * 100) / 100;
  return xs[xs.length - 1].value;
}

const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

export function metricDefs(d: Data, area?: AreaId): MetricDef[] {
  const sys: MetricDef[] = [
    {
      key: 'horas', name: 'Horas produtivas', source: 'sistema', unit: 'h', higherIsBetter: true, kind: 'pct', fmt: fmtH,
      value: (r) => kpis(d, r, area).minutes, target: (r) => targetMinutes(d, r, area), link: '/agenda',
    },
    {
      key: 'estudo', name: 'Horas de estudo', source: 'sistema', unit: 'h', higherIsBetter: true, kind: 'pct', fmt: fmtH,
      value: (r) => kpis(d, r, 'academica').byArea.academica, target: (r) => targetMinutes(d, r, 'academica'), link: '/area/academica',
    },
    {
      key: 'prazo', name: 'Tarefas no prazo', source: 'sistema', unit: '%', higherIsBetter: true, kind: 'pp', fmt: (v) => `${Math.round(v)}%`,
      value: (r) => kpis(d, r, area).onTime, target: () => 100, link: '/tarefas',
    },
    {
      key: 'imprevistos', name: 'Imprevistos', source: 'sistema', unit: 'h', higherIsBetter: false, kind: 'h', fmt: fmtH,
      value: (r) => kpis(d, r, area).impMin, link: '/imprevistos',
    },
  ];
  const own: MetricDef[] = d.metrics.filter((m) => !area || !m.area || m.area === area).map((m) => ({
    key: `m${m.id}`, name: m.name, source: 'você', unit: m.unit, higherIsBetter: m.higherIsBetter !== false, kind: 'pct',
    fmt: (v) => `${num(v)}${m.unit ? (m.unit.length <= 3 ? m.unit : ` ${m.unit}`) : ''}`,
    value: (r) => aggregate(m, d.metricEntries, r), target: m.target != null ? () => m.target! : undefined, metric: m,
  }));
  return [...sys, ...own];
}

/** valor de comparação de uma métrica */
export function metricRef(def: MetricDef, p: HistPeriod, anchor: string, cmp: Compare): number | null {
  if (cmp === 'meta') return def.target ? def.target(periodRange(p, anchor)) : null;
  if (cmp === 'anterior') return def.value(periodRange(p, shiftAnchor(p, anchor, -1)));
  const xs = [1, 2, 3].map((n) => def.value(periodRange(p, shiftAnchor(p, anchor, -n)))).filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** os últimos n períodos (do mais antigo ao atual) para a tendência */
export function series(def: MetricDef, p: HistPeriod, anchor: string, n = 6): (number | null)[] {
  return Array.from({ length: n }, (_, i) => def.value(periodRange(p, shiftAnchor(p, anchor, i - (n - 1)))));
}

/* ---------- resumo ---------- */

export interface Summary {
  best?: { label: string; text: string };
  hardest?: { label: string; text: string };
  pattern: string;
  year: { months: string[]; values: number[]; growth: number | null };
}

export function summary(d: Data, p: HistPeriod, anchor: string, area?: AreaId): Summary {
  const r = elapsed(periodRange(p, anchor));
  const out: Summary = { pattern: pattern(d, area), year: yearEvolution(d, anchor, area) };
  if (!r) return out;
  const byDay = minutesByDay(d.tasks, r, area);
  const days = daysOf(r);

  if (p === 'mes' || p === 'ano') {
    const weeks = [...new Set(days.map((x) => weekStart(x)))];
    const best = weeks.map((w) => {
      const wr = { start: w < r.start ? r.start : w, end: addDays(w, 6) > r.end ? r.end : addDays(w, 6) };
      return { w: wr, k: kpis(d, wr, area) };
    }).sort((a, b) => b.k.minutes - a.k.minutes)[0];
    if (best && best.k.minutes > 0) {
      out.best = {
        label: 'Melhor semana',
        text: `${ddmm(best.w.start)}–${ddmm(best.w.end)} · ${fmtH(best.k.minutes)}, ${best.k.done} ${best.k.done === 1 ? 'tarefa' : 'tarefas'}, ${best.k.postponed ? `${best.k.postponed} adiamento${best.k.postponed > 1 ? 's' : ''}` : 'zero adiamentos'}`,
      };
    }
  } else {
    const best = days.map((x) => ({ x, m: total(byDay.get(x)!) })).sort((a, b) => b.m - a.m)[0];
    if (best && best.m > 0) out.best = { label: 'Melhor dia', text: `${ddmm(best.x)} · ${fmtH(best.m)} produtivas` };
  }

  const imps = d.imprevistos.filter((i) => i.date >= r.start && i.date <= r.end && (!area || i.area === area));
  const scored = days.map((x) => {
    const im = imps.filter((i) => i.date === x);
    return { x, m: total(byDay.get(x)!), n: im.length, imMin: im.reduce((s, i) => s + i.durationMin, 0) };
  }).filter((s) => s.n > 0).sort((a, b) => b.imMin - a.imMin || a.m - b.m)[0];
  if (scored) out.hardest = { label: 'Dia mais difícil', text: `${ddmm(scored.x)} · ${fmtH(scored.m)} produtiva${scored.m >= 120 ? 's' : ''}, ${scored.n} imprevisto${scored.n > 1 ? 's' : ''} (${fmtH(scored.imMin)})` };
  return out;
}

const DOW_PLURAL = ['Domingos', 'Segundas', 'Terças', 'Quartas', 'Quintas', 'Sextas', 'Sábados'];
const DOW_AS = ['aos domingos', 'às segundas', 'às terças', 'às quartas', 'às quintas', 'às sextas', 'aos sábados'];

/** padrão das últimas 8 semanas: dia útil que rende menos e quando os imprevistos mais comuns caem */
export function pattern(d: Data, area?: AreaId, ref = today()): string {
  const r = { start: addDays(weekStart(ref), -56), end: addDays(weekStart(ref), -1) };
  const byDay = minutesByDay(d.tasks, r, area);
  const per = [1, 2, 3, 4, 5].map((w) => {
    const xs = [...byDay.entries()].filter(([x]) => dow(x) === w).map(([, v]) => total(v));
    return { w, avg: xs.reduce((a, b) => a + b, 0) / (xs.length || 1) };
  });
  const mean = per.reduce((s, x) => s + x.avg, 0) / per.length;
  const parts: string[] = [];
  const worst = [...per].sort((a, b) => a.avg - b.avg)[0];
  if (mean > 0 && worst.avg < mean * 0.85) parts.push(`${DOW_PLURAL[worst.w]} rendem ${Math.round((1 - worst.avg / mean) * 100)}% menos.`);

  const imps = d.imprevistos.filter((i) => i.date >= r.start && i.date <= r.end && (!area || i.area === area));
  if (imps.length >= 3) {
    const byType = new Map<string, typeof imps>();
    for (const i of imps) byType.set(i.type, [...(byType.get(i.type) ?? []), i]);
    const [type, list] = [...byType.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const byDow = new Map<number, number>();
    for (const i of list) byDow.set(dow(i.date), (byDow.get(dow(i.date)) ?? 0) + 1);
    const top = [...byDow.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2).slice(0, 2).map(([w]) => w).sort();
    if (top.length) parts.push(`Imprevistos de ${type.toLowerCase()} caem ${top.map((w) => DOW_AS[w]).join(' e ').replace(/ e às /, ' e ').replace(/ e aos /, ' e ')}.`);
  }
  return parts.join(' ') || 'Ainda sem padrão claro: com mais algumas semanas registradas ele aparece aqui.';
}

export function yearEvolution(d: Data, anchor: string, area?: AreaId): Summary['year'] {
  const y = parse(anchor).getFullYear();
  const t0 = today();
  const lastMonth = String(y) < t0.slice(0, 4) ? 11 : String(y) > t0.slice(0, 4) ? -1 : parse(t0).getMonth();
  const months: string[] = [], values: number[] = [];
  for (let m = 0; m <= lastMonth; m++) {
    const a = iso(new Date(y, m, 1));
    months.push(MONTHS[m].slice(0, 3));
    values.push(kpis(d, periodRange('mes', a), area).minutes);
  }
  const first = values.findIndex((v) => v > 0);
  // compara o último mês completo com o primeiro mês com dados
  const lastFull = String(y) === t0.slice(0, 4) ? values.length - 2 : values.length - 1;
  const growth = first >= 0 && lastFull > first && values[first] > 0 ? Math.round(((values[lastFull] - values[first]) / values[first]) * 100) : null;
  return { months, values, growth };
}

/* ---------- fechamento mensal ---------- */

/** o mês que deve estar fechado agora: o anterior, a partir do dia 1º às 08:00 */
export function monthToClose(now = new Date()): string | null {
  const firstAt8 = new Date(now.getFullYear(), now.getMonth(), 1, 8, 0, 0);
  const target = now >= firstAt8 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return iso(target);
}

export function closingData(d: Data, monthStart: string): Record<string, unknown> {
  const k = kpis(d, periodRange('mes', monthStart));
  return { minutes: k.minutes, byArea: k.byArea, done: k.done, onTime: k.onTime, postponed: k.postponed, impMin: k.impMin, impCount: k.impCount, goalsAdvanced: k.goalsAdvanced, goalsTotal: k.goalsTotal };
}
