import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { ItemMenu } from '../components/ItemMenu';
import { Page, usePageFocus } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { StudyTimer, studyPrefs } from '../components/StudyTimer';
import { Empty, Modal } from '../components/ui';
import { AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, DOW_SHORT, dur, iso, parse, today, toMin, weekDays, weekStart } from '../lib/dates';
import { askNotify } from '../lib/reminders';
import { planByNecessity, studyMinutesWeek, TRACK_TYPES, TYPE } from '../lib/study';
import { rescheduleTask } from '../lib/tasks';
import type { Task, Track, TrackType } from '../lib/types';
import { capacityMin, occurrencesForWeek, type Occurrence } from '../lib/week';

const FROM = 6 * 60, TO = 23 * 60, PX = 0.75; // 06:00–23:00, 0,75px por minuto

/**
 * Cronograma de estudos (v7, §7). Só blocos de estudo (tarefas com trackId), coloridos por trilha;
 * compromissos das outras áreas aparecem cinza tracejados e só se editam na Agenda.
 * Mover um bloco aqui move O MESMO evento na Agenda.
 * Abre em modo foco quando vem de "Abrir planejamento de estudos" (?foco=1); ✕/Esc volta para a tela de origem.
 */
export function Cronograma({ trackId, embedded = false }: { trackId?: number; embedded?: boolean }) {
  const d = useData();
  const ui = useUI();
  const nav = useNavigate();
  const [q] = useSearchParams();
  const focus = usePageFocus();
  const [view, setView] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [anchor, setAnchor] = useState(today());
  const [types, setTypes] = useState<Set<TrackType>>(new Set());
  const [blockForm, setBlockForm] = useState<Partial<Task> | null>(null);
  const [studying, setStudying] = useState<{ track: Track; block?: Task } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const prefs = studyPrefs(d.settings);
  const ws = weekStart(anchor);
  const days = view === 'dia' ? [anchor] : weekDays(ws);

  // modo foco: abre sozinho com ?foco=1 e, ao sair (✕/Esc), volta para onde estava
  const opened = useRef(false);
  useEffect(() => {
    if (embedded || q.get('foco') !== '1' || !focus) return;
    if (!opened.current && !focus.on) { opened.current = true; focus.open(); return; }
    if (opened.current && !focus.on) { opened.current = false; nav(-1); }
  }, [focus, focus?.on, q, embedded, nav]);

  const trackOf = (id?: number) => d.tracks.find((t) => t.id === id);
  const visible = (t: Task) => t.trackId != null && (trackId == null || t.trackId === trackId)
    && (!types.size || types.has(trackOf(t.trackId)?.type ?? 'course'));
  const occ = occurrencesForWeek(d.tasks, ws).filter((o) => o.task.status !== 'adiada' && o.start);
  const study = occ.filter((o) => visible(o.task));
  const others = occ.filter((o) => o.task.trackId == null);
  const color = (t: Task) => TYPE[trackOf(t.trackId)?.type ?? 'course'].color;

  const planned = studyMinutesWeek(d, ws, trackId);
  const byType = TRACK_TYPES.map((tt) => ({
    tt, min: study.filter((o) => trackOf(o.task.trackId)?.type === tt.id).reduce((s, o) => s + o.durationMin, 0),
  })).filter((x) => x.min > 0);
  const busyAll = occ.reduce((s, o) => s + o.durationMin, 0);
  const free = Math.max(0, capacityMin(d.settings) - busyAll);
  const examTracks = d.tracks.filter((t) => t.type === 'exam' && t.status === 'ativa' && (trackId == null || t.id === trackId));

  async function generate() {
    let n = 0;
    for (const t of examTracks.length ? examTracks : d.tracks.filter((x) => x.status === 'ativa' && (trackId == null || x.id === trackId))) {
      const blocks = planByNecessity(d, t, { from: addDays(today(), 1) });
      if (blocks.length) { await db.tasks.bulkAdd(blocks.map((b) => ({ ...b, remindMin: prefs.blockStart ? prefs.remindMin : undefined }))); n += blocks.length; }
    }
    ui.toast(n ? `${n} blocos de estudo criados para os próximos 7 dias, pela necessidade de cada matéria. Mova ou ajuste à vontade.` : 'Cadastre as matérias/módulos da trilha para gerar o cronograma.');
  }

  async function drop(day: string, e: React.DragEvent) {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData('task'));
    if (!id) return;
    const t = d.tasks.find((x) => x.id === id);
    if (!t || t.trackId == null) return;
    const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    const start = Math.max(FROM, Math.min(TO - 15, Math.round((FROM + y / PX) / 15) * 15));
    const hhmm = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
    await rescheduleTask(id, { kind: 'dia', date: day, start: hhmm });
  }

  const shift = (n: number) => setAnchor(view === 'mes' ? iso(new Date(parse(anchor).getFullYear(), parse(anchor).getMonth() + n, 1)) : addDays(anchor, view === 'dia' ? n : 7 * n));
  const label = view === 'dia' ? `${DOW_SHORT[parse(anchor).getDay()]} ${ddmm(anchor)}` : view === 'semana' ? `${ddmm(ws)} – ${ddmm(addDays(ws, 6))}` : `${parse(anchor).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

  const body = (
    <>
      <div className="hist-bar">
        <div className="seg" role="radiogroup" aria-label="Visão">
          {(['dia', 'semana', 'mes'] as const).map((v) => <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}</button>)}
        </div>
        <div className="hist-nav">
          <button className="btn sm" onClick={() => shift(-1)} aria-label="Anterior">‹</button><b>{label}</b><button className="btn sm" onClick={() => shift(1)} aria-label="Próximo">›</button>
        </div>
        {trackId == null && (
          <div className="chips" aria-label="Filtrar por tipo de trilha">
            {TRACK_TYPES.filter((tt) => d.tracks.some((t) => t.type === tt.id)).map((tt) => (
              <button key={tt.id} type="button" aria-pressed={types.has(tt.id)} className={`chip ${types.has(tt.id) ? 'on' : ''}`}
                onClick={() => setTypes((s) => { const n = new Set(s); if (n.has(tt.id)) n.delete(tt.id); else n.add(tt.id); return n; })}>{tt.plural}</button>
            ))}
          </div>
        )}
        <span className="hist-right">
          <label className="check small"><input type="checkbox" checked={prefs.showInAgenda} onChange={(e) => db.settings.update('me', { study: { ...d.settings.study, showInAgenda: e.target.checked } })} /> Mostrar na Agenda e no Calendário gerais</label>
          <button className="btn out" onClick={() => void generate()}>Gerar pela necessidade</button>
          <button className="btn gold" onClick={() => setBlockForm({ trackId: trackId ?? d.tracks.find((t) => t.status === 'ativa')?.id, date: anchor > today() ? anchor : today(), start: '19:00', durationMin: 60 })}>+ Bloco de estudo</button>
        </span>
      </div>

      <div className="grid g3">
        <Card title={view === 'mes' ? 'Mês' : 'Semana'} className="span2" wide expandable={false}>
          {view === 'mes' ? <MonthView anchor={anchor} visible={visible} onPick={(x) => { setAnchor(x); setView('dia'); }} /> : (
            <div className="cg" style={{ '--days': days.length } as React.CSSProperties}>
              <div className="cg-times">{Array.from({ length: (TO - FROM) / 120 + 1 }, (_, i) => <span key={i} style={{ top: i * 120 * PX }}>{String(6 + i * 2).padStart(2, '0')}:00</span>)}</div>
              {days.map((day) => (
                <div key={day} className={`cg-col ${day === today() ? 'today' : ''} ${over === day ? 'over' : ''}`}>
                  <div className="cg-h">{DOW_SHORT[parse(day).getDay()]} {day.slice(8)}</div>
                  <div className="cg-body" style={{ height: (TO - FROM) * PX }}
                    onDragOver={(e) => { e.preventDefault(); setOver(day); }} onDragLeave={() => setOver(null)} onDrop={(e) => void drop(day, e)}>
                    {lanes(others.filter((o) => o.date === day)).map(({ o, lane, of }, i) => (
                      <div key={`o${i}`} className="cg-blk other" style={{ ...pos(o), left: `calc(${(lane / of) * 100}% + 2px)`, right: 'auto', width: `calc(${100 / of}% - 4px)` }} title={`${o.task.title} · ${AREA[o.task.area].name} (edite na Agenda)`}>
                        <b>{o.task.title}</b><small>{o.start}</small>
                      </div>
                    ))}
                    {study.filter((o) => o.date === day).map((o) => (
                      <div key={`s${o.task.id}${o.date}`} className={`cg-blk ${o.task.status === 'concluido' ? 'done' : ''}`} draggable={!o.repeating}
                        onDragStart={(e) => e.dataTransfer.setData('task', String(o.task.id))}
                        style={{ ...pos(o), '--c': color(o.task) } as React.CSSProperties}>
                        <button type="button" className="plain cg-open" onClick={() => ui.openTask(o.task)}>
                          <b>{o.task.title}{o.task.remindMin ? ' 🔔' : ''}</b><small>{o.start} · {dur(o.durationMin)}</small>
                        </button>
                        <ItemMenu label={o.task.title} actions={{
                          open: { label: '▶ Estudar agora', run: () => { const t = trackOf(o.task.trackId); if (t) setStudying({ track: t, block: o.task }); } },
                          edit: () => ui.openTask(o.task),
                          move: { label: 'Realocar…', run: () => ui.openReschedule(o.task) },
                          delete: () => void ui.remove('tasks', o.task.id!, `“${o.task.title}”`),
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {study.length === 0 && view !== 'mes' && <Empty>Nenhum bloco de estudo {view === 'dia' ? 'neste dia' : 'nesta semana'}. Use “+ Bloco de estudo” ou “Gerar pela necessidade”.</Empty>}
        </Card>

        <div className="list" style={{ gap: 16 }}>
          <Card title="Esta semana" expandable={false}>
            <div className="row small"><span>Planejado</span><b className="right">{dur(planned) || '0h'}</b></div>
            <div className="stack-bar" aria-hidden="true">{byType.map((x) => <i key={x.tt.id} style={{ flex: x.min, background: x.tt.color }} />)}</div>
            <p className="muted small" style={{ margin: '6px 0 0' }}>{byType.map((x) => `${x.tt.plural} ${dur(x.min)}`).join(' · ')}{byType.length ? ' · ' : ''}{dur(free) || '0h'} livres sobrando</p>
          </Card>
          <Alarms />
          <p className="note small">Arrastar um bloco aqui move o mesmo evento na Agenda. Blocos cinza tracejados são compromissos de outras áreas: aparecem para você não marcar estudo em cima, mas só se editam na Agenda.</p>
        </div>
      </div>

      {blockForm && (
        <Modal title="Bloco de estudo" onClose={() => setBlockForm(null)}>
          <BlockForm b={blockForm} onDone={(m) => { setBlockForm(null); if (m) ui.toast(m); }} />
        </Modal>
      )}
      {studying && (
        <Modal title={`Estudar · ${studying.track.title}`} onClose={() => setStudying(null)}>
          <StudyTimer track={studying.track} block={studying.block} onDone={(m) => { setStudying(null); if (m) ui.toast(m); }} />
        </Modal>
      )}
    </>
  );

  if (embedded) return body;
  return (
    <Page title="Cronograma de estudos" sub="Só o que é estudo. Mexa aqui à vontade: a Agenda e o Calendário gerais se atualizam juntos."
      crumbs={[{ to: '/', label: 'Início' }, { to: '/area/academica', label: 'Acadêmica' }, { label: 'Cronograma de estudos' }]}>
      {body}
    </Page>
  );
}

/** blocos que se sobrepõem ficam lado a lado (cada um na sua faixa) */
function lanes(list: Occurrence[]): { o: Occurrence; lane: number; of: number }[] {
  const sorted = [...list].sort((a, b) => toMin(a.start!) - toMin(b.start!));
  const out: { o: Occurrence; lane: number; of: number }[] = [];
  let group: { o: Occurrence; lane: number; of: number }[] = [];
  let groupEnd = -1;
  const ends: number[] = [];
  for (const o of sorted) {
    const s0 = toMin(o.start!), e0 = s0 + o.durationMin;
    if (s0 >= groupEnd && group.length) { const n = Math.max(...group.map((g) => g.lane)) + 1; for (const g of group) g.of = n; out.push(...group); group = []; ends.length = 0; }
    let lane = ends.findIndex((e) => e <= s0);
    if (lane < 0) { lane = ends.length; ends.push(e0); } else ends[lane] = e0;
    group.push({ o, lane, of: 1 });
    groupEnd = Math.max(groupEnd, e0);
  }
  if (group.length) { const n = Math.max(...group.map((g) => g.lane)) + 1; for (const g of group) g.of = n; out.push(...group); }
  return out;
}

function pos(o: Occurrence): React.CSSProperties {
  const s = Math.max(FROM, toMin(o.start!));
  return { top: (s - FROM) * PX, height: Math.max(22, o.durationMin * PX - 2) };
}

function MonthView({ anchor, visible, onPick }: { anchor: string; visible: (t: Task) => boolean; onPick: (day: string) => void }) {
  const d = useData();
  const a = parse(anchor);
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const n = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const weeks = [...new Set(Array.from({ length: n }, (_, i) => weekStart(iso(new Date(a.getFullYear(), a.getMonth(), i + 1)))))];
  const occ = weeks.flatMap((w) => occurrencesForWeek(d.tasks, w)).filter((o) => visible(o.task) && o.task.status !== 'adiada');
  return (
    <div className="heat">
      {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x, i) => <span key={i} className="hd">{x}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
      {Array.from({ length: n }, (_, i) => {
        const day = iso(new Date(a.getFullYear(), a.getMonth(), i + 1));
        const m = occ.filter((o) => o.date === day).reduce((s, o) => s + o.durationMin, 0);
        return (
          <button key={day} type="button" className="hc" onClick={() => onPick(day)} aria-label={`${ddmm(day)}: ${dur(m) || '0h'} de estudo`}
            style={{ background: m ? `color-mix(in srgb, var(--accent) ${Math.min(90, 20 + m / 3)}%, #1a2140)` : 'var(--panel-2)' }}>
            {i + 1}{m ? <small style={{ marginLeft: 'auto' }}>{dur(m)}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

/** novo bloco de estudo (ou editar): vira um evento da Agenda com a trilha */
function BlockForm({ b, onDone }: { b: Partial<Task>; onDone: (msg?: string) => void }) {
  const d = useData();
  const prefs = studyPrefs(d.settings);
  const [f, setF] = useState<Partial<Task>>({ remindMin: prefs.blockStart ? prefs.remindMin : undefined, ...b });
  const set = (p: Partial<Task>) => setF((o) => ({ ...o, ...p }));
  const subs = d.subjects.filter((s) => s.trackId === f.trackId);
  const tracks = d.tracks.filter((t) => t.status !== 'concluida');
  async function save(e: FormEvent) {
    e.preventDefault();
    const tr = tracks.find((t) => t.id === f.trackId);
    if (!tr) return;
    const sub = subs.find((s) => s.id === f.subjectId);
    if (f.remindMin) askNotify();
    await db.tasks.add({
      title: (f.title?.trim() || sub?.name || tr.title), area: 'academica', status: 'afazer', priority: 'media',
      date: f.date, start: f.start, durationMin: f.durationMin ?? 60, trackId: tr.id, subjectId: f.subjectId, remindMin: f.remindMin || undefined,
    });
    onDone(`Bloco de estudo marcado para ${ddmm(f.date!)} às ${f.start}. Ele também aparece na Agenda.`);
  }
  if (!tracks.length) return <Empty>Crie uma trilha em Acadêmica primeiro.</Empty>;
  return (
    <form className="form" onSubmit={save}>
      <div className="cols">
        <label className="field"><span>Trilha</span>
          <select value={f.trackId ?? ''} onChange={(e) => set({ trackId: Number(e.target.value), subjectId: undefined })}>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
        <label className="field"><span>Matéria / módulo</span>
          <select value={f.subjectId ?? ''} onChange={(e) => set({ subjectId: e.target.value ? Number(e.target.value) : undefined })} disabled={!subs.length}>
            <option value="">—</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>O que estudar (opcional)</span><input value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="ex.: Normalização, lista 3" /></label>
      <div className="cols" style={{ '--c': 3 } as React.CSSProperties}>
        <label className="field"><span>Dia</span><input type="date" required value={f.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="field"><span>Início</span><input type="time" required value={f.start ?? ''} onChange={(e) => set({ start: e.target.value })} /></label>
        <label className="field"><span>Duração (min)</span><input inputMode="numeric" value={f.durationMin ?? 60} onChange={(e) => set({ durationMin: Number(e.target.value) || 60 })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={!!f.remindMin} onChange={(e) => set({ remindMin: e.target.checked ? prefs.remindMin : undefined })} /> Avisar {prefs.remindMin} min antes</label>
      <div className="actions"><button className="btn gold">Marcar bloco</button><button type="button" className="btn out" onClick={() => onDone()}>Cancelar</button></div>
    </form>
  );
}

/** Alarmes e alertas (§7): ficam nas configurações da conta */
export function Alarms() {
  const d = useData();
  const p = studyPrefs(d.settings);
  const set = (patch: Partial<typeof p>) => { if (Object.values(patch).some(Boolean)) askNotify(); return db.settings.update('me', { study: { ...d.settings.study, ...patch } }); };
  const rows: [keyof typeof p, string, string][] = [
    ['blockStart', 'Início de cada bloco', `${p.remindMin} min antes · notificação`],
    ['review', 'Revisão espaçada', 'automática: 24h, 7 dias, 30 dias'],
    ['pomodoro', 'Pomodoro', `${p.focusMin} min foco / ${p.breakMin} pausa`],
    ['nightly', 'Resumo da noite', '22:00 · o que ficou para amanhã'],
    ['deadlines', 'Prazos do edital', '7d, 1d e 3h antes · notificação'],
    ['quiet', 'Silenciar no trabalho', 'seg–sex 09–16, só urgentes'],
  ];
  return (
    <Card title="Alarmes e alertas" expandable={false}>
      <div className="list">
        {rows.map(([k, title, sub]) => (
          <label key={k} className="toggle-row">
            <span><b>{title}</b><small>{sub}</small></span>
            <input type="checkbox" role="switch" className="switch" checked={!!p[k]} onChange={(e) => void set({ [k]: e.target.checked })} aria-label={title} />
          </label>
        ))}
        {p.pomodoro && (
          <div className="cols">
            <label className="field"><span>Foco (min)</span><input inputMode="numeric" value={p.focusMin} onChange={(e) => void set({ focusMin: Number(e.target.value) || 50 })} /></label>
            <label className="field"><span>Pausa (min)</span><input inputMode="numeric" value={p.breakMin} onChange={(e) => void set({ breakMin: Number(e.target.value) || 10 })} /></label>
          </div>
        )}
        <p className="hint" style={{ margin: 0 }}>Os avisos aparecem com o app aberto (e como notificação, se você permitir). Avisos com o app fechado e por e-mail precisam de um servidor, que o Cume° ainda não tem.</p>
      </div>
    </Card>
  );
}
