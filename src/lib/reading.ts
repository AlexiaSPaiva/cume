import { db } from './db';
import { today } from './dates';
import type { Book, Goal } from './types';

/** páginas lidas num dia, somando todos os livros */
export function pagesOn(books: Book[], day = today()): number {
  return books.reduce((s, b) => s + (b.log?.[day] ?? 0), 0);
}

/** livros terminados no mês de `day` (o progresso da meta mensal recomeça todo dia 1) */
export function booksInMonth(books: Book[], day = today()): Book[] {
  const m = day.slice(0, 7);
  return books.filter((b) => b.status === 'lido' && b.finishedAt?.startsWith(m));
}

/** metas automáticas: o valor atual vem da estante, não de registros manuais */
export function withReading(goals: Goal[], books: Book[], day = today()): Goal[] {
  return goals.map((g) => {
    if (g.auto === 'pagesToday') return { ...g, byTasks: false, metric: 'páginas', unit: 'pág. hoje', initial: 0, current: pagesOn(books, day) };
    if (g.auto === 'booksMonth') return { ...g, byTasks: false, metric: 'outro', unit: 'livros no mês', initial: 0, current: booksInMonth(books, day).length };
    return g;
  });
}

/**
 * "Li até a página X": guarda a página, soma as páginas novas no dia de hoje e,
 * ao chegar na última, marca o livro como lido (conta na meta do mês).
 */
export async function readUntil(id: number, page: number, day = today()): Promise<{ read: number; finished: boolean }> {
  const b = await db.books.get(id);
  if (!b) return { read: 0, finished: false };
  const p = Math.max(0, Math.min(b.totalPages, Math.round(page)));
  const read = Math.max(0, p - b.currentPage);
  const log = { ...(b.log ?? {}) };
  if (read) log[day] = (log[day] ?? 0) + read;
  const finished = p >= b.totalPages && b.status !== 'lido';
  await db.books.update(id, {
    currentPage: p, log,
    ...(b.status === 'fila' && p > 0 ? { status: 'lendo' as const, startedAt: b.startedAt ?? day } : {}),
    ...(finished ? { status: 'lido' as const, finishedAt: day } : {}),
  });
  return { read, finished };
}
