import { useState } from 'react';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { SuggestionBanner } from '../components/SuggestionBanner';
import { AreaDot, AreaTag, Bar, Empty, Icon, Stat, Stats } from '../components/ui';
import { AREAS, AREA, zeroByArea } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, DOW_LONG, DOW_SHORT, dur, parse, today, weekDays, weekStart } from '../lib/dates';
import { planHours } from '../lib/derive';
import { impsForWeek, occurrencesForWeek, plannedByArea, sum, capacityMin } from '../lib/week';
import type { AreaId, WeekPlan } from '../lib/types';

export function Planejamento() {
  const data = useData();
  const { tasks, plans, imprevistos, settings } = data;
  const ui = useUI();
  const cur = weekStart(today());
  const next = addDays(cur, 7);
  const [over, setOver] = useState<string | null>(null);

  const curPlanned = plannedByArea(occurrencesForWeek(tasks, cur));
  const nextOcc = occurrencesForWeek(tasks, next);
  const nextPlanned = plannedByArea(nextOcc);
  const stored = plans.find((p) => p.weekStart === next);
  const plan: WeekPlan = stored ?? { weekStart: next, hoursByArea: planHours(data, next).hours, top3: [] };
  const capH = capacityMin(settings) / 60;
  const plannedH = sum(plan.hoursByArea);
  const backlog = tasks.filter((t) => t.status === 'afazer' && !t.date && !t.repeatDays?.length);
  const buffers = tasks.filter((t) => t.bufferFor);
  const bufferByArea = zeroByArea();
  for (const b of buffers) bufferByArea[b.area] += ((b.durationMin ?? 0) * (b.repeatDays?.length ?? 1)) / 60;

  async function save(p: Partial<WeekPlan>) {
    await db.plans.put({ ...plan, ...p });
  }

  // lê o valor salvo dentro da transação: cliques rápidos em − / + nunca se perdem
  async function bump(a: AreaId, n: number) {
    await db.transaction('rw', db.plans, async () => {
      const cur = (await db.plans.get(next)) ?? plan;
      const v = Math.max(0, (cur.hoursByArea[a] ?? 0) + n);
      await db.plans.put({ ...cur, hoursByArea: { ...cur.hoursByArea, [a]: v } });
    });
  }

  async function schedule(id: number, day: string) {
    await db.tasks.update(id, { date: day });
    ui.toast(`Agendada para ${DOW_LONG[parse(day).getDay()]}, ${ddmm(day)}.`);
  }

  const desiredH = (a: AreaId) => Math.round((settings.desiredFocus[a] / 100) * capH);
  const below = AREAS.filter((a) => plan.hoursByArea[a.id] < desiredH(a.id) * 0.75);

  // fechamento da semana atual
  const done = tasks.filter((t) => t.status === 'concluido' && (t.doneAt ?? '') >= cur);
  const late = tasks.filter((t) => t.status === 'adiada');
  const curImps = impsForWeek(imprevistos, cur);
  const candidates = tasks.filter((t) => t.status !== 'concluido' && !t.repeatDays?.length);

  return (
    <Page title="Planejamento" sub="Escolha o que importa na semana que vem, com as horas que você realmente tem.">
      <Stats>
        <Stat k="Semana que vem" v={`${ddmm(next)} – ${ddmm(addDays(next, 6))}`} s="horas por área" />
        <Stat k="Horas planejadas" v={`${plannedH}h`} s={`de ${capH}h possíveis`} />
        <Stat k="Horas livres" v={`${Math.max(0, capH - plannedH)}h`} s="para respirar" />
        <Stat k="Top 3" v={plan.top3.length} s="prioridades da semana" />
        <Stat k="Backlog" v={backlog.length} s="itens para encaixar" />
      </Stats>

      <SuggestionBanner />

      <div className="grid g3">
        <section className="card">
          <h2>Horas por área · semana que vem</h2>
          <div className="list" style={{ gap: 14 }}>
            {AREAS.map((a) => (
              <div key={a.id}>
                <div className="row">
                  <b style={{ fontSize: 13 }}>{a.name}</b>
                  <span className="right row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => bump(a.id, -1)} aria-label={`menos horas em ${a.name}`}>-</button>
                    <button className="btn sm" onClick={() => bump(a.id, 1)} aria-label={`mais horas em ${a.name}`}>+</button>
                    <b style={{ color: a.color, fontSize: 15, width: 38, textAlign: 'right' }}>{plan.hoursByArea[a.id]}h</b>
                  </span>
                </div>
                <div style={{ margin: '6px 0 4px' }}><Bar pct={(plan.hoursByArea[a.id] / 36) * 100} color={a.color} /></div>
                <span className="faint" style={{ fontSize: 10.5 }}>
                  hoje: {Math.round(curPlanned[a.id] / 6) / 10}h · foco desejado: {desiredH(a.id)}h
                  {bufferByArea[a.id] > 0 && ` · inclui ${bufferByArea[a.id]}h de reserva p/ imprevistos`}
                  {nextPlanned[a.id] > 0 && ` · já agendado: ${dur(nextPlanned[a.id])}`}
                </span>
              </div>
            ))}
            {below.length > 0 && <b className="small" style={{ color: 'var(--bad)' }}>{below.map((a) => a.name).join(' e ')} {below.length > 1 ? 'estão' : 'está'} abaixo do foco desejado</b>}
          </div>
        </section>

        <section className="card">
          <h2>Top 3 da semana</h2>
          <div className="list" style={{ gap: 12 }}>
            {[0, 1, 2].map((i) => {
              const t = tasks.find((x) => x.id === plan.top3[i]);
              return (
                <div key={i} className="card" style={{ background: t ? `color-mix(in srgb, ${AREA[t.area].color} 10%, #121931)` : '#121931', borderColor: t ? `color-mix(in srgb, ${AREA[t.area].color} 40%, transparent)` : undefined, display: 'flex', gap: 14, alignItems: 'center', padding: 14 }}>
                  <span style={{ font: '400 2.25rem var(--serif)', color: t ? AREA[t.area].color : 'var(--faint)' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }} className="list">
                    <select className="input" value={plan.top3[i] ?? ''} aria-label={`Prioridade ${i + 1}`}
                      onChange={(e) => {
                        const top = [...plan.top3];
                        top[i] = Number(e.target.value);
                        save({ top3: top.filter((x, j) => x && top.indexOf(x) === j) });
                      }}>
                      <option value="">Escolher tarefa…</option>
                      {candidates.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    {t && <span className="row small"><AreaTag area={t.area} /><span className="muted">{t.deadline ? `até ${ddmm(t.deadline)}` : ''}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="list" style={{ gap: 16 }}>
          <section className="card">
            <h2>Backlog</h2>
            <div className="list">
              {backlog.map((t) => (
                <div key={t.id} className="tcard soft" draggable onDragStart={(e) => e.dataTransfer.setData('task', String(t.id))}>
                  <div className="row"><b className="grow">{t.title}</b><span className="faint small">arraste para um dia</span></div>
                  <span><AreaTag area={t.area} /></span>
                </div>
              ))}
              {backlog.length === 0 && <Empty>Backlog vazio.</Empty>}
              <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                {weekDays(next).map((d) => (
                  <div key={d} className="tag" style={{ padding: '8px 9px', outline: over === d ? '2px dashed var(--accent)' : undefined, flex: 1, textAlign: 'center' }}
                    onDragOver={(e) => { e.preventDefault(); setOver(d); }} onDragLeave={() => setOver(null)}
                    onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('task')); if (id) schedule(id, d); }}>
                    {DOW_SHORT[parse(d).getDay()]}<br />{d.slice(8)}
                  </div>
                ))}
              </div>
              <button className="add-link" onClick={() => ui.openTask({ status: 'afazer' })}>+ item no backlog</button>
            </div>
          </section>

          <section className="card">
            <h2>Reservas para imprevistos</h2>
            <div className="list">
              {buffers.map((b) => (
                <button key={b.id} className="row small" style={{ all: 'unset', display: 'flex', gap: 9, cursor: 'pointer' }} onClick={() => ui.openTask(b)}>
                  <Icon name="repeat" size={13} /><span className="grow" style={{ flex: 1 }}>{b.title}</span>
                  <span className="muted">{b.repeatDays?.map((x) => DOW_SHORT[x]).join(', ')} {b.start} · {dur(b.durationMin ?? 0)}</span>
                </button>
              ))}
              {buffers.length === 0 && <Empty>Quando um imprevisto se repetir {settings.recurrenceThreshold}x em 30 dias, a sugestão de reserva aparece aqui.</Empty>}
            </div>
          </section>

          <section className="card">
            <h2>Fechamento da semana</h2>
            <div className="list" style={{ gap: 12 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}><span className="dotc" style={{ background: 'var(--ok)', width: 12, height: 12, marginTop: 3 }} />
                <div><b>Avançou</b><div className="muted small">{done.length ? done.slice(0, 3).map((t) => t.title).join(', ') : 'nada concluído ainda'}</div></div></div>
              <div className="row" style={{ alignItems: 'flex-start' }}><span className="dotc" style={{ background: 'var(--bad)', width: 12, height: 12, marginTop: 3 }} />
                <div><b>Atrasou</b><div className="muted small">{late.length ? late.map((t) => `${t.title.toLowerCase()}${(t.postponedCount ?? 0) > 1 ? ` (${t.postponedCount}x adiada)` : ''}`).join(', ') : 'nada'}</div></div></div>
              <div className="row" style={{ alignItems: 'flex-start' }}><span className="dotc" style={{ background: 'var(--imp)', width: 12, height: 12, marginTop: 3 }} />
                <div><b>Imprevistos</b><div className="muted small">{dur(curImps.reduce((a, i) => a + i.durationMin, 0))} fora do plano</div></div></div>
            </div>
          </section>
        </div>
      </div>
      <div className="row small muted"><AreaDot area="academica" /> As horas por área são a sua meta para a semana; os blocos agendados aparecem na Agenda e em Minha semana.</div>
    </Page>
  );
}
