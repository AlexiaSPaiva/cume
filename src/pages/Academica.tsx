import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { StudyTimer } from '../components/StudyTimer';
import { Bar, Empty, Icon, Modal, Stat, Stats } from '../components/ui';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { ddmm, diffDays, dur, relDays, today, weekStart } from '../lib/dates';
import { nextDate, RESEARCH_STAGES, reviewsToday, studyMinutesWeek, studyToday, trackSummary, TRACK_TYPES, TYPE } from '../lib/study';
import type { Task, Track, TrackType } from '../lib/types';

const FILTERS: [string, string, TrackType[]][] = [
  ['todas', 'Todas', []], ['degree', 'Graduação', ['degree']], ['course', 'Cursos', ['course']],
  ['research', 'Extensão e pesquisa', ['extension', 'research']], ['exam', 'Concursos', ['exam']], ['language', 'Idiomas', ['language']],
];

/** /area/academica: tudo o que se estuda, organizado em trilhas (v7, §5) */
export function Academica() {
  const d = useData();
  const ui = useUI();
  const nav = useNavigate();
  const [filter, setFilter] = useState('todas');
  const [editing, setEditing] = useState<Partial<Track> | null>(null);
  const [studying, setStudying] = useState<{ track: Track; block?: Task } | null>(null);
  const t0 = today();
  const ws = weekStart(t0);
  const active = d.tracks.filter((t) => t.status !== 'concluida');
  const types = FILTERS.find(([k]) => k === filter)![2];
  const list = d.tracks.filter((t) => !types.length || types.includes(t.type))
    .sort((a, b) => (a.status === 'concluida' ? 1 : 0) - (b.status === 'concluida' ? 1 : 0) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  const done = studyMinutesWeek(d, ws, undefined, true);
  const planned = Math.max(studyMinutesWeek(d, ws), active.reduce((s, t) => s + (t.hoursPerWeek ?? 0) * 60, 0));
  const nexts = active.map((t) => ({ t, n: nextDate(d, t) })).filter((x) => x.n).sort((a, b) => a.n!.date.localeCompare(b.n!.date));
  const exams = [
    ...active.filter((t) => t.examDate && t.examDate >= t0).map((t) => ({ date: t.examDate!, label: t.title })),
    ...d.trackDates.filter((x) => x.kind === 'prova' && x.date >= t0).map((x) => ({ date: x.date, label: `${d.tracks.find((t) => t.id === x.trackId)?.title ?? ''} · ${x.label}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const kinds = [...new Set(active.map((t) => TYPE[t.type].plural.toLowerCase()))];
  const todayBlocks = studyToday(d, t0);
  const trackOf = (id?: number) => d.tracks.find((t) => t.id === id);

  return (
    <Page title="Acadêmica" sub="Tudo o que você estuda, organizado em trilhas: cada uma com plano, metas, cronograma, prazos, arquivos e notas."
      crumbs={[{ to: '/', label: 'Início' }, { label: 'Acadêmica' }]}>
      <Stats>
        <Stat k="Trilhas ativas" v={active.length} s={kinds.join(', ') || 'crie a primeira'} />
        <Stat k="Estudo na semana" v={dur(done) || '0h'} s={`de ${dur(planned) || '0h'} planejadas`} />
        <Stat k="Revisões hoje" v={reviewsToday(d, t0)} s="repetição espaçada" />
        <Stat k="Próximo prazo" v={nexts[0] ? ddmm(nexts[0].n!.date) : '—'} s={nexts[0] ? `${nexts[0].n!.label} · ${relDays(nexts[0].n!.date)}` : 'nenhum'} />
        <Stat k="Próxima prova" v={exams[0] ? `${diffDays(exams[0].date, t0)} dias` : '—'} s={exams[0] ? `${exams[0].label} · ${ddmm(exams[0].date)}` : 'nenhuma marcada'} />
      </Stats>

      <div className="grid g3">
        <div className="span2 list" style={{ gap: 14 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="seg scroll-x" role="radiogroup" aria-label="Tipo de trilha">
              {FILTERS.map(([k, l]) => <button key={k} role="radio" aria-checked={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
            <button className="btn gold" style={{ marginLeft: 'auto' }} onClick={() => setEditing({ type: 'course', status: 'ativa' })}>+ Nova trilha</button>
          </div>
          <div className="tracks">
            {list.map((t) => {
              const s = trackSummary(d, t);
              const c = TYPE[t.type].color;
              return (
                <article key={t.id} className={`track ${t.status !== 'ativa' ? 'off' : ''}`} style={{ '--c': c } as React.CSSProperties}>
                  <div className="row"><span className="track-type">{TYPE[t.type].label}</span>{t.status !== 'ativa' && <span className="tag">{t.status === 'pausada' ? 'pausada' : 'concluída'}</span>}</div>
                  <h3><Link to={`/area/academica/trilha/${t.id}`}>{t.title}</Link></h3>
                  <div className="small">{s.metric}</div>
                  <div className="muted small">{s.detail}</div>
                  <Bar pct={s.progress} color={c} />
                  <div className="row small muted" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <span>{t.hoursPerWeek ? `${t.hoursPerWeek}h/sem` : 'sem meta semanal'}</span>
                    <span>{s.next ? `${s.next.label} ${ddmm(s.next.date)}` : 'sem prazo'}</span>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn sm out" onClick={() => nav(`/area/academica/trilha/${t.id}`)}>Abrir</button>
                    <button className="btn sm out" onClick={() => setStudying({ track: t })}>▶ Estudar agora</button>
                  </div>
                </article>
              );
            })}
          </div>
          {list.length === 0 && (
            <Card title="Sua primeira trilha" expandable={false}>
              <Empty action={{ label: '+ Nova trilha', run: () => setEditing({ type: 'course', status: 'ativa' }) }}>
                Uma trilha é tudo o que você estuda com um fim: a graduação, um curso, uma pesquisa, um concurso, um idioma.
              </Empty>
            </Card>
          )}
        </div>

        <div className="list" style={{ gap: 16 }}>
          <Card title="Hoje no estudo">
            <div className="list">
              {todayBlocks.map((b) => (
                <div key={b.id} className="row small">
                  <b style={{ width: '3rem' }}>{b.start ?? '—'}</b>
                  <span className="dotc" style={{ background: TYPE[trackOf(b.trackId)?.type ?? 'course'].color }} />
                  <button type="button" className="plain grow" onClick={() => ui.openTask(b)}>{b.title}</button>
                  {b.remindMin ? <span title={`aviso ${b.remindMin} min antes`}><Icon name="bell" size={14} /></span> : null}
                  {b.status !== 'concluido' && trackOf(b.trackId) && <button className="btn sm ghost" onClick={() => setStudying({ track: trackOf(b.trackId)!, block: b })} aria-label={`Estudar ${b.title}`}>▶</button>}
                  {b.status === 'concluido' && <span className="tag ok">feito</span>}
                </div>
              ))}
              {todayBlocks.length === 0 && <Empty>Nenhum bloco de estudo hoje.</Empty>}
              <Link to="/area/academica/cronograma?foco=1" className="btn out" style={{ justifyContent: 'center' }}>Abrir planejamento de estudos ›</Link>
            </div>
          </Card>
          <Card title="Como uma trilha funciona" expandable={false}>
            <p className="small" style={{ margin: 0 }}><b style={{ color: 'var(--accent)' }}>Trilha</b> → Plano (matérias, módulos ou etapas) → Metas → Cronograma → Sessões → Desempenho.</p>
            <p className="muted small">O tipo escolhido liga as abas certas: Concurso ganha Edital, Simulados e Necessidade por matéria; Pesquisa ganha Artigos e Diário; Curso ganha Módulos e Certificado; Graduação ganha Disciplinas, Provas e Notas.</p>
          </Card>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Editar trilha' : 'Nova trilha'} onClose={() => setEditing(null)}>
          <TrackForm t={editing} onDone={(id) => { setEditing(null); if (id && !editing.id) nav(`/area/academica/trilha/${id}`); }} />
        </Modal>
      )}
      {studying && (
        <Modal title={`Estudar · ${studying.track.title}`} onClose={() => setStudying(null)}>
          <StudyTimer track={studying.track} block={studying.block} onDone={(m) => { setStudying(null); if (m) ui.toast(m); }} />
        </Modal>
      )}
    </Page>
  );
}

/** criar/editar trilha: o tipo define os campos e as abas */
export function TrackForm({ t, onDone }: { t: Partial<Track>; onDone: (id?: number) => void }) {
  const [f, setF] = useState<Partial<Track>>({ status: 'ativa', type: 'course', ...t });
  const set = (p: Partial<Track>) => setF((o) => ({ ...o, ...p }));
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.title?.trim()) return;
    const rec = { ...f, title: f.title.trim() } as Track;
    if (rec.type === 'exam' && rec.showInCalendar == null) rec.showInCalendar = true;
    if (rec.id) { await db.tracks.put(rec); onDone(rec.id); }
    else onDone((await db.tracks.add(rec)) as number);
  }
  return (
    <form className="form" onSubmit={save}>
      <div className="field"><span>Tipo</span>
        <div className="chips" role="radiogroup" aria-label="Tipo da trilha">
          {TRACK_TYPES.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={f.type === x.id} className={`chip ${f.type === x.id ? 'on' : ''}`} onClick={() => set({ type: x.id })}>{x.label}</button>
          ))}
        </div>
      </div>
      <label className="field"><span>Nome da trilha</span>
        <input autoFocus required value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })}
          placeholder={f.type === 'exam' ? 'Prefeitura do Rio · Analista' : f.type === 'research' ? 'Iniciação científica · grupo de pesquisa' : f.type === 'degree' ? 'Graduação em ADS' : 'Python para Dados'} />
      </label>
      <div className="cols">
        <label className="field"><span>{f.type === 'exam' ? 'Banca' : f.type === 'research' ? 'Orientação' : 'Instituição'} (opcional)</span><input value={f.org ?? ''} onChange={(e) => set({ org: e.target.value || undefined })} /></label>
        <label className="field"><span>Horas por semana</span><input inputMode="decimal" value={f.hoursPerWeek ?? ''} onChange={(e) => set({ hoursPerWeek: num(e.target.value) })} placeholder="3" /></label>
      </div>
      {f.type === 'exam' && (
        <div className="cols" style={{ '--c': 3 } as React.CSSProperties}>
          <label className="field"><span>Data da prova</span><input type="date" value={f.examDate ?? ''} onChange={(e) => set({ examDate: e.target.value || undefined })} /></label>
          <label className="field"><span>Horário</span><input type="time" value={f.examTime ?? ''} onChange={(e) => set({ examTime: e.target.value || undefined })} /></label>
          <label className="field"><span>Meta de acertos (%)</span><input inputMode="numeric" value={f.targetAccuracy ?? ''} onChange={(e) => set({ targetAccuracy: num(e.target.value) })} placeholder="75" /></label>
        </div>
      )}
      {f.type === 'degree' && (
        <label className="field"><span>Meta de média / CR</span><input inputMode="decimal" value={f.targetGrade ?? ''} onChange={(e) => set({ targetGrade: num(e.target.value) })} placeholder="8" /></label>
      )}
      {f.type === 'research' && (
        <label className="field"><span>Etapa atual</span>
          <select value={f.stage ?? 1} onChange={(e) => set({ stage: Number(e.target.value) })}>
            {RESEARCH_STAGES.map((s, i) => <option key={s} value={i + 1}>{i + 1}. {s}</option>)}
          </select>
        </label>
      )}
      {f.type !== 'exam' && (
        <div className="cols">
          <label className="field"><span>Próximo prazo</span><input type="date" value={f.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || undefined })} /></label>
          <label className="field"><span>O que é</span><input value={f.deadlineLabel ?? ''} onChange={(e) => set({ deadlineLabel: e.target.value || undefined })} placeholder="entrega, projeto final…" /></label>
        </div>
      )}
      {f.id && (
        <label className="field"><span>Situação</span>
          <select value={f.status} onChange={(e) => set({ status: e.target.value as Track['status'] })}>
            <option value="ativa">ativa</option><option value="pausada">pausada</option><option value="concluida">concluída</option>
          </select>
        </label>
      )}
      <div className="actions"><button className="btn gold">{f.id ? 'Salvar' : 'Criar trilha'}</button><button type="button" className="btn out" onClick={() => onDone()}>Cancelar</button></div>
    </form>
  );
}
