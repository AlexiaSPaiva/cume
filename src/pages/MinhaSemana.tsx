import { useState } from 'react';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { AreaDot, Icon, Stat, Stats } from '../components/ui';
import { AREAS, AREA, IMPREVISTO_COLOR } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, DOW_SHORT, dur, hours, parse, today, weekDays, weekStart } from '../lib/dates';
import { impByArea, impsForWeek, occurrencesForWeek, plannedByArea, sum, capacityMin } from '../lib/week';

export function MinhaSemana() {
  const { tasks, imprevistos, plans, settings } = useData();
  const ui = useUI();
  const [ws, setWs] = useState(weekStart(today()));
  const [over, setOver] = useState<string | null>(null);
  const days = weekDays(ws);
  const t0 = today();

  const occ = occurrencesForWeek(tasks, ws);
  const shown = occ.filter((o) => !o.repeating || o.task.bufferFor);
  const imps = impsForWeek(imprevistos, ws);
  const planned = plannedByArea(occ);
  const impA = impByArea(imps);
  const plannedMin = sum(planned);
  const impMin = sum(impA);
  const free = Math.max(0, capacityMin(settings) - plannedMin - impMin);
  const plan = plans.find((p) => p.weekStart === ws);
  const top3 = (plan?.top3 ?? []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);

  async function drop(day: string, e: React.DragEvent) {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData('task'));
    if (!id) return;
    const t = await db.tasks.get(id);
    if (!t || t.repeatDays?.length) return;
    const moved = t.date && t.date < day;
    await db.tasks.update(id, {
      date: day,
      status: t.status === 'adiada' ? 'afazer' : t.status,
      postponedCount: moved ? (t.postponedCount ?? 0) + 1 : t.postponedCount,
    });
  }

  async function toggleDone(id: number, done: boolean) {
    await db.tasks.update(id, { status: done ? 'afazer' : 'concluido', doneAt: done ? undefined : today(), progress: done ? undefined : 100 });
  }

  async function postpone(id: number) {
    const t = await db.tasks.get(id);
    if (!t) return;
    await db.tasks.update(id, { status: 'adiada', postponedCount: (t.postponedCount ?? 0) + 1 });
  }

  const rangeLabel = `${ddmm(days[0])} – ${ddmm(days[6])}`;

  return (
    <Page title="Minha semana" sub="Tudo o que está planejado de segunda a domingo, dia a dia e com horário.">
      <Stats>
        <Stat k="Tarefas e blocos" v={shown.length} s="planejados na semana" />
        <Stat k="Hoje" v={shown.filter((o) => o.date === t0 && o.task.status !== 'concluido').length} s="tarefas para fazer" />
        <Stat k="Top 3 da semana" v={top3.length} s={top3.map((t) => t!.title).join(', ') || 'defina no Planejamento'} />
        <Stat k="Horas livres" v={hours(free).replace('.0', '')} s="para respirar" />
        <Stat k="Imprevistos" v={dur(impMin)} s={`${imps.length} nesta semana`} />
      </Stats>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <button className="btn sm" onClick={() => setWs(addDays(ws, -7))} aria-label="Semana anterior">‹</button>
          <b>Semana {rangeLabel}</b>
          <button className="btn sm" onClick={() => setWs(addDays(ws, 7))} aria-label="Próxima semana">›</button>
          {ws !== weekStart(t0) && <button className="btn sm ghost" onClick={() => setWs(weekStart(t0))}>hoje</button>}
        </div>
        <span className="muted small">arraste um card para outro dia</span>
      </div>

      <div className="week7">
        {days.map((day) => {
          const items = shown.filter((o) => o.date === day);
          const dImps = imps.filter((i) => i.date === day);
          const pm = items.filter((o) => o.task.status !== 'adiada').reduce((s, o) => s + o.durationMin, 0);
          const im = dImps.reduce((s, i) => s + i.durationMin, 0);
          const cards = [
            ...items.map((o) => ({ kind: 'task' as const, start: o.start ?? '99:99', o })),
            ...dImps.map((i) => ({ kind: 'imp' as const, start: i.start, i })),
          ].sort((a, b) => a.start.localeCompare(b.start));
          return (
            <section key={day} className={`day ${day === t0 ? 'today' : ''} ${over === day ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(day); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(day, e)}>
              <div className="day-h">
                <span><b>{DOW_SHORT[parse(day).getDay()]}</b>{day === t0 && <small>HOJE</small>}</span>
                <span className="n">{day.slice(8)}</span>
              </div>
              <div className="day-load"><span>{dur(pm)} planejadas</span>{im > 0 && <b>+{dur(im)}</b>}</div>
              <div style={{ padding: '0 4px' }}>
                <div className="bar"><i style={{ width: `${Math.min(100, (pm / 600) * 100)}%`, background: 'var(--accent)' }} /></div>
              </div>
              {cards.map((c) =>
                c.kind === 'imp' ? (
                  <button key={`i${c.i.id}`} className="tcard imp" onClick={() => ui.openImprevisto(c.i)}>
                    <div className="meta"><span className="tm" style={{ color: IMPREVISTO_COLOR }}>{c.i.start}</span><span>{dur(c.i.durationMin)}</span></div>
                    <b>! {c.i.title}</b>
                    <span className="muted" style={{ fontSize: 10.5 }}>{AREA[c.i.area].name}</span>
                  </button>
                ) : (
                  <div key={`t${c.o.task.id}-${day}`} className={`tcard ${c.o.task.soft || c.o.task.status === 'adiada' ? 'soft' : ''} ${c.o.task.status === 'concluido' ? 'done' : ''}`}
                    draggable={!c.o.repeating} onDragStart={(e) => e.dataTransfer.setData('task', String(c.o.task.id))}
                    onClick={() => ui.openTask(c.o.task)} role="button" tabIndex={0}>
                    <div className="meta">
                      <span className="tm" style={{ color: AREA[c.o.task.area].color }}>{c.o.start ?? '—'}</span>
                      <span>{c.o.durationMin ? dur(c.o.durationMin) : ''}</span>
                    </div>
                    <b style={{ color: c.o.task.soft || c.o.task.status === 'adiada' ? 'var(--muted)' : undefined }}>
                      {c.o.task.bufferFor && <Icon name="repeat" size={11} />} {c.o.task.title}
                    </b>
                    <div className="meta">
                      <span>{c.o.task.status === 'adiada' ? 'adiada' : AREA[c.o.task.area].name}</span>
                      {!c.o.repeating && (
                        <span className="row" style={{ gap: 2 }} onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn" title={c.o.task.status === 'concluido' ? 'Desfazer' : 'Marcar como feita'} onClick={() => toggleDone(c.o.task.id!, c.o.task.status === 'concluido')}><Icon name="check" size={13} /></button>
                          {c.o.task.status !== 'adiada' && c.o.task.status !== 'concluido' && <button className="icon-btn" title="Adiar" style={{ fontSize: 11 }} onClick={() => postpone(c.o.task.id!)}>adiar</button>}
                        </span>
                      )}
                    </div>
                  </div>
                ),
              )}
              <button className="add-link" onClick={() => ui.openTask({ date: day })}>+ tarefa</button>
            </section>
          );
        })}
      </div>

      <section className="card">
        <div className="row" style={{ alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="nav-h" style={{ padding: '0 0 10px' }}>Horas da semana por área</div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              {AREAS.map((a) => <i key={a.id} style={{ flex: planned[a.id], background: a.color }} />)}
              <i style={{ flex: impMin, background: IMPREVISTO_COLOR }} />
              <i style={{ flex: free, background: '#232b47' }} />
            </div>
            <div className="row small muted" style={{ flexWrap: 'wrap', gap: '6px 18px', marginTop: 10 }}>
              {AREAS.map((a) => <span key={a.id} className="row" style={{ gap: 6 }}><AreaDot area={a.id} />{a.name} {hours(planned[a.id])}</span>)}
              <span className="row" style={{ gap: 6 }}><span className="dotc" style={{ background: IMPREVISTO_COLOR }} />Imprevistos {hours(impMin)}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '400 2rem var(--serif)' }}>{hours(free)}</div>
            <span className="muted small">horas livres</span>
          </div>
        </div>
      </section>
    </Page>
  );
}
