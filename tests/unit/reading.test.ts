import { describe, expect, it } from 'vitest';
import { booksInMonth, pagesOn, withReading } from '../../src/lib/reading';
import type { Book, Goal } from '../../src/lib/types';

const b = (x: Partial<Book>): Book => ({ title: 'L', totalPages: 100, currentPage: 0, status: 'lendo', ...x });

describe('leitura', () => {
  const books = [
    b({ id: 1, log: { '2026-10-16': 12, '2026-10-15': 30 } }),
    b({ id: 2, log: { '2026-10-16': 5 }, status: 'lido', finishedAt: '2026-10-16' }),
    b({ id: 3, status: 'lido', finishedAt: '2026-09-30' }),
  ];
  it('páginas do dia somam todos os livros', () => {
    expect(pagesOn(books, '2026-10-16')).toBe(17);
    expect(pagesOn(books, '2026-10-17')).toBe(0);
  });
  it('livros do mês recomeçam a cada mês', () => {
    expect(booksInMonth(books, '2026-10-20').length).toBe(1);
    expect(booksInMonth(books, '2026-11-01').length).toBe(0);
  });
  it('metas automáticas pegam o valor da estante', () => {
    const goals: Goal[] = [
      { id: 1, title: 'Páginas por dia', area: 'pessoal', metric: 'páginas', initial: 0, current: 999, target: 20, auto: 'pagesToday' },
      { id: 2, title: 'Livros por mês', area: 'pessoal', metric: 'outro', initial: 0, current: 0, target: 4, auto: 'booksMonth' },
    ];
    const [p, l] = withReading(goals, books, '2026-10-16');
    expect(p.current).toBe(17);
    expect(l.current).toBe(1);
    expect(p.byTasks).toBe(false);
  });
});
