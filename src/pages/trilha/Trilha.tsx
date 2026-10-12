import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QuickLinks } from '../../components/AttachmentDrop';
import { Card } from '../../components/Card';
import { ItemMenu } from '../../components/ItemMenu';
import { Page } from '../../components/Layout';
import { useUI } from '../../components/Overlays';
import { StudyTimer } from '../../components/StudyTimer';
import { Bar, Empty, Modal, Stat, Stats } from '../../components/ui';
import { useData } from '../../lib/data';
import { db } from '../../lib/db';
import { addDays, ddmm, dur, relDays, today, weekStart } from '../../lib/dates';
import { studyMinutesWeek, trackSummary, TRACK_TABS, TYPE } from '../../lib/study';
import type { Task, Track } from '../../lib/types';
import { occurrencesForWeek } from '../../lib/week';
import { TrackForm } from '../Academica';
import { Cronograma } from '../Cronograma';
import { ConcursoDocumentos, ConcursoEdital, ConcursoMaterias, ConcursoSimulados, ConcursoVisao } from './Concurso';
import { Certificado, Modulos, Provas, Notas } from './Modulos';
import { PesquisaArquivos, PesquisaArtigos, PesquisaDiario, PesquisaVisao } from './Pesquisa';

const SUB: Record<Track['type'], string> = {
  exam: 'Visão macro e micro do seu desempenho neste concurso.',
  research: 'Artigos, arquivos e o seu diário de progresso.',
  course: 'Módulos, cronograma e certificado.',
  degree: 'Disciplinas, provas e notas.',
  extension: 'Atividades, cronograma e arquivos.',
  language: 'Níveis, cronograma e certificado.',
};

/** /area/academica/trilha/:id?aba=… (abas pelo tipo da trilha, v7 §5) */
export function Trilha() {
  const { id } = useParams();
  const d = useData();
  const ui = useUI();
  const nav = useNavigate();
  const [q, setQ] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [studying, setStudying] = useState<Task | true | null>(null);
  const t = d.tracks.find((x) => x.id === Number(id));
  if (!t) return <Navigate to="/area/academica" replace />;
  const tabs = TRACK_TABS[t.type];
  const tab = tabs.find(([k]) => k === q.get('aba'))?.[0] ?? 'visao';
  const label = tabs.find(([k]) => k === tab)![1];
  const go = (k: string) => setQ(k === 'visao' ? {} : { aba: k });
  const study = (b?: Task) => setStudying(b ?? true);

  const sub = t.type === 'exam' && t.examDate ? `${SUB.exam} Prova em ${ddmm(t.examDate)}${t.examTime ? ` às ${t.examTime}` : ''}.` : SUB[t.type];

  return (
    <Page title={tab === 'edital' ? 'Edital e documentos' : t.title} sub={tab === 'edital' ? 'Só as datas e os arquivos deste concurso, sem misturar com o resto da sua vida.' : sub}
      crumbs={[{ to: '/', label: 'Início' }, { to: '/area/academica', label: 'Acadêmica' }, ...(tab === 'visao' ? [{ label: t.title }] : [{ to: `/area/academica/trilha/${t.id}`, label: t.title }, { label }])]}>
      <nav className="fin-tabs" aria-label="Abas da trilha">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" className={`tab-btn ${k === tab ? 'on' : ''}`} aria-current={k === tab ? 'page' : undefined} onClick={() => go(k)}>{l}</button>
        ))}
        <span className="fin-note row" style={{ gap: 6 }}>
          <span className="tag" style={{ color: TYPE[t.type].color }}>{TYPE[t.type].label}</span>
          {t.org && <span className="tag">{t.org}</span>}
          <ItemMenu label={t.title} actions={{
            edit: () => setEditing(true),
            delete: () => { nav('/area/academica'); void ui.remove('tracks', t.id!, `Trilha “${t.title}”`); },
          }} />
        </span>
      </nav>

      {tab === 'visao' && (t.type === 'exam' ? <ConcursoVisao t={t} onStudy={study} /> : t.type === 'research' ? <PesquisaVisao t={t} /> : <VisaoGeral t={t} onStudy={study} />)}
      {tab === 'materias' && <ConcursoMaterias t={t} onStudy={study} />}
      {tab === 'edital' && <ConcursoEdital t={t} />}
      {tab === 'documentos' && <ConcursoDocumentos t={t} />}
      {tab === 'simulados' && <ConcursoSimulados t={t} />}
      {tab === 'cronograma' && <Cronograma trackId={t.id} embedded />}
      {tab === 'artigos' && <PesquisaArtigos t={t} />}
      {tab === 'arquivos' && <PesquisaArquivos t={t} />}
      {tab === 'diario' && <PesquisaDiario t={t} />}
      {(tab === 'modulos' || tab === 'disciplinas') && <Modulos t={t} />}
      {tab === 'certificado' && <Certificado t={t} />}
      {tab === 'provas' && <Provas t={t} />}
      {tab === 'notas' && <Notas t={t} />}

      {editing && <Modal title="Editar trilha" onClose={() => setEditing(false)}><TrackForm t={t} onDone={() => setEditing(false)} /></Modal>}
      {studying && (
        <Modal title={`Estudar · ${t.title}`} onClose={() => setStudying(null)}>
          <StudyTimer track={t} block={studying === true ? undefined : studying} onDone={(m) => { setStudying(null); if (m) ui.toast(m); }} />
        </Modal>
      )}
    </Page>
  );
}

/** visão geral (curso, graduação, idioma, extensão) */
function VisaoGeral({ t, onStudy }: { t: Track; onStudy: (b?: Task) => void }) {
  const d = useData();
  const ui = useUI();
  const s = trackSummary(d, t);
  const ws = weekStart(today());
  const done = studyMinutesWeek(d, ws, t.id, true);
  const planned = Math.max(studyMinutesWeek(d, ws, t.id), (t.hoursPerWeek ?? 0) * 60);
  const next7 = [0, 1].flatMap((w) => occurrencesForWeek(d.tasks, addDays(ws, 7 * w)))
    .filter((o) => o.task.trackId === t.id && o.date >= today() && o.date <= addDays(today(), 7) && o.task.status !== 'adiada' && o.task.status !== 'concluido')
    .sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')));
  const dates = d.trackDates.filter((x) => x.trackId === t.id && (x.dateEnd ?? x.date) >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const month = today().slice(0, 7);
  const sessions = d.tasks.filter((x) => x.trackId === t.id && x.status === 'concluido' && (x.doneAt ?? '').slice(0, 7) === month);
  const [note, setNote] = useState(t.note ?? '');

  return (
    <>
      <Stats>
        <Stat k="Progresso" v={`${s.progress}%`} s={s.metric} />
        <Stat k="Estudo na semana" v={dur(done) || '0h'} s={`de ${dur(planned) || '0h'} planejadas`} />
        <Stat k="Próximo prazo" v={s.next ? ddmm(s.next.date) : '—'} s={s.next ? `${s.next.label} · ${relDays(s.next.date)}` : 'nenhum'} />
        <Stat k="Sessões no mês" v={sessions.length} s={dur(sessions.reduce((a, x) => a + (x.durationMin ?? 0), 0)) || '0h'} />
        <Stat k="Situação" v={t.status === 'ativa' ? 'Ativa' : t.status === 'pausada' ? 'Pausada' : 'Concluída'} s={s.detail} />
      </Stats>
      <div className="grid g3">
        <Card title="Próximas sessões">
          <div className="list">
            {next7.map((o) => (
              <div key={`${o.task.id}${o.date}`} className="row small">
                <b style={{ width: '6.5rem' }}>{ddmm(o.date)} {o.start}</b>
                <button type="button" className="plain grow" onClick={() => ui.openTask(o.task)}>{o.task.title}</button>
                <button type="button" className="btn sm ghost" onClick={() => onStudy(o.task)} aria-label={`Estudar ${o.task.title}`}>▶</button>
              </div>
            ))}
            {next7.length === 0 && <Empty action={{ label: '▶ Estudar agora', run: () => onStudy() }}>Nenhuma sessão nos próximos 7 dias. Marque no Cronograma ou estude agora.</Empty>}
          </div>
        </Card>
        <Card title="Progresso">
          <div className="list">
            <div className="small">{s.metric}</div>
            <Bar pct={s.progress} color={TYPE[t.type].color} />
            <div className="muted small">{s.detail}</div>
            <DatesList t={t} dates={dates} />
          </div>
        </Card>
        <Card title="Notas da trilha">
          <textarea className="input" rows={6} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => db.tracks.update(t.id!, { note })}
            placeholder="O que você quer lembrar sobre esta trilha" aria-label="Notas da trilha" />
          <p className="hint" style={{ margin: '6px 0 0' }}>Salva ao sair do campo.</p>
        </Card>
      </div>
      <Card title="Links da trilha" wide>
        <QuickLinks owner={{ type: 'track', id: t.id! }} kinds={['link']} empty="Guarde aqui os sites que você usa nesta trilha (aulas, questões, vídeos, pastas). Um toque e abre." />
      </Card>
    </>
  );
}

/** datas da trilha (prazos, provas, entregas): lista simples com "+ data" */
export function DatesList({ t, dates, kind = 'entrega' }: { t: Track; dates: { id?: number; date: string; label: string }[]; kind?: 'entrega' | 'prova' | 'edital' }) {
  const ui = useUI();
  const [f, setF] = useState({ label: '', date: '' });
  return (
    <div className="list" style={{ gap: 6 }}>
      {dates.map((x) => (
        <div key={x.id} className="row small">
          <b style={{ width: '3.5rem' }}>{ddmm(x.date)}</b><span className="grow">{x.label}</span><span className="muted">{relDays(x.date)}</span>
          {x.id && <ItemMenu label={x.label} actions={{ delete: () => void ui.remove('trackDates', x.id!, `Data “${x.label}”`) }} />}
        </div>
      ))}
      <form className="row" style={{ gap: 6, flexWrap: 'wrap' }} onSubmit={async (e) => {
        e.preventDefault();
        if (!f.label.trim() || !f.date) return;
        await db.trackDates.add({ trackId: t.id!, label: f.label.trim(), date: f.date, kind });
        setF({ label: '', date: '' });
      }}>
        <input className="input" style={{ flex: '1 1 8rem' }} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={kind === 'prova' ? 'Prova de Cálculo' : 'Entrega, prova, prazo…'} aria-label="O que é" />
        <input className="input" style={{ width: 'auto' }} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Data" />
        <button className="btn sm out">+ data</button>
      </form>
    </div>
  );
}
