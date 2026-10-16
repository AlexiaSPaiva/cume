import { useState } from 'react';
import { Card } from './Card';
import { Bar, Empty, Modal } from './ui';
import { useUI } from './Overlays';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { ddmm, today } from '../lib/dates';
import { booksInMonth, pagesOn, readUntil } from '../lib/reading';
import type { Book } from '../lib/types';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Leitura: livro do momento, páginas de hoje × meta diária e livros do mês × meta mensal */
export function ReadingCard() {
  const { books, goals } = useData();
  const ui = useUI();
  const t0 = today();
  const [editing, setEditing] = useState<Partial<Book> | null>(null);
  const current = books.filter((b) => b.status === 'lendo');
  const queue = books.filter((b) => b.status === 'fila');
  const pagesGoal = goals.find((g) => g.auto === 'pagesToday');
  const monthGoal = goals.find((g) => g.auto === 'booksMonth');
  const pages = pagesOn(books, t0);
  const month = booksInMonth(books, t0);
  const perDay = pagesGoal?.target ?? 20;
  const perMonth = monthGoal?.target ?? 4;

  return (
    <Card title="Leitura" wide>
      <div className="reading">
        <div className="reading-col">
          <b className="small muted">LIVRO DO MOMENTO</b>
          {current.length === 0 && <Empty action={{ label: '+ Livro do momento', run: () => setEditing({ status: 'lendo', currentPage: 0 }) }}>Nenhum livro em leitura.</Empty>}
          {current.map((b) => <CurrentBook key={b.id} b={b} onEdit={() => setEditing(b)} toast={ui.toast} />)}
          {current.length > 0 && <button className="add-link" onClick={() => setEditing({ status: 'lendo', currentPage: 0 })}>+ outro livro do momento</button>}
        </div>

        <div className="reading-col">
          <b className="small muted">HOJE</b>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontSize: '1.875rem' }}>{pages}</b><span className="muted small">de {perDay} páginas</span>
            {pages >= perDay && <span className="tag ok">meta do dia ✓</span>}
          </div>
          <Bar pct={Math.min(100, (pages / perDay) * 100)} color="#d29d72" />
          <span className="faint small">O dia recomeça do zero à meia-noite.</span>

          <b className="small muted" style={{ marginTop: 14 }}>LIVROS EM {MONTHS[Number(t0.slice(5, 7)) - 1].toUpperCase()}</b>
          <div className="row" style={{ gap: 6 }} aria-label={`${month.length} de ${perMonth} livros no mês`}>
            {Array.from({ length: Math.max(perMonth, month.length) }, (_, i) => (
              <span key={i} className={`book-slot ${i < month.length ? 'on' : ''}`} title={month[i]?.title ?? 'livro ainda não lido'}>{i < month.length ? '✓' : i + 1}</span>
            ))}
            <span className="muted small">{month.length} de {perMonth}</span>
          </div>
          <span className="faint small">Conta só os livros terminados neste mês; no dia 1 recomeça.</span>
        </div>

        <div className="reading-col">
          <b className="small muted">PRÓXIMOS DA FILA</b>
          <div className="list" style={{ gap: 6 }}>
            {queue.map((b) => (
              <div key={b.id} className="noday-row">
                <button className="plain noday-t" onClick={() => setEditing(b)}><span>{b.title}</span></button>
                <button className="btn sm" onClick={() => db.books.update(b.id!, { status: 'lendo', startedAt: t0 })}>começar</button>
              </div>
            ))}
            {queue.length === 0 && <span className="faint small">fila vazia</span>}
            <button className="add-link" onClick={() => setEditing({ status: 'fila', currentPage: 0 })}>+ livro na fila</button>
          </div>
          {month.length > 0 && <span className="faint small" style={{ marginTop: 8 }}>Lidos no mês: {month.map((b) => b.title).join(', ')}</span>}
        </div>
      </div>
      {editing && (
        <Modal title={editing.id ? 'Editar livro' : 'Novo livro'} onClose={() => setEditing(null)}>
          <BookForm book={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </Card>
  );
}

function CurrentBook({ b, onEdit, toast }: { b: Book; onEdit: () => void; toast: (m: string) => void }) {
  const [page, setPage] = useState('');
  const pct = b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
  async function save() {
    const n = Number(page);
    if (!page || Number.isNaN(n)) return;
    const r = await readUntil(b.id!, n);
    setPage('');
    toast(r.finished ? `Terminou "${b.title}"! Conta na meta do mês.` : r.read ? `+${r.read} páginas hoje.` : 'Página atualizada.');
  }
  return (
    <div className="book-now">
      <button className="plain" onClick={onEdit} style={{ textAlign: 'left', cursor: 'pointer' }}>
        <b>{b.title}</b>{b.author && <span className="muted small"> · {b.author}</span>}
      </button>
      <div className="row small"><span className="muted">página {b.currentPage} de {b.totalPages}</span><b className="right">{pct}%</b></div>
      <Bar pct={pct} color="#d29d72" />
      <form className="row" style={{ gap: 6, marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input className="input" type="number" inputMode="numeric" min={0} max={b.totalPages} placeholder="li até a página…" value={page} onChange={(e) => setPage(e.target.value)} aria-label={`Página em que parou em ${b.title}`} />
        <button className="btn gold" type="submit">Salvar</button>
      </form>
      {b.startedAt && <span className="faint small">começou em {ddmm(b.startedAt)}</span>}
    </div>
  );
}

function BookForm({ book, onDone }: { book: Partial<Book>; onDone: () => void }) {
  const [b, setB] = useState<Partial<Book>>(book);
  const set = (p: Partial<Book>) => setB({ ...b, ...p });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!b.title?.trim() || !b.totalPages) return;
    const row = { ...b, title: b.title.trim(), totalPages: Number(b.totalPages), currentPage: Number(b.currentPage ?? 0), status: b.status ?? 'lendo' } as Book;
    if (row.status === 'lendo' && !row.startedAt) row.startedAt = today();
    await db.books.put(row);
    onDone();
  }
  return (
    <form className="list" style={{ gap: 12 }} onSubmit={submit}>
      <label className="field"><span>Título</span><input className="input" value={b.title ?? ''} onChange={(e) => set({ title: e.target.value })} autoFocus /></label>
      <label className="field"><span>Autor (opcional)</span><input className="input" value={b.author ?? ''} onChange={(e) => set({ author: e.target.value })} /></label>
      <div className="row" style={{ gap: 10 }}>
        <label className="field grow"><span>Total de páginas</span><input className="input" type="number" min={1} value={b.totalPages ?? ''} onChange={(e) => set({ totalPages: Number(e.target.value) })} /></label>
        <label className="field grow"><span>Página atual</span><input className="input" type="number" min={0} value={b.currentPage ?? 0} onChange={(e) => set({ currentPage: Number(e.target.value) })} /></label>
      </div>
      <label className="field"><span>Tema (ex.: finanças, emocional)</span><input className="input" value={b.theme ?? ''} onChange={(e) => set({ theme: e.target.value })} /></label>
      <label className="field"><span>Situação</span>
        <select className="input" value={b.status ?? 'lendo'} onChange={(e) => set({ status: e.target.value as Book['status'], ...(e.target.value === 'lido' && !b.finishedAt ? { finishedAt: today() } : {}) })}>
          <option value="lendo">Lendo agora (livro do momento)</option><option value="fila">Na fila</option><option value="lido">Lido</option>
        </select>
      </label>
      <div className="row"><button className="btn gold" type="submit">{book.id ? 'Salvar' : 'Adicionar livro'}</button>
        {book.id && <button className="btn danger" type="button" style={{ marginLeft: 'auto' }} onClick={async () => { await db.books.update(book.id!, { deletedAt: new Date().toISOString() }); onDone(); }}>Excluir</button>}</div>
    </form>
  );
}
