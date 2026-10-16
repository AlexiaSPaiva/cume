import { Link } from 'react-router-dom';
import { Card } from './Card';
import { useUI } from './Overlays';
import { Bar, Empty } from './ui';
import { AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { today, weekStart } from '../lib/dates';
import { punctuality } from '../lib/punctuality';
import { booksInMonth, pagesOn } from '../lib/reading';
import { toggleOccurrence } from '../lib/recurring';
import { moveTask } from '../lib/tasks';
import { occurrencesForWeek, type Occurrence } from '../lib/week';
import type { AreaId, Task } from '../lib/types';

/** abas do painel de área: Visão geral, as próprias da área, Metas e Ritmo */
export function AreaTabs({ area, tab, extra, attention }: { area: AreaId; tab: string; extra: [string, string][]; attention: number }) {
  const all: [string, string][] = [['geral', 'Visão geral'], ...extra, ['metas', 'Metas'], ['ritmo', 'Ritmo e alertas']];
  return (
    <nav className="fin-tabs" aria-label={`Abas de ${AREA[area].name}`}>
      {all.map(([k, label]) => (
        <Link key={k} to={k === 'geral' ? `/area/${area}` : `/area/${area}?aba=${k}`} className={k === tab ? 'on' : ''} aria-current={k === tab ? 'page' : undefined}>
          {label}{k === 'ritmo' && attention > 0 && <span className="novo">{attention}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** o que fazer HOJE nesta área: um toque no círculo conclui (hábito), tocar no nome abre as ações */
export function TodayCard({ area, color }: { area: AreaId; color: string }) {
  const { tasks } = useData();
  const ui = useUI();
  const t0 = today();
  const occ: Occurrence[] = occurrencesForWeek(tasks, weekStart(t0)).filter((o) => o.date === t0 && o.task.area === area && !o.task.soft);
  const done = occ.filter((o) => o.done).length;
  const toggle = (o: Occurrence) => (o.repeating ? toggleOccurrence(o.task.id!, t0) : moveTask(o.task.id!, o.done ? 'afazer' : 'concluido'));
  return (
    <Card title={<>Hoje · <span className="muted" style={{ fontSize: '1.0625rem' }}>{done} de {occ.length} feitos</span></>}>
      {occ.length > 0 && <Bar pct={(done / occ.length) * 100} color={color} />}
      <div className="list" style={{ gap: 4, marginTop: 10 }}>
        {occ.map((o) => (
          <div key={`${o.task.id}`} className={`today-row ${o.done ? 'done' : ''}`}>
            <button className="today-check" style={{ borderColor: color, background: o.done ? color : undefined }} onClick={() => void toggle(o)}
              aria-label={o.done ? `Desmarcar ${o.task.title}` : `Concluir ${o.task.title}`}>{o.done ? '✓' : ''}</button>
            <button className="plain today-t" onClick={() => ui.openActions(o.task as Task, t0)}>
              <span>{o.task.title}</span>{o.start && <small className="muted">{o.start}</small>}
            </button>
          </div>
        ))}
        {occ.length === 0 && <Empty action={{ label: '+ tarefa para hoje', run: () => ui.openTask({ area, date: t0 }) }}>Nada marcado para hoje nesta área.</Empty>}
      </div>
    </Card>
  );
}

export function PunctualityMini({ tasks }: { tasks: Task[] }) {
  if (!tasks.some((t) => t.clock && !t.deletedAt)) return null;
  const p = punctuality(tasks);
  return (
    <Card title="Pontualidade">
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <b style={{ fontSize: '1.875rem' }}>{p.recorded ? `${p.onTimePct}%` : '—'}</b>
        <span className="muted small">{p.recorded ? `no horário em ${p.recorded} dias` : 'registre o ponto clicando no bloco do trabalho'}</span>
      </div>
      {p.recorded > 0 && <span className="small muted">atraso médio {p.avgLate} min</span>}
      <Link className="add-link" to="/area/profissional?aba=pontualidade">ver o gráfico →</Link>
    </Card>
  );
}

export function ReadingMini() {
  const { books, goals } = useData();
  const t0 = today();
  const now = books.find((b) => b.status === 'lendo');
  const perDay = goals.find((g) => g.auto === 'pagesToday')?.target ?? 15;
  const perMonth = goals.find((g) => g.auto === 'booksMonth')?.target ?? 4;
  const pages = pagesOn(books, t0);
  return (
    <Card title="Leitura">
      {now ? <span className="small"><b>{now.title}</b> · página {now.currentPage} de {now.totalPages}</span> : <span className="muted small">Nenhum livro do momento.</span>}
      <div className="row small" style={{ marginTop: 8 }}><span>Hoje</span><b className="right">{pages}/{perDay} pág.</b></div>
      <Bar pct={Math.min(100, (pages / perDay) * 100)} color="#d29d72" />
      <div className="row small" style={{ marginTop: 8 }}><span>Livros no mês</span><b className="right">{booksInMonth(books, t0).length}/{perMonth}</b></div>
      <Link className="add-link" to="/area/pessoal?aba=leitura">{now ? 'registrar páginas →' : '+ livro do momento →'}</Link>
    </Card>
  );
}
