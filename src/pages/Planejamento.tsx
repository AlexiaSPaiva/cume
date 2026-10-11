import { useState } from 'react';
import { Page } from '../components/Layout';
import { Card } from '../components/Card';
import { useUI } from '../components/Overlays';
import { SuggestionBanner } from '../components/SuggestionBanner';
import { AreaDot, AreaTag, Bar, Empty, Icon, Stat, Stats } from '../components/ui';
import { AREAS, AREA, zeroByArea } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, DOW_LONG, DOW_SHORT, dur, parse, today, weekDays, weekStart } from '../lib/dates';
import { planHours } from '../lib/derive';
import { impsForWeek, occurrencesForWeek, plannedByArea, sum, capacityMin } from '../lib/week';
import { TaskMenu } from '../components/ItemMenu';
import type { AreaId, WeekPlan } from '../lib/types';
import { rescheduleTask } from '../lib/tasks';
import { Link } from 'react-router-dom';
import { studyMinutesWeek, TRACK_TYPES } from '../lib/study';

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
  const base: WeekPlan = stored ?? { weekStart: next, hoursByArea: planHours(data, next).hours, top3: [] };
  // com trilhas de estudo, as horas da Acadêmica vêm do Cronograma de estudos (definidas lá)
  const hasTracks = data.tracks.some((t) => t.status === 'ativa');
  const studyNext = studyMinutesWeek(data, next);
  const plan: WeekPlan = hasTracks ? { ...base, hoursByArea: { ...base.hoursByArea, academica: Math.round(studyNext / 60) } } : base;
  const capH = capacityMin(settings) / 60;
  const plannedH = sum(plan.hoursByArea);
  // backlog: sem dia + as adiadas (com o selo "adiada Nx"), para encaixar na semana que vem
  const backlog = tasks.filter((t) => !t.repeatDays?.length && ((t.status === 'afazer' && !t.date) || t.status === 'adiada'))
    .sort((a, b) => (b.postponedCount ?? 0) - (a.postponedCount ?? 0));
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
    // a mesma tarefa (adiada ou do backlog) ganha o dia; fica no histórico de realocações
    await rescheduleTask(id, { kind: 'dia', date: day });
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
        <Stat k="Estudo planejado" v={`${Math.round(studyNext / 6) / 10}h`.replace('.', ',')} s={`em ${new Set(nextOcc.filter((o) => o.task.trackId != null).map((o) => o.task.trackId)).size} trilhas · Cronograma`} />
        <Stat k="Backlog" v={backlog.length} s="itens para encaixar" />
      </Stats>

      <SuggestionBanner />

      <div className="grid g3">
        <Card title="Horas por área · semana que vem">
          <div className="list" style={{ gap: 14 }}>
            {AREAS.map((a) => (
              <div key={a.id}>
                <div className="row">
                  <b style={{ fontSize: '0.8125rem' }}>{a.name}</b>
                  {a.id === 'academica' && hasTracks && <Link to="/area/academica/cronograma?foco=1" className="tag info" style={{ textDecoration: 'none' }}>via Cronograma de estudos</Link>}
                  <span className="right row" style={{ gap: 6 }}>
                    {!(a.id === 'academica' && hasTracks) && <>
                      <button className="btn sm" onClick={() => bump(a.id, -1)} aria-label={`menos horas em ${a.name}`}>-</button>
                      <button className="btn sm" onClick={() => bump(a.id, 1)} aria-label={`mais horas em ${a.name}`}>+</button>
                    </>}
                    <b style={{ color: a.color, fontSize: '0.9375rem', width: 38, textAlign: 'right' }}>{plan.hoursByArea[a.id]}h</b>
                  </span>
                </div>
                <div style={{ margin: '6px 0 4px' }}><Bar pct={(plan.hoursByArea[a.id] / 36) * 100} color={a.color} /></div>
                <span className="faint" style={{ fontSize: '0.6562rem' }}>
                  hoje: {Math.round(curPlanned[a.id] / 6) / 10}h · foco desejado: {desiredH(a.id)}h
                  {bufferByArea[a.id] > 0 && ` · inclui ${bufferByArea[a.id]}h de reserva p/ imprevistos`}
                  {nextPlanned[a.id] > 0 && ` · já agendado: ${dur(nextPlanned[a.id])}`}
                </span>
              </div>
            ))}
            {below.length > 0 && <b className="small" style={{ color: 'var(--bad)' }}>{below.map((a) => a.name).join(' e ')} {below.length > 1 ? 'estão' : 'está'} abaixo do foco desejado</b>}
          </div>
        </Card>

        <StudyWeek next={next} />

        <Card title="Top 3 da semana">
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
        </Card>

        <div className="list" style={{ gap: 16 }}>
          <Card title="Backlog">
            <div className="list">
              {backlog.map((t) => (
                <div key={t.id} className="tcard soft" draggable onDragStart={(e) => e.dataTransfer.setData('task', String(t.id))}
                  onClick={() => ui.openTask(t)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && ui.openTask(t)}>
                  <div className="row"><b className="grow">{t.title}</b><span className="faint small"><span className="only-mouse">arraste para um dia</span><span className="only-touch">toque para escolher o dia</span></span><TaskMenu t={t} /></div>
                  <span className="row" style={{ gap: 6 }}><AreaTag area={t.area} />{(t.postponedCount ?? 0) > 0 && <span className="tag bad">adiada {t.postponedCount}x</span>}</span>
                </div>
              ))}
              {backlog.length === 0 && <Empty action={{ label: '+ Nova tarefa', run: () => ui.openTask({ status: 'andamento' }) }}>Backlog vazio: tudo já tem dia marcado.</Empty>}
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
          </Card>

          <Card title="Reservas para imprevistos">
            <div className="list">
              {buffers.map((b) => (
                <button key={b.id} className="plain row small" style={{ display: 'flex', gap: 9, cursor: 'pointer' }} onClick={() => ui.openTask(b)}>
                  <Icon name="repeat" size={13} /><span className="grow" style={{ flex: 1 }}>{b.title}</span>
                  <span className="muted">{b.repeatDays?.map((x) => DOW_SHORT[x]).join(', ')} {b.start} · {dur(b.durationMin ?? 0)}</span>
                </button>
              ))}
              {buffers.length === 0 && <Empty>Quando um imprevisto se repetir {settings.recurrenceThreshold}x em 30 dias, a sugestão de reserva aparece aqui.</Empty>}
            </div>
          </Card>

          <Card title="Fechamento da semana">
            <div className="list" style={{ gap: 12 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}><span className="dotc" style={{ background: 'var(--ok)', width: 12, height: 12, marginTop: 3 }} />
                <div><b>Avançou</b><div className="muted small">{done.length ? done.slice(0, 3).map((t) => t.title).join(', ') : 'nada concluído ainda'}</div></div></div>
              <div className="row" style={{ alignItems: 'flex-start' }}><span className="dotc" style={{ background: 'var(--bad)', width: 12, height: 12, marginTop: 3 }} />
                <div><b>Atrasou</b><div className="muted small">{late.length ? late.map((t) => `${t.title.toLowerCase()}${(t.postponedCount ?? 0) > 1 ? ` (${t.postponedCount}x adiada)` : ''}`).join(', ') : 'nada'}</div></div></div>
              <div className="row" style={{ alignItems: 'flex-start' }}><span className="dotc" style={{ background: 'var(--imp)', width: 12, height: 12, marginTop: 3 }} />
                <div><b>Imprevistos</b><div className="muted small">{dur(curImps.reduce((a, i) => a + i.durationMin, 0))} fora do plano</div></div></div>
            </div>
          </Card>
        </div>
      </div>
      <div className="row small muted"><AreaDot area="academica" /> As horas por área são a sua meta para a semana; os blocos agendados aparecem na Agenda e em Minha semana.</div>
    </Page>
  );
}

/** Estudos da semana (v7, §4b): o resumo do Cronograma de estudos da semana que vem */
function StudyWeek({ next }: { next: string }) {
  const d = useData();
  if (!d.tracks.length) return null;
  const occ = occurrencesForWeek(d.tasks, next).filter((o) => o.task.trackId != null && o.task.status !== 'adiada');
  const total = occ.reduce((s, o) => s + o.durationMin, 0);
  const byType = TRACK_TYPES.map((tt) => ({ tt, min: occ.filter((o) => d.tracks.find((t) => t.id === o.task.trackId)?.type === tt.id).reduce((s, o) => s + o.durationMin, 0) })).filter((x) => x.min > 0);
  const end = addDays(next, 6);
  const highlights = [
    ...d.trackDates.filter((x) => x.date >= next && x.date <= end).map((x) => ({ date: x.date, text: `${x.label}${x.time ? ` · ${x.time}` : ''}`, prio: x.kind === 'prova' || x.kind === 'simulado' })),
    ...d.tracks.filter((t) => t.examDate && t.examDate >= next && t.examDate <= end).map((t) => ({ date: t.examDate!, text: `Prova · ${t.title}`, prio: true })),
    ...d.tracks.filter((t) => t.deadline && t.deadline >= next && t.deadline <= end).map((t) => ({ date: t.deadline!, text: `${t.deadlineLabel ?? 'Entrega'} · ${t.title}`, prio: false })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  return (
    <Card title="Estudos da semana">
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <b className="big">{Math.round(total / 6) / 10}h</b><span className="muted small">de estudo em {occ.length} {occ.length === 1 ? 'bloco' : 'blocos'}</span>
      </div>
      <div className="stack-bar" aria-hidden="true">{byType.map((x) => <i key={x.tt.id} style={{ flex: x.min, background: x.tt.color }} />)}</div>
      <p className="muted small" style={{ margin: '6px 0 10px' }}>{byType.map((x) => `${x.tt.plural} ${dur(x.min)}`).join(' · ') || 'Nenhum bloco de estudo marcado para a semana que vem.'}</p>
      <div className="list">
        {highlights.map((h, i) => (
          <div key={i} className="row small"><span className="dotc" style={{ background: h.prio ? 'var(--accent)' : '#d197ae' }} /><span className="grow">{h.text} · {DOW_SHORT[parse(h.date).getDay()].toLowerCase()} {ddmm(h.date)}</span>{h.prio && <span className="tag bad">prioridade</span>}</div>
        ))}
      </div>
      <Link to="/area/academica/cronograma?foco=1" className="btn gold big" style={{ marginTop: 12, textDecoration: 'none' }}>Abrir planejamento de estudos ›</Link>
      <p className="muted small" style={{ textAlign: 'center', margin: '6px 0 0' }}>abre o Cronograma em modo foco · ✕ volta para cá</p>
    </Card>
  );
}
