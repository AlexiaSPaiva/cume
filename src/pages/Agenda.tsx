import { useState } from 'react';
import { Page } from '../components/Layout';
import { Card } from '../components/Card';
import { useUI } from '../components/Overlays';
import { Stat, Stats } from '../components/ui';
import { AREAS, AREA, IMPREVISTO_COLOR } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, DOW_SHORT, dur, fromMin, parse, toMin, today, weekDays, weekStart } from '../lib/dates';
import { impByArea, impsForWeek, occurrencesForWeek, plannedByArea, sum, capacityMin, type Occurrence } from '../lib/week';
import type { Imprevisto } from '../lib/types';
import { rescheduleTask } from '../lib/tasks';

const FROM = 7 * 60;
const TO = 23 * 60;
const PX = 0.6; // px por minuto

type Item = { kind: 'task'; o: Occurrence; s: number; e: number } | { kind: 'imp'; i: Imprevisto; s: number; e: number };

/** distribui blocos sobrepostos em colunas lado a lado */
function lanes(items: Item[]): (Item & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out: (Item & { lane: number; lanes: number })[] = [];
  let group: (Item & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => (g.lanes = n));
    out.push(...group);
    group = [];
  };
  for (const it of sorted) {
    if (it.s >= groupEnd) { flush(); groupEnd = -1; }
    const used = new Set(group.filter((g) => g.e > it.s).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ ...it, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, it.e);
  }
  flush();
  return out;
}

export function Agenda() {
  const { tasks, imprevistos, settings } = useData();
  const ui = useUI();
  const t0 = today();
  const [ws, setWs] = useState(weekStart(t0));
  const [view, setView] = useState<'semana' | 'dia'>(() => (window.matchMedia('(max-width: 767.98px)').matches ? 'dia' : 'semana'));
  const [day, setDay] = useState(t0);
  const [over, setOver] = useState<string | null>(null);

  const occ = occurrencesForWeek(tasks, ws);
  const imps = impsForWeek(imprevistos, ws);
  const planned = plannedByArea(occ);
  const impMin = sum(impByArea(imps));
  const free = Math.max(0, capacityMin(settings) - sum(planned) - impMin);
  const work = occ.filter((o) => o.task.area === 'profissional' && o.repeating).reduce((s, o) => s + o.durationMin, 0);
  const rest = occ.filter((o) => o.task.soft || /lazer|descanso|livre/i.test(o.task.title)).length;

  const days = view === 'semana' ? weekDays(ws) : [day];
  const hoursList = Array.from({ length: (TO - FROM) / 60 + 1 }, (_, i) => FROM + i * 60);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  async function drop(d: string, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData('task'));
    const grab = Number(e.dataTransfer.getData('grab') || 0);
    if (!id) return;
    const t = await db.tasks.get(id);
    if (!t) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top - grab;
    const start = fromMin(Math.max(FROM, Math.min(TO - 15, Math.round((FROM + y / PX) / 15) * 15)));
    if (t.repeatDays?.length) {
      await db.tasks.update(id, { start });
      ui.toast('Horário do bloco fixo alterado em todas as semanas.');
    } else {
      if (t.date !== d || t.status === 'adiada') await rescheduleTask(id, { kind: 'dia', date: d, start });
      else await db.tasks.update(id, { start });
    }
  }

  function shift(n: number) {
    if (view === 'semana') setWs(addDays(ws, n * 7));
    else {
      const nd = addDays(day, n);
      setDay(nd);
      setWs(weekStart(nd));
    }
  }

  return (
    <Page title="Agenda" sub="Sua semana em um olhar: o que é plano, o que é descanso e o que foi imprevisto.">
      <Stats>
        <Stat k="Horas livres" v={`${Math.round(free / 60)}h`} s="para planejar" />
        <Stat k="Imprevistos" v={dur(impMin)} s={`${imps.length} nesta semana`} />
        <Stat k="Trabalho" v={`${Math.round(work / 60)}h`} s="blocos fixos" />
        <Stat k="Estudo e pesquisa" v={`${Math.round(planned.academica / 60)}h`} s="Acadêmica" />
        <Stat k="Descanso" v={`${rest} blocos`} s="planejados" />
      </Stats>

      <Card wide style={{ paddingBottom: 12 }} title={<span className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => shift(-1)} aria-label="Anterior">‹</button>
          {view === 'semana' ? `Semana ${ddmm(ws)} – ${ddmm(addDays(ws, 6))}` : `${DOW_SHORT[parse(day).getDay()]} ${ddmm(day)}`}
          <button className="btn sm" onClick={() => shift(1)} aria-label="Próximo">›</button>
        </span>}>
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="seg">
            <button className={view === 'dia' ? 'on' : ''} onClick={() => setView('dia')}>Dia</button>
            <button className={view === 'semana' ? 'on' : ''} onClick={() => setView('semana')}>Semana</button>
          </div>
          <div className="row small muted" style={{ marginLeft: 'auto', flexWrap: 'wrap', gap: '4px 12px' }}>
            {AREAS.map((a) => <span key={a.id} className="row" style={{ gap: 5 }}><span className="dotc" style={{ background: a.color }} />{a.name}</span>)}
            <span className="row" style={{ gap: 5 }}><span className="dotc" style={{ background: IMPREVISTO_COLOR }} />imprevisto</span>
          </div>
        </div>

        <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <div className="ag" style={{ '--days': days.length, minWidth: view === 'semana' ? 760 : 0 } as React.CSSProperties}>
            <div />
            {days.map((d) => (
              <button key={d} className={`plain ag-h ${d === t0 ? 'today' : ''}`} style={{ textAlign: 'center', fontWeight: 700, padding: '6px 0 8px', cursor: 'pointer', color: d === t0 ? 'var(--accent)' : undefined }}
                onClick={() => { setDay(d); setView('dia'); }}>
                {DOW_SHORT[parse(d).getDay()]} {d.slice(8)}
              </button>
            ))}
            <div className="ag-times" style={{ height: (TO - FROM) * PX }}>
              {hoursList.filter((_, i) => i % 2 === 1 || view === 'dia').map((m) => <div key={m} style={{ top: (m - FROM) * PX }}>{fromMin(m)}</div>)}
            </div>
            {days.map((d) => {
              const items: Item[] = [
                ...occ.filter((o) => o.date === d && o.start).map((o) => ({ kind: 'task' as const, o, s: toMin(o.start!), e: toMin(o.start!) + Math.max(15, o.durationMin) })),
              ];
              const laid = lanes(items);
              const dImps = imps.filter((i) => i.date === d);
              return (
                <div key={d} className={`ag-col ${d === t0 ? 'today' : ''} ${over === d ? 'over' : ''}`} style={{ height: (TO - FROM) * PX }}
                  onDragOver={(e) => { e.preventDefault(); setOver(d); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(d, e)}
                  onDoubleClick={(e) => {
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    ui.openTask({ date: d, start: fromMin(Math.round((FROM + y / PX) / 30) * 30), durationMin: 60 });
                  }}>
                  {hoursList.map((m) => <div key={m} className="ag-line" style={{ top: (m - FROM) * PX }} />)}
                  {laid.map((it) => {
                    if (it.kind !== 'task') return null;
                    const t = it.o.task;
                    const c = AREA[t.area].color;
                    const top = (Math.max(FROM, it.s) - FROM) * PX;
                    const h = Math.max(16, (Math.min(TO, it.e) - Math.max(FROM, it.s)) * PX - 2);
                    const w = 100 / it.lanes;
                    return (
                      <button key={`${t.id}-${d}`} className={`blk ${t.soft || t.status === 'adiada' ? 'soft' : ''} ${t.bufferFor ? 'buffer' : ''}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('task', String(t.id));
                          e.dataTransfer.setData('grab', String(e.clientY - e.currentTarget.getBoundingClientRect().top));
                        }}
                        onClick={() => ui.openTask(t)}
                        title={`${t.title} · ${it.o.start} · ${dur(it.o.durationMin)}`}
                        style={{
                          top, height: h, left: `calc(${it.lane * w}% + 3px)`, right: 'auto', width: `calc(${w}% - 6px)`,
                          background: `color-mix(in srgb, ${c} 30%, #141b33)`, borderColor: `color-mix(in srgb, ${c} 55%, transparent)`,
                          color: t.soft || t.status === 'adiada' ? c : undefined,
                        }}>
                        {t.title}{t.status === 'adiada' && ' (adiada)'}
                        {h > 34 && <small>{it.o.start} · {dur(it.o.durationMin)}</small>}
                      </button>
                    );
                  })}
                  {dImps.map((i) => {
                    const s = toMin(i.start);
                    const top = (Math.max(FROM, s) - FROM) * PX;
                    const h = Math.max(16, i.durationMin * PX - 2);
                    return (
                      <button key={`i${i.id}`} className="blk imp" style={{ top, height: h, right: 4 }} onClick={() => ui.openImprevisto(i)} title={`${i.title} · ${dur(i.durationMin)}`}>
                        ! {i.title}
                      </button>
                    );
                  })}
                  {d === t0 && nowMin >= FROM && nowMin <= TO && <div className="now-line" style={{ top: (nowMin - FROM) * PX }} />}
                </div>
              );
            })}
          </div>
        </div>
        <p className="faint small" style={{ margin: '10px 0 0' }}>Arraste um bloco para mudar dia e horário · duplo clique num horário vazio cria um compromisso · blocos listrados são reservas para imprevistos recorrentes.</p>
      </Card>
    </Page>
  );
}
