import type { AreaId, Imprevisto, SuggestionState, Task } from './types';
import { addDays, dow, fromMin, toMin, today } from './dates';

/**
 * Detecção de imprevistos recorrentes.
 *
 * Imprevistos parecidos (mesma área e títulos com palavras em comum) são agrupados.
 * Quando um grupo aparece `threshold` vezes ou mais na janela de dias, o app sugere
 * reservar um bloco fixo no planejamento para ele: no dia da semana em que mais
 * acontece, no horário típico e com a duração média.
 */

export const WINDOW_DAYS = 30;

const STOP = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos', 'em', 'e', 'com', 'para', 'pra', 'p', 'por', 'um', 'uma', 'ao', 'que']);

export function tokens(title: string): string[] {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** coeficiente de sobreposição: "Reunião extra" ~ "Reunião extra no trabalho" = 1 */
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const inter = new Set(a.filter((w) => sb.has(w))).size;
  return inter / Math.min(new Set(a).size, sb.size);
}

export interface RecurringSuggestion {
  key: string;
  label: string;
  area: AreaId;
  count: number;
  totalMin: number;
  avgMin: number;
  /** dia da semana dominante (0=dom) */
  weekday: number;
  /** o dia dominante concentra pelo menos metade das ocorrências */
  weekdayStrong: boolean;
  start: string;
  occurrences: Imprevisto[];
}

interface Cluster { area: AreaId; items: Imprevisto[]; toks: string[][] }

const round15 = (m: number) => Math.max(15, Math.round(m / 15) * 15);
const round30 = (m: number) => Math.round(m / 30) * 30;

export function clusterImprevistos(list: Imprevisto[]): Cluster[] {
  const clusters: Cluster[] = [];
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  for (const imp of sorted) {
    const t = tokens(imp.title);
    const match = clusters.find((c) => c.area === imp.area && c.toks.some((ct) => overlap(ct, t) >= 0.6));
    if (match) {
      match.items.push(imp);
      match.toks.push(t);
    } else {
      clusters.push({ area: imp.area, items: [imp], toks: [t] });
    }
  }
  return clusters;
}

function clusterKey(c: Cluster): string {
  const shortest = [...c.toks].sort((a, b) => a.length - b.length || a.join(' ').localeCompare(b.join(' ')))[0];
  return `${c.area}:${[...shortest].sort().join('-')}`;
}

function clusterLabel(c: Cluster): string {
  const freq = new Map<string, number>();
  for (const i of c.items) {
    const t = i.title.replace(/^!\s*/, '').trim();
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  // título mais frequente; no empate, o mais curto
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
}

export function findRecurring(
  imprevistos: Imprevisto[],
  states: SuggestionState[],
  tasks: Task[],
  threshold: number,
  ref = today(),
): RecurringSuggestion[] {
  const from = addDays(ref, -WINDOW_DAYS);
  const recent = imprevistos.filter((i) => i.date > from && i.date <= ref);
  const stateByKey = new Map(states.map((s) => [s.key, s]));
  const buffers = new Set(tasks.filter((t) => t.bufferFor).map((t) => t.bufferFor));

  const out: RecurringSuggestion[] = [];
  for (const c of clusterImprevistos(recent)) {
    if (c.items.length < threshold) continue;
    const key = clusterKey(c);
    const st = stateByKey.get(key);
    if (buffers.has(key)) continue;
    if (st?.status === 'aceita' && st.taskId && tasks.some((t) => t.id === st.taskId)) continue;
    if (st?.status === 'dispensada' && st.until && st.until > ref) continue;

    const totalMin = c.items.reduce((s, i) => s + i.durationMin, 0);
    const dayCount = new Map<number, number>();
    for (const i of c.items) dayCount.set(dow(i.date), (dayCount.get(dow(i.date)) ?? 0) + 1);
    const [weekday, wdCount] = [...dayCount.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    const starts = c.items.map((i) => toMin(i.start)).sort((a, b) => a - b);
    const median = starts[Math.floor(starts.length / 2)];

    out.push({
      key,
      label: clusterLabel(c),
      area: c.area,
      count: c.items.length,
      totalMin,
      avgMin: round15(totalMin / c.items.length),
      weekday,
      weekdayStrong: wdCount / c.items.length >= 0.5,
      start: fromMin(round30(median)),
      occurrences: c.items,
    });
  }
  return out.sort((a, b) => b.count - a.count || b.totalMin - a.totalMin);
}

/** a quantos imprevistos parecidos este já pertence (para avisar no formulário) */
export function similarCount(title: string, area: AreaId, imprevistos: Imprevisto[], ref = today()): number {
  const t = tokens(title);
  if (!t.length) return 0;
  const from = addDays(ref, -WINDOW_DAYS);
  return imprevistos.filter((i) => i.area === area && i.date > from && overlap(tokens(i.title), t) >= 0.6).length;
}
