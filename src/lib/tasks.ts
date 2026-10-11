import { addRecord, db, type MeuPlanoDB } from './db';
import { addDays, dow, fromMin, toMin, today, weekDays, weekStart } from './dates';
import type { Data } from './data';
import type { PostponeEntry, Task, TaskStatus } from './types';
import { capacityMin, occurrencesForWeek } from './week';

/**
 * Tarefas: mover, adiar e realocar SEMPRE mantêm o mesmo id, os vínculos (meta, trilha) e o histórico.
 * Cada adiamento/realocação entra em `postponeLog`; `postponedCount` conta os adiamentos.
 */

const now = () => new Date().toISOString();

/** Muda a situação (quadro, menu ⋯). Devolve true quando a conclusão também avançou uma meta. */
export async function moveTask(id: number, s: TaskStatus, reason = 'arrastou para Adiada'): Promise<boolean> {
  const t = await db.tasks.get(id);
  if (!t) return false;
  if (s === 'adiada' && t.status !== 'adiada') { await postponeTask(id, { text: reason }); return false; }
  const patch: Partial<Task> = { status: s };
  if (s === 'hoje') patch.date = today();
  if (s === 'concluido') { patch.doneAt = today(); patch.progress = 100; }
  await db.tasks.update(id, patch);
  if (s === 'concluido' && t.status !== 'concluido' && t.goalId) {
    await addRecord(t.goalId, 1, `Concluiu: ${t.title}`);
    return true;
  }
  return false;
}

/** adia: a tarefa fica em "Adiadas" com o motivo, até ser realocada */
export async function postponeTask(id: number, reason: { text?: string; imprevistoId?: number }, d: MeuPlanoDB = db) {
  const t = await d.tasks.get(id);
  if (!t || t.status === 'adiada') return;
  const entry: PostponeEntry = { kind: 'adiada', from: t.date ?? '', reasonText: reason.text?.trim() || undefined, reasonId: reason.imprevistoId, at: now() };
  await d.tasks.update(id, { status: 'adiada', postponedCount: (t.postponedCount ?? 0) + 1, postponeLog: [...(t.postponeLog ?? []), entry] });
}

export type RescheduleTo =
  | { kind: 'dia'; date: string; start?: string }
  | { kind: 'planejamento' }
  | { kind: 'backlog' };

/**
 * Realoca a MESMA tarefa: para um dia/horário, para o Planejamento da semana que vem ou para o backlog.
 * Com `split`, a duração se divide e a 2ª sessão vira um bloco ligado (sessionOf) no dia seguinte livre.
 */
export async function rescheduleTask(id: number, to: RescheduleTo, opts: { remindMin?: number; split?: number } = {}, d: MeuPlanoDB = db) {
  const t = await d.tasks.get(id);
  if (!t) return;
  const t0 = today();
  let patch: Partial<Task>;
  let dest: string;
  if (to.kind === 'dia') {
    patch = { date: to.date, start: to.start ?? t.start, status: to.date === t0 ? 'hoje' : 'afazer' };
    dest = to.start ? `${to.date} ${to.start}` : to.date;
  } else if (to.kind === 'planejamento') {
    // semana que vem, sem dia: entra no backlog do Planejamento daquela semana
    patch = { date: undefined, start: undefined, status: 'afazer' };
    dest = 'planejamento';
  } else {
    patch = { date: undefined, start: undefined, status: 'afazer' };
    dest = 'backlog';
  }
  if (opts.remindMin != null) patch.remindMin = opts.remindMin || undefined;
  const entry: PostponeEntry = { kind: 'realocada', from: t.date ?? '', to: dest, at: now() };
  const parts = opts.split && opts.split > 1 && t.durationMin ? opts.split : 1;
  if (parts > 1) patch.durationMin = Math.max(15, Math.round(t.durationMin! / parts / 5) * 5);
  await d.transaction('rw', d.tasks, async () => {
    await d.tasks.update(id, { ...patch, postponeLog: [...(t.postponeLog ?? []), entry] });
    for (let i = 1; i < parts; i++) {
      await d.tasks.add({
        title: `${t.title} · sessão ${i + 1}`, area: t.area, priority: t.priority, status: 'afazer',
        date: to.kind === 'dia' ? addDays(to.date, i) : undefined, start: patch.start, durationMin: patch.durationMin,
        goalId: t.goalId, trackId: t.trackId, sessionOf: id, remindMin: patch.remindMin,
      });
    }
  });
}

/** cópia nova (outro id), sem histórico de adiamento nem conclusão */
export async function duplicateTask(t: Task): Promise<number> {
  const {
    id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, doneAt: _done, postponedCount: _p, top3Today: _top, postponeLog: _log, ...rest
  } = t;
  return db.tasks.add({
    ...rest,
    title: `${t.title} (cópia)`,
    status: t.status === 'concluido' || t.status === 'adiada' ? 'afazer' : t.status,
    progress: t.status === 'concluido' ? 0 : t.progress,
  } as Task) as Promise<number>;
}

/* ---------- ajuda para realocar ---------- */

/** horas livres por dia na semana (capacidade semanal / 7 menos o que já está agendado) */
export function freeByDay(d: Pick<Data, 'tasks' | 'settings'>, ws: string): { date: string; freeMin: number }[] {
  const perDay = capacityMin(d.settings) / 7;
  const occ = occurrencesForWeek(d.tasks, ws).filter((o) => o.task.status !== 'adiada');
  return weekDays(ws).map((date) => ({
    date, freeMin: Math.max(0, Math.round(perDay - occ.filter((o) => o.date === date).reduce((s, o) => s + o.durationMin, 0))),
  }));
}

/**
 * Sugestão de horário: o horário em que a pessoa costuma concluir tarefas daquela área
 * (início das tarefas concluídas), no primeiro dia a partir de amanhã com tempo livre suficiente.
 */
export function suggestSlot(d: Pick<Data, 'tasks' | 'settings'>, t: Task, from = addDays(today(), 1)): { date: string; start: string; why: string } {
  const done = d.tasks.filter((x) => x.area === t.area && x.status === 'concluido' && x.start && !x.repeatDays?.length);
  const byHour = new Map<number, number>();
  for (const x of done) { const h = Math.floor(toMin(x.start!) / 60); byHour.set(h, (byHour.get(h) ?? 0) + 1); }
  const best = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
  const hour = best?.[0] ?? (t.start ? Math.floor(toMin(t.start) / 60) : 9);
  const need = t.durationMin ?? 60;
  let date = from;
  for (let i = 0; i < 14; i++) {
    const day = addDays(from, i);
    const free = freeByDay(d, weekStart(day)).find((x) => x.date === day)!;
    if (free.freeMin >= need && dow(day) !== 0) { date = day; break; }
  }
  const part = hour < 12 ? 'de manhã' : hour < 18 ? 'à tarde' : 'à noite';
  const why = best
    ? `Você conclui mais tarefas dessa área ${part}${(t.postponedCount ?? 0) >= 2 ? `, e ela já foi adiada ${t.postponedCount}x` : ''}.`
    : 'Primeiro dia com tempo livre suficiente.';
  return { date, start: fromMin(hour * 60), why };
}

/** motivo do último adiamento (texto ou o imprevisto) */
export function lastReason(t: Task, imprevistos: { id?: number; title: string }[] = []): string {
  const e = [...(t.postponeLog ?? [])].reverse().find((x) => x.kind === 'adiada');
  if (!e) return t.status === 'adiada' ? 'sem motivo registrado' : '';
  if (e.reasonId) return imprevistos.find((i) => i.id === e.reasonId)?.title ?? e.reasonText ?? 'imprevisto';
  return e.reasonText ?? 'sem motivo registrado';
}

/** data em que estava quando foi adiada pela última vez */
export function wasFor(t: Task): string | undefined {
  const e = [...(t.postponeLog ?? [])].reverse().find((x) => x.kind === 'adiada');
  return e?.from || t.date;
}
