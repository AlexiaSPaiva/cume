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
import { mix } from '../lib/color';

// faixa padrão; a grade estica sozinha quando a semana tem algo antes das 7h ou depois das 23h
const DEFAULT_FROM = 7 * 60;
const DEFAULT_TO = 23 * 60;
const PX = 1; // px por minuto
const MIN_H = 15; // altura mínima de um bloco (px): 15 min, então blocos curtos em sequência não se chocam
/** minutos que um bloco ocupa NA TELA: um bloco de 10 min aparece com a altura mínima e não pode encostar no vizinho */
const MIN_VIS = Math.ceil(MIN_H / PX);

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

type Laid = Item & { lane: number; lanes: number; top: boolean; head?: boolean };

/**
 * Bloco "contêiner" (ex.: trabalho 9h–16h) ocupa a coluna inteira e o que acontece dentro dele fica por cima.
 * O que começa junto com ele ("cabeça") vai para a metade direita, para o título do contêiner continuar visível.
 * Blocos que se chocam de igual para igual (tamanhos parecidos) ficam lado a lado.
 */
function layers(items: Item[]): Laid[] {
  const ranked = [...items].sort((a, b) => (b.e - b.s) - (a.e - a.s) || a.s - b.s);
  const base: Item[] = [];
  const over: Item[] = [];
  const inside = (b: Item, it: Item) => b.e - b.s >= 2 * (it.e - it.s) && it.s >= b.s && it.e <= b.e;
  for (const it of ranked) (base.some((b) => inside(b, it)) ? over : base).push(it);
  const isHead = (it: Item) => base.some((b) => inside(b, it) && it.s < b.s + 30);
  return [
    ...lanes(base).map((it) => ({ ...it, top: false })),
    ...lanes(over.filter((it) => !isHead(it))).map((it) => ({ ...it, top: true })),
    ...lanes(over.filter(isHead)).map((it) => ({ ...it, top: true, head: true })),
  ];
}

export function Agenda() {
  const { tasks, imprevistos, settings } = useData();
  const ui = useUI();
  const t0 = today();
  const [ws, setWs] = useState(weekStart(t0));
  const [view, setView] = useState<'semana' | 'dia'>(() => (window.matchMedia('(max-width: 767.98px)').matches ? 'dia' : 'semana'));
  const [day, setDay] = useState(t0);
  const [over, setOver] = useState<string | null>(null);

  // blocos de estudo podem ficar só no Cronograma (opção "Mostrar na Agenda e no Calendário gerais")
  const occ = occurrencesForWeek(settings.study?.showInAgenda === false ? tasks.filter((t) => t.trackId == null) : tasks, ws);
  const imps = impsForWeek(imprevistos, ws);
  const planned = plannedByArea(occ);
  const impMin = sum(impByArea(imps));
  const free = Math.max(0, capacityMin(settings) - sum(planned) - impMin);
  const work = occ.filter((o) => o.task.area === 'profissional' && o.repeating).reduce((s, o) => s + o.durationMin, 0);
  const rest = occ.filter((o) => o.task.soft || /lazer|descanso|livre/i.test(o.task.title)).length;

  const days = view === 'semana' ? weekDays(ws) : [day];
  const timed = [
    ...occ.filter((o) => days.includes(o.date) && o.start).map((o) => [toMin(o.start!), toMin(o.start!) + o.durationMin]),
    ...imps.filter((i) => days.includes(i.date) && i.start).map((i) => [toMin(i.start), toMin(i.start) + i.durationMin]),
  ];
  const FROM = Math.min(DEFAULT_FROM, ...timed.map(([s]) => Math.floor(s / 60) * 60));
  const TO = Math.min(24 * 60, Math.max(DEFAULT_TO, ...timed.map(([, e]) => Math.ceil(e / 60) * 60)));
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
              // imprevistos entram na mesma divisão em colunas: ficam ao lado dos blocos, nunca por cima
              const items: Item[] = [
                ...occ.filter((o) => o.date === d && o.start).map((o) => ({ kind: 'task' as const, o, s: toMin(o.start!), e: toMin(o.start!) + Math.max(MIN_VIS, o.durationMin) })),
                ...imps.filter((i) => i.date === d && i.start).map((i) => ({ kind: 'imp' as const, i, s: toMin(i.start), e: toMin(i.start) + Math.max(MIN_VIS, i.durationMin) })),
              ];
              const laid = layers(items);
              return (
                <div key={d} className={`ag-col ${d === t0 ? 'today' : ''} ${over === d ? 'over' : ''}`} style={{ height: (TO - FROM) * PX }}
                  onDragOver={(e) => { e.preventDefault(); setOver(d); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(d, e)}
                  onDoubleClick={(e) => {
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    ui.openTask({ date: d, start: fromMin(Math.round((FROM + y / PX) / 30) * 30), durationMin: 60 });
                  }}>
                  {hoursList.map((m) => <div key={m} className="ag-line" style={{ top: (m - FROM) * PX }} />)}
                  {laid.map((it) => {
                    const top = (Math.max(FROM, it.s) - FROM) * PX;
                    const h = Math.max(MIN_H, (Math.min(TO, it.e) - Math.max(FROM, it.s)) * PX - 2);
                    // camada de cima: deixa uma faixa à esquerda para a cor do bloco de baixo aparecer
                    const x0 = it.head ? 50 : it.top ? 8 : 0;
                    const w = (it.head ? 50 : it.top ? 92 : 100) / it.lanes;
                    // coluna estreita (2+ conflitos ao mesmo tempo na semana): letra menor e sem quebrar palavra no meio
                    const narrow = view === 'semana' && (it.lanes >= 2 || !!it.head);
                    // o texto cabe no bloco: blocos curtos = 1 linha com "…"; maiores = quantas linhas couberem
                    const tiny = h < 26;
                    const showTime = h >= 46 && !narrow;
                    const lines = Math.max(1, Math.floor((h - (showTime ? 26 : 8)) / (narrow ? 12 : 14)));
                    const pos = { top, height: h, left: `calc(${x0 + it.lane * w}% + 2px)`, right: 'auto', width: `calc(${w}% - 4px)`,
                      ...(it.top && { zIndex: 2, boxShadow: '0 4px 14px rgba(0,0,0,.55)' }) };
                    if (it.kind === 'imp') {
                      const i = it.i;
                      return (
                        <button key={`i${i.id}`} className={`blk imp ${tiny ? 'tiny' : ''} ${narrow ? 'narrow' : ''}`} style={pos} onClick={() => ui.openImprevisto(i)} title={`${i.title} · ${i.start} · ${dur(i.durationMin)}`}>
                          <span className="blk-t" style={{ WebkitLineClamp: lines } as React.CSSProperties}>! {i.title}</span>
                        </button>
                      );
                    }
                    const t = it.o.task;
                    const c = AREA[t.area].color;
                    return (
                      <button key={`${t.id}-${d}`} className={`blk ${tiny ? 'tiny' : ''} ${narrow ? 'narrow' : ''} ${t.soft || t.status === 'adiada' ? 'soft' : ''} ${t.bufferFor ? 'buffer' : ''} ${it.o.done ? 'done' : ''}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('task', String(t.id));
                          e.dataTransfer.setData('grab', String(e.clientY - e.currentTarget.getBoundingClientRect().top));
                        }}
                        onClick={() => ui.openTask(t, d)}
                        title={`${t.title} · ${it.o.start} · ${dur(it.o.durationMin)}${it.o.done ? ' · feita' : ''}`}
                        style={{
                          ...pos,
                          background: mix(c, 30, '#141b33'), borderColor: mix(c, 55, 'transparent'),
                          color: t.soft || t.status === 'adiada' ? c : undefined,
                        }}>
                        <span className="blk-t" style={{ WebkitLineClamp: lines } as React.CSSProperties}>{t.title}{t.status === 'adiada' && ' (adiada)'}</span>
                        {showTime && <small>{it.o.start} · {dur(it.o.durationMin)}</small>}
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
