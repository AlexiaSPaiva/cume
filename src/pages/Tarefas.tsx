import { useState } from 'react';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { TaskMenu } from '../components/ItemMenu';
import { AreaTag, Bar, Stat, Stats } from '../components/ui';
import { AREAS, AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { moveTask } from '../lib/tasks';
import { ddmm, dur, today, weekStart } from '../lib/dates';
import { isTodayTask, upcomingDeadlines, weekNumbers } from '../lib/derive';
import type { AreaId, Priority, Task, TaskStatus } from '../lib/types';

const COLS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'hoje', label: 'Hoje', color: '#d9776b' },
  { id: 'andamento', label: 'Em andamento', color: '#7ea3cc' },
  { id: 'aguardando', label: 'Aguardando', color: '#c9b06a' },
  { id: 'concluido', label: 'Concluído', color: '#7fb8a0' },
  { id: 'adiada', label: 'Adiada', color: '#d29b72' },
];

export function Tarefas() {
  const d = useData();
  const ui = useUI();
  const [area, setArea] = useState<AreaId | ''>('');
  const [prio, setPrio] = useState<Priority | ''>('');
  const [over, setOver] = useState<TaskStatus | null>(null);
  const ws = weekStart(today());

  const board = d.tasks.filter((t) => !t.repeatDays?.length && (!area || t.area === area) && (!prio || t.priority === prio));
  const col = (s: TaskStatus): Task[] => {
    if (s === 'hoje') return board.filter((t) => isTodayTask(t) && t.status !== 'concluido');
    if (s === 'concluido') return board.filter((t) => t.status === 'concluido' && (t.doneAt ?? '') >= ws);
    return board.filter((t) => t.status === s);
  };

  async function move(id: number, s: TaskStatus) {
    if (await moveTask(id, s)) ui.toast('Tarefa concluída e meta atualizada.');
  }

  // destaques
  const wn = weekNumbers(d);
  const worst = d.tasks.filter((t) => t.status === 'adiada').sort((a, b) => (b.postponedCount ?? 0) - (a.postponedCount ?? 0))[0];
  const gap = AREAS.map((a) => ({ a, real: wn.total[a.id], want: (d.settings.desiredFocus[a.id] / 100) * wn.totalMin }))
    .sort((x, y) => (y.real - y.want) - (x.real - x.want))[0];
  const next = upcomingDeadlines(d, 30)[0];

  return (
    <Page title="Tarefas" sub="O que precisa de você agora, o que está andando e o que está parado.">
      <Stats>
        <Stat k="Hoje" v={col('hoje').length} s="prioridades" />
        <Stat k="Em andamento" v={col('andamento').length} s="projetos" />
        <Stat k="Aguardando" v={col('aguardando').length} s="respostas externas" />
        <Stat k="Concluídas" v={col('concluido').length} s="esta semana" />
        <Stat k="Adiadas" v={col('adiada').length} s="pedem atenção" />
      </Stats>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto' }} value={area} onChange={(e) => setArea(e.target.value as AreaId | '')} aria-label="Filtrar por área">
          <option value="">Todas as áreas</option>
          {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={prio} onChange={(e) => setPrio(e.target.value as Priority | '')} aria-label="Filtrar por prioridade">
          <option value="">Todas as prioridades</option>
          <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
        </select>
        <span className="muted small" style={{ marginLeft: 'auto' }}><span className="only-mouse">arraste os cards entre as colunas</span><span className="only-touch">toque num card para mudar a situação · deslize para ver as colunas</span></span>
      </div>

      <div className="cols5">
        {COLS.map((c) => {
          const list = col(c.id);
          return (
            <section key={c.id} className={`col ${over === c.id ? 'over' : ''}`} style={{ '--c': c.color } as React.CSSProperties}
              onDragOver={(e) => { e.preventDefault(); setOver(c.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('task')); if (id) move(id, c.id); }}>
              <div className="col-h">{c.label}<small>{list.length}</small></div>
              {list.map((t) => (
                <div key={t.id} className="tcard has-menu" draggable onDragStart={(e) => e.dataTransfer.setData('task', String(t.id))}>
                  <TaskMenu t={t} />
                  <button type="button" className="plain tcard-open" onClick={() => ui.openTask(t)}>
                  <b>{t.title}</b>
                  <span><AreaTag area={t.area} /></span>
                  {c.id === 'hoje' && <span className="muted small">{t.durationMin ? dur(t.durationMin) : ''}{t.start ? ` · ${t.start}` : ''}</span>}
                  {c.id === 'andamento' && (
                    <>
                      {t.deadline && <span className="muted small">{ddmm(t.deadline)}</span>}
                      <div className="row"><div style={{ flex: 1 }}><Bar pct={t.progress ?? 0} color={AREA[t.area].color} /></div><b className="small" style={{ color: AREA[t.area].color }}>{t.progress ?? 0}%</b></div>
                    </>
                  )}
                  {c.id === 'aguardando' && <span className="muted small">{t.deadline ? ddmm(t.deadline) : 'sem prazo'}</span>}
                  {c.id === 'concluido' && (
                    <>
                      <span className="muted small">{t.durationMin ? dur(t.durationMin) : ''}</span>
                      <div className="row"><div style={{ flex: 1 }}><Bar pct={100} color="var(--ok)" /></div><b className="small" style={{ color: 'var(--ok)' }}>100%</b></div>
                    </>
                  )}
                  {c.id === 'adiada' && <span className="muted small">{(t.postponedCount ?? 0) > 1 ? `adiada ${t.postponedCount}x` : t.durationMin ? dur(t.durationMin) : 'adiada'}</span>}
                  </button>
                </div>
              ))}
              <button className="add-link" onClick={() => ui.openTask({ status: c.id === 'hoje' ? 'hoje' : c.id, date: c.id === 'hoje' ? today() : undefined, area: area || undefined })}>+ Nova tarefa</button>
            </section>
          );
        })}
      </div>

      <div className="grid g3">
        <section className="card">
          <h3>Falha em destaque</h3>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {worst ? `${worst.title} adiada ${worst.postponedCount ?? 1} ${(worst.postponedCount ?? 1) > 1 ? 'vezes' : 'vez'} · ${AREA[worst.area].name}.` : 'Nada adiado. Bom ritmo!'}
          </p>
        </section>
        <section className="card">
          <h3>Gargalo de tempo</h3>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {gap && gap.real > gap.want * 1.2
              ? `${gap.a.name} consumiu ${dur(gap.real)}; o foco desejado pedia ~${dur(Math.round(gap.want / 30) * 30)}.`
              : 'O tempo está distribuído perto do foco desejado.'}
          </p>
        </section>
        <section className="card">
          <h3>Próximo prazo</h3>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {next ? `${next.title} · ${ddmm(next.date)} · ${col('hoje').filter((t) => t.area === next.area).length} tarefa(s) da área hoje.` : 'Sem prazos nos próximos 30 dias.'}
          </p>
        </section>
      </div>
    </Page>
  );
}
