import { useState, type FormEvent } from 'react';
import { AttachmentDrop, AttachmentList } from '../../components/AttachmentDrop';
import { Card } from '../../components/Card';
import { ItemMenu } from '../../components/ItemMenu';
import { useUI } from '../../components/Overlays';
import { Bar, Empty, Modal, Stat, Stats } from '../../components/ui';
import { useData } from '../../lib/data';
import { db } from '../../lib/db';
import { ddmm, diffDays, dur, DOW_SHORT, iso, MONTHS, parse, relDays, today } from '../../lib/dates';
import { accuracy, coverage, EXAM_STEPS, necessity, necessityLevel, planByNecessity, subjectMinutes, TYPE } from '../../lib/study';
import type { Attachment, Subject, Task, TopicStatus, Track, TrackDate } from '../../lib/types';

const TOPIC_LABEL: Record<TopicStatus, [string, string]> = {
  todo: ['a estudar', 'warn'], studying: ['estudando', 'imp'], studied: ['estudado', 'info'], reviewed: ['revisado', 'ok'],
};
const NEXT: Record<TopicStatus, TopicStatus> = { todo: 'studying', studying: 'studied', studied: 'reviewed', reviewed: 'todo' };
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

/* =============================== Visão geral =============================== */

export function ConcursoVisao({ t, onStudy }: { t: Track; onStudy: (b?: Task) => void }) {
  const d = useData();
  const ui = useUI();
  const subs = d.subjects.filter((s) => s.trackId === t.id);
  const meta = t.targetAccuracy ?? 75;
  const ranked = subs.map((s) => ({ s, n: necessity(d, s, meta) })).sort((a, b) => b.n - a.n);
  const [sel, setSel] = useState<number | undefined>(ranked[0]?.s.id);
  const [modal, setModal] = useState<'questoes' | 'simulado' | 'materia' | null>(null);
  const allTopics = d.topics.filter((x) => subs.some((s) => s.id === x.subjectId));
  const coveredN = allTopics.filter((x) => x.status === 'studied' || x.status === 'reviewed').length;
  const logs = d.questionLogs.filter((q) => subs.some((s) => s.id === q.subjectId)).sort((a, b) => a.date.localeCompare(b.date));
  const tot = logs.reduce((a, q) => a + q.total, 0);
  const acc = tot ? Math.round((logs.reduce((a, q) => a + q.correct, 0) / tot) * 100) : null;
  const prevLogs = logs.slice(0, -5), prevTot = prevLogs.reduce((a, q) => a + q.total, 0);
  const prevAcc = prevTot ? Math.round((prevLogs.reduce((a, q) => a + q.correct, 0) / prevTot) * 100) : null;
  const studied = d.tasks.filter((x) => x.trackId === t.id && (x.status === 'concluido' || (x.date ?? '9') < today())).reduce((a, x) => a + (x.durationMin ?? 0), 0);
  const weeksLeft = t.examDate ? Math.max(0, diffDays(t.examDate, today()) / 7) : 0;
  const weeksSince = Math.max(0, diffDays(today(), (t.createdAt ?? today()).slice(0, 10)) / 7);
  const plannedTotal = Math.round((t.hoursPerWeek ?? 0) * 60 * (weeksSince + weeksLeft));
  const onPace = Math.round((t.hoursPerWeek ?? 0) * 60 * weeksSince);
  const top = ranked[0];

  async function generate() {
    const blocks = planByNecessity(d, t);
    if (!blocks.length) return ui.toast('Cadastre as matérias para gerar o cronograma.');
    await db.tasks.bulkAdd(blocks);
    ui.toast(`${blocks.length} blocos criados nos próximos 7 dias, pela necessidade. Veja e ajuste no Cronograma.`);
  }

  return (
    <>
      <Stats>
        <Stat k="Prova em" v={t.examDate ? `${Math.max(0, diffDays(t.examDate, today()))} dias` : '—'} s={t.examDate ? `${DOW_SHORT[parse(t.examDate).getDay()].toLowerCase()}, ${ddmm(t.examDate)}${t.examTime ? ` · ${t.examTime}` : ''}` : 'defina a data na trilha'} />
        <Stat k="Edital coberto" v={allTopics.length ? `${Math.round((coveredN / allTopics.length) * 100)}%` : '—'} s={`${coveredN} de ${allTopics.length} tópicos`} />
        <Stat k="Acertos médios" v={<>{pct(acc)}{acc != null && prevAcc != null && acc !== prevAcc && <small className={`delta ${acc > prevAcc ? 'up' : 'down'}`}>{acc > prevAcc ? '▲' : '▼'} {Math.abs(acc - prevAcc)}</small>}</>}
          s={`meta ${meta}% · ${tot} questões`} />
        <Stat k="Horas estudadas" v={dur(studied) || '0h'} s={plannedTotal ? `de ${dur(plannedTotal)} · no ritmo: ${dur(onPace) || '0h'}` : 'defina as horas por semana'} />
        <Stat k="Maior necessidade" v={top && top.n > 0 ? top.s.name : '—'} s={top ? `peso ${top.s.weight ?? 1} · ${pct(accuracy(d, top.s.id!))} de acertos` : 'cadastre as matérias'} />
      </Stats>
      <div className="grid g3">
        <Card title="Matérias · visão macro" className="span2" wide act={<span className="small muted">ordenado por necessidade</span>}>
          <MacroTable t={t} ranked={ranked} sel={sel} onSel={setSel} />
          <p className="note small" style={{ marginTop: 12 }}>Necessidade = peso da matéria × distância até a meta de acertos × parte do edital que falta. <b>Gerar cronograma</b> distribui as horas livres por esse ranking; depois dá para mover qualquer bloco.</p>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn gold" onClick={() => void generate()}>Gerar cronograma pela necessidade</button>
            <button className="btn out" onClick={() => setModal('questoes')}>+ Lançar questões</button>
            <button className="btn out" onClick={() => setModal('simulado')}>+ Simulado</button>
            <button className="btn ghost" onClick={() => setModal('materia')}>+ Matéria</button>
          </div>
        </Card>
        {sel != null && subs.find((s) => s.id === sel) ? <Micro s={subs.find((s) => s.id === sel)!} t={t} onStudy={onStudy} />
          : <Card title="Visão micro"><Empty action={{ label: '+ Matéria', run: () => setModal('materia') }}>Cadastre as matérias do edital para ver o detalhe de cada uma.</Empty></Card>}
      </div>
      {modal === 'questoes' && <Modal title="Lançar questões" onClose={() => setModal(null)}><QuestionsForm t={t} subjectId={sel} onDone={() => setModal(null)} /></Modal>}
      {modal === 'simulado' && <Modal title="Simulado" onClose={() => setModal(null)}><MockForm t={t} onDone={() => setModal(null)} /></Modal>}
      {modal === 'materia' && <Modal title="Nova matéria" onClose={() => setModal(null)}><SubjectForm t={t} onDone={(id) => { setModal(null); if (id) setSel(id); }} /></Modal>}
    </>
  );
}

function MacroTable({ t, ranked, sel, onSel }: { t: Track; ranked: { s: Subject; n: number }[]; sel?: number; onSel: (id: number) => void }) {
  const d = useData();
  const max = Math.max(...ranked.map((x) => x.n), 0);
  if (!ranked.length) return <Empty>Nenhuma matéria ainda.</Empty>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table cards">
        <thead><tr><th>Matéria</th><th>Questões · peso</th><th className="hide-m">Edital</th><th>Acertos</th><th>Necessidade</th><th>Horas</th></tr></thead>
        <tbody>
          {ranked.map(({ s, n }) => {
            const c = coverage(d, s.id!);
            const a = accuracy(d, s.id!);
            const lv = necessityLevel(n, max);
            return (
              <tr key={s.id} className={s.id === sel ? 'sel' : ''}>
                <td className="primary"><button type="button" className="plain" onClick={() => onSel(s.id!)}><b>{s.name}</b></button></td>
                <td data-label="Questões · peso">{s.questionsCount ?? '—'} · {s.weight ?? 1}</td>
                <td className="hide-m"><div className="row small" style={{ gap: 6 }}><div style={{ flex: 1, minWidth: 70 }}><Bar pct={c.pct * 100} color={TYPE.exam.color} /></div><span className="muted">{c.done}/{c.total}</span></div></td>
                <td data-label="Acertos"><b style={{ color: a == null ? undefined : a >= (s.targetAccuracy ?? t.targetAccuracy ?? 75) ? 'var(--ok)' : 'var(--accent)' }}>{pct(a)}</b></td>
                <td data-label="Necessidade"><span className={`tag ${lv === 'alta' ? 'bad' : lv === 'media' ? 'warn' : 'ok'}`}>{lv === 'media' ? 'média' : lv}</span></td>
                <td data-label="Horas">{dur(subjectMinutes(d, s.id!)) || '0h'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Micro({ s, t, onStudy }: { s: Subject; t: Track; onStudy: (b?: Task) => void }) {
  const d = useData();
  const topics = d.topics.filter((x) => x.subjectId === s.id);
  const c = coverage(d, s.id!);
  const logs = d.questionLogs.filter((q) => q.subjectId === s.id).sort((a, b) => a.date.localeCompare(b.date)).slice(-6);
  const meta = s.targetAccuracy ?? t.targetAccuracy ?? 75;
  const nextRev = topics.map((x) => x.nextReviewAt).filter(Boolean).sort()[0];
  const W = 260, H = 70;
  const pts = logs.map((q, i) => `${logs.length > 1 ? (i * W) / (logs.length - 1) : W / 2},${H - 6 - (q.correct / q.total) * (H - 14)}`).join(' ');
  return (
    <Card title={`Visão micro · ${s.name}`}>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>{c.done} de {c.total} tópicos</span><span>{nextRev ? `próxima revisão: ${relDays(nextRev)}` : ''}</span></div>
      <TopicList s={s} topics={topics} limit={6} />
      <span className="lab-up" style={{ display: 'block', marginTop: 12 }}>Acertos nas últimas {logs.length || 6} sessões</span>
      {logs.length ? (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={logs.map((q) => `${ddmm(q.date)}: ${Math.round((q.correct / q.total) * 100)}%`).join('; ')}>
          <line x1="0" x2={W} y1={H - 6 - (meta / 100) * (H - 14)} y2={H - 6 - (meta / 100) * (H - 14)} stroke="var(--muted)" strokeDasharray="4 4" />
          <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" />
          {pts.split(' ').map((pt, i) => { const [x, y] = pt.split(',').map(Number); return <circle key={i} cx={x} cy={y} r="3.5" fill="var(--accent)" />; })}
        </svg>
      ) : <p className="muted small">Lance questões para ver a evolução.</p>}
      <div className="actions" style={{ marginTop: 8 }}>
        <button className="btn ghost sm" onClick={() => onStudy()}>▶ Estudar agora</button>
      </div>
    </Card>
  );
}

function TopicList({ s, topics, limit }: { s: Subject; topics: { id?: number; name: string; status: TopicStatus; nextReviewAt?: string }[]; limit?: number }) {
  const d = useData();
  const ui = useUI();
  const [name, setName] = useState('');
  const shown = limit ? topics.slice(0, limit) : topics;
  return (
    <div className="list" style={{ gap: 4 }}>
      {shown.map((x) => {
        const logs = d.questionLogs.filter((q) => q.topicId === x.id);
        const tot = logs.reduce((a, q) => a + q.total, 0);
        const a = tot ? Math.round((logs.reduce((s2, q) => s2 + q.correct, 0) / tot) * 100) : null;
        return (
          <div key={x.id} className="row small topic-row">
            <input type="checkbox" checked={x.status === 'studied' || x.status === 'reviewed'} aria-label={`Estudado: ${x.name}`}
              onChange={(e) => db.topics.update(x.id!, { status: e.target.checked ? 'studied' : 'todo' })} />
            <span className="grow">{x.name}</span>
            <button type="button" className={`tag ${TOPIC_LABEL[x.status][1]}`} onClick={() => db.topics.update(x.id!, { status: NEXT[x.status] })} title="tocar muda a situação">{TOPIC_LABEL[x.status][0]}</button>
            <span className="muted" style={{ width: '2.6rem', textAlign: 'right' }}>{a == null ? '—' : `${a}%`}</span>
            {!limit && <ItemMenu label={x.name} actions={{ delete: () => void ui.remove('topics', x.id!, `Tópico “${x.name}”`) }} />}
          </div>
        );
      })}
      {limit && topics.length > limit && <span className="muted small">+ {topics.length - limit} tópicos (aba Matérias)</span>}
      {!limit && (
        <form className="row" style={{ gap: 6 }} onSubmit={async (e) => {
          e.preventDefault();
          const names = name.split(/[\n;]/).map((x) => x.trim()).filter(Boolean);
          if (!names.length) return;
          await db.topics.bulkAdd(names.map((n) => ({ subjectId: s.id!, name: n, status: 'todo' as TopicStatus })));
          setName('');
        }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Novo tópico (separe vários com ;)" aria-label={`Novo tópico de ${s.name}`} />
          <button className="btn sm out">+ tópico</button>
        </form>
      )}
      {topics.length === 0 && limit && <span className="muted small">Sem tópicos ainda: adicione na aba Matérias.</span>}
    </div>
  );
}

/* =============================== Matérias =============================== */

export function ConcursoMaterias({ t, onStudy }: { t: Track; onStudy: (b?: Task) => void }) {
  const d = useData();
  const ui = useUI();
  const subs = d.subjects.filter((s) => s.trackId === t.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  const [edit, setEdit] = useState<Partial<Subject> | null>(null);
  return (
    <>
      <div className="row"><button className="btn gold" style={{ marginLeft: 'auto' }} onClick={() => setEdit({})}>+ Matéria</button></div>
      <div className="grid g2">
        {subs.map((s) => (
          <Card key={s.id} title={s.name} act={<ItemMenu label={s.name} actions={{
            open: { label: '▶ Estudar agora', run: () => onStudy() },
            edit: () => setEdit(s),
            delete: () => void ui.remove('subjects', s.id!, `Matéria “${s.name}”`),
          }} />}>
            <p className="muted small" style={{ margin: '-6px 0 8px' }}>{s.questionsCount ?? '—'} questões · peso {s.weight ?? 1} · meta {s.targetAccuracy ?? t.targetAccuracy ?? 75}% · acertos {pct(accuracy(d, s.id!))}</p>
            <TopicList s={s} topics={d.topics.filter((x) => x.subjectId === s.id)} />
          </Card>
        ))}
      </div>
      {subs.length === 0 && <Card title="Matérias do edital"><Empty action={{ label: '+ Matéria', run: () => setEdit({}) }}>Cadastre cada matéria do edital com o número de questões e o peso.</Empty></Card>}
      {edit && <Modal title={edit.id ? 'Editar matéria' : 'Nova matéria'} onClose={() => setEdit(null)}><SubjectForm t={t} s={edit} onDone={() => setEdit(null)} /></Modal>}
    </>
  );
}

export function SubjectForm({ t, s = {}, onDone, word = 'Matéria' }: { t: Track; s?: Partial<Subject>; onDone: (id?: number) => void; word?: string }) {
  const [f, setF] = useState<Partial<Subject>>({ weight: 1, ...s });
  const [topics, setTopics] = useState('');
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.name?.trim()) return;
    const rec = { ...f, name: f.name.trim(), trackId: t.id! } as Subject;
    const id = rec.id ? (await db.subjects.put(rec), rec.id) : ((await db.subjects.add(rec)) as number);
    const names = topics.split(/[\n;]/).map((x) => x.trim()).filter(Boolean);
    if (names.length) await db.topics.bulkAdd(names.map((n) => ({ subjectId: id, name: n, status: 'todo' as TopicStatus })));
    onDone(id);
  }
  return (
    <form className="form" onSubmit={save}>
      <label className="field"><span>{word}</span><input autoFocus required value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      {t.type === 'exam' && (
        <div className="cols" style={{ '--c': 3 } as React.CSSProperties}>
          <label className="field"><span>Questões na prova</span><input inputMode="numeric" value={f.questionsCount ?? ''} onChange={(e) => setF({ ...f, questionsCount: num(e.target.value) })} /></label>
          <label className="field"><span>Peso</span><input inputMode="decimal" value={f.weight ?? ''} onChange={(e) => setF({ ...f, weight: num(e.target.value) })} /></label>
          <label className="field"><span>Meta de acertos (%)</span><input inputMode="numeric" value={f.targetAccuracy ?? ''} onChange={(e) => setF({ ...f, targetAccuracy: num(e.target.value) })} placeholder={String(t.targetAccuracy ?? 75)} /></label>
        </div>
      )}
      {!f.id && (
        <label className="field"><span>Tópicos (um por linha, opcional)</span>
          <textarea rows={4} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder={'Modelo relacional\nNormalização\nSQL: joins'} />
        </label>
      )}
      <div className="actions"><button className="btn gold">Salvar</button><button type="button" className="btn out" onClick={() => onDone()}>Cancelar</button></div>
    </form>
  );
}

function QuestionsForm({ t, subjectId, onDone }: { t: Track; subjectId?: number; onDone: () => void }) {
  const d = useData();
  const ui = useUI();
  const subs = d.subjects.filter((s) => s.trackId === t.id);
  const [f, setF] = useState({ subjectId: subjectId ?? subs[0]?.id, topicId: undefined as number | undefined, date: today(), total: '', correct: '' });
  const topics = d.topics.filter((x) => x.subjectId === f.subjectId);
  if (!subs.length) return <Empty>Cadastre uma matéria primeiro.</Empty>;
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault();
      const total = Number(f.total), correct = Number(f.correct);
      if (!f.subjectId || !(total > 0) || correct < 0 || correct > total) return ui.toast('Confira: acertos entre 0 e o total de questões.');
      await db.questionLogs.add({ subjectId: f.subjectId, topicId: f.topicId, date: f.date, total, correct });
      ui.toast(`${correct}/${total} lançadas (${Math.round((correct / total) * 100)}%).`);
      onDone();
    }}>
      <div className="cols">
        <label className="field"><span>Matéria</span><select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: Number(e.target.value), topicId: undefined })}>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field"><span>Tópico (opcional)</span><select value={f.topicId ?? ''} onChange={(e) => setF({ ...f, topicId: e.target.value ? Number(e.target.value) : undefined })}><option value="">—</option>{topics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <div className="cols" style={{ '--c': 3 } as React.CSSProperties}>
        <label className="field"><span>Data</span><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="field"><span>Questões</span><input inputMode="numeric" required value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></label>
        <label className="field"><span>Acertos</span><input inputMode="numeric" required value={f.correct} onChange={(e) => setF({ ...f, correct: e.target.value })} /></label>
      </div>
      <div className="actions"><button className="btn gold">Lançar</button><button type="button" className="btn out" onClick={onDone}>Cancelar</button></div>
    </form>
  );
}

function MockForm({ t, onDone }: { t: Track; onDone: () => void }) {
  const ui = useUI();
  const [f, setF] = useState({ title: 'Simulado', date: today(), total: '', correct: '' });
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault();
      const total = Number(f.total), correct = Number(f.correct);
      if (!(total > 0) || correct < 0 || correct > total) return ui.toast('Confira: acertos entre 0 e o total.');
      await db.mockExams.add({ trackId: t.id!, title: f.title.trim() || 'Simulado', date: f.date, total, correct });
      ui.toast(`Simulado lançado: ${Math.round((correct / total) * 100)}%.`);
      onDone();
    }}>
      <label className="field"><span>Nome</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <div className="cols" style={{ '--c': 3 } as React.CSSProperties}>
        <label className="field"><span>Data</span><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="field"><span>Questões</span><input inputMode="numeric" required value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></label>
        <label className="field"><span>Acertos</span><input inputMode="numeric" required value={f.correct} onChange={(e) => setF({ ...f, correct: e.target.value })} /></label>
      </div>
      <div className="actions"><button className="btn gold">Lançar simulado</button><button type="button" className="btn out" onClick={onDone}>Cancelar</button></div>
    </form>
  );
}

/* =============================== Edital e prazos =============================== */

export function ConcursoEdital({ t }: { t: Track }) {
  const d = useData();
  const ui = useUI();
  const dates = d.trackDates.filter((x) => x.trackId === t.id).sort((a, b) => a.date.localeCompare(b.date));
  const all: (TrackDate | { id: undefined; label: string; date: string; kind: 'prova'; time?: string; alert?: boolean })[] = [
    ...dates, ...(t.examDate && !dates.some((x) => x.kind === 'prova' && x.date === t.examDate) ? [{ id: undefined, label: 'Prova', date: t.examDate, kind: 'prova' as const, time: t.examTime }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const [f, setF] = useState({ label: '', date: '', dateEnd: '', time: '', kind: 'edital' as TrackDate['kind'] });
  const t0 = today();
  const firstFuture = all.find((x) => x.date >= t0)?.date ?? t.examDate ?? t0;
  const [month, setMonth] = useState(firstFuture.slice(0, 7) + '-01');
  const toggleStep = (s: string) => db.tracks.update(t.id!, { steps: (t.steps ?? []).includes(s) ? (t.steps ?? []).filter((x) => x !== s) : [...(t.steps ?? []), s] });

  return (
    <>
      <Card title="Situação da inscrição" expandable={false}>
        <ol className="stepper">
          {EXAM_STEPS.map((s, i) => {
            const done = (t.steps ?? []).includes(s);
            return (
              <li key={s} className={done ? 'done' : ''}>
                <button type="button" onClick={() => void toggleStep(s)} aria-pressed={done} aria-label={`${s}: ${done ? 'feito' : 'pendente'}`}>{done ? '✓' : i + 1}</button>
                <span>{s}</span>
              </li>
            );
          })}
        </ol>
      </Card>
      <div className="grid g3">
        <Card title="Datas do edital">
          <div className="list">
            {all.map((x, i) => {
              const past = (('dateEnd' in x && x.dateEnd) || x.date) < t0;
              return (
                <div key={x.id ?? `p${i}`} className={`row small ${past ? 'past' : ''}`}>
                  <span className="dotc" style={{ background: x.kind === 'prova' ? 'var(--bad)' : x.kind === 'simulado' ? '#8f8cc4' : 'var(--accent)' }} />
                  <b style={{ width: '5.5rem' }}>{ddmm(x.date)}{'dateEnd' in x && x.dateEnd ? `–${ddmm(x.dateEnd)}` : ''}</b>
                  <span className="grow">{x.label}{x.time ? ` · ${x.time}` : ''}</span>
                  {x.kind === 'prova' && !past && <span className="tag warn">{diffDays(x.date, t0)} dias</span>}
                  {x.id != null && (
                    <button type="button" className={`icon-btn ${x.alert ? 'on-alert' : ''}`} aria-pressed={!!x.alert} aria-label={`Alerta: ${x.label}`} title="alerta 7d, 1d e 3h antes"
                      onClick={() => db.trackDates.update(x.id!, { alert: !x.alert })}>🔔</button>
                  )}
                  {x.id != null && <ItemMenu label={x.label} actions={{ delete: () => void ui.remove('trackDates', x.id!, `Data “${x.label}”`) }} />}
                </div>
              );
            })}
            {all.length === 0 && <Empty>Cadastre as datas do edital: inscrições, boleto, cartão de confirmação, prova, gabarito, recursos, resultado.</Empty>}
            <form className="form" style={{ gap: 8, marginTop: 6 }} onSubmit={async (e) => {
              e.preventDefault();
              if (!f.label.trim() || !f.date) return;
              await db.trackDates.add({ trackId: t.id!, label: f.label.trim(), date: f.date, dateEnd: f.dateEnd || undefined, time: f.time || undefined, kind: f.kind, alert: f.kind === 'prova' });
              setF({ ...f, label: '', date: '', dateEnd: '', time: '' });
            }}>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: '1 1 9rem' }} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Cartão de confirmação" aria-label="Nome da data" />
                <select className="input sm" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as TrackDate['kind'] })} aria-label="Tipo da data">
                  <option value="edital">edital</option><option value="simulado">simulado</option><option value="prova">prova</option>
                </select>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <input className="input" style={{ width: 'auto', flex: 1 }} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Data" />
                <input className="input" style={{ width: 'auto', flex: 1 }} type="date" value={f.dateEnd} min={f.date} onChange={(e) => setF({ ...f, dateEnd: e.target.value })} aria-label="Até (opcional)" />
                <input className="input" style={{ width: 'auto' }} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} aria-label="Horário (opcional)" />
                <button className="btn sm out">+ data</button>
              </div>
            </form>
          </div>
        </Card>

        <Card title={`${MONTHS[parse(month).getMonth()][0].toUpperCase()}${MONTHS[parse(month).getMonth()].slice(1)} · só este concurso`}
          act={<span className="row" style={{ gap: 4 }}>
            <button className="btn sm" aria-label="Mês anterior" onClick={() => setMonth(iso(new Date(parse(month).getFullYear(), parse(month).getMonth() - 1, 1)))}>‹</button>
            <button className="btn sm" aria-label="Próximo mês" onClick={() => setMonth(iso(new Date(parse(month).getFullYear(), parse(month).getMonth() + 1, 1)))}>›</button>
          </span>}>
          <MiniMonth month={month} dates={all} />
          <div className="row small muted" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span><i className="dotc" style={{ background: 'var(--accent)', display: 'inline-block' }} /> edital</span>
            <span><i className="dotc" style={{ background: '#8f8cc4', display: 'inline-block' }} /> simulados</span>
            <span><i className="dotc" style={{ background: 'var(--bad)', display: 'inline-block' }} /> prova</span>
          </div>
          <label className="toggle-row" style={{ marginTop: 10 }}>
            <span><b>Mostrar no Calendário e Agenda gerais</b><small>as datas deste concurso aparecem junto com o resto</small></span>
            <input type="checkbox" role="switch" className="switch" checked={t.showInCalendar !== false} onChange={(e) => db.tracks.update(t.id!, { showInCalendar: e.target.checked })} aria-label="Mostrar no Calendário e Agenda gerais" />
          </label>
        </Card>

        <Card title="Alertas deste edital">
          <div className="list">
            {dates.filter((x) => x.date >= t0).map((x) => (
              <label key={x.id} className="toggle-row">
                <span><b>{x.label} · {ddmm(x.date)}{x.time ? ` · ${x.time}` : ''}</b><small>7 dias, 1 dia e 3 h antes</small></span>
                <input type="checkbox" role="switch" className="switch" checked={!!x.alert} onChange={(e) => db.trackDates.update(x.id!, { alert: e.target.checked })} aria-label={`Alerta ${x.label}`} />
              </label>
            ))}
            {dates.filter((x) => x.date >= t0).length === 0 && <Empty>As datas futuras do edital aparecem aqui para ligar o alerta.</Empty>}
          </div>
        </Card>
      </div>
    </>
  );
}

function MiniMonth({ month, dates }: { month: string; dates: { date: string; dateEnd?: string; kind: string; label: string }[] }) {
  const a = parse(month);
  const n = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
  const lead = a.getDay();
  const t0 = today();
  return (
    <div className="heat mini">
      {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x, i) => <span key={i} className="hd">{x}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
      {Array.from({ length: n }, (_, i) => {
        const day = iso(new Date(a.getFullYear(), a.getMonth(), i + 1));
        const hits = dates.filter((x) => x.date <= day && (x.dateEnd ?? x.date) >= day);
        const kind = hits.find((x) => x.kind === 'prova') ? 'prova' : hits.find((x) => x.kind === 'simulado') ? 'simulado' : hits.length ? 'edital' : '';
        return (
          <span key={day} className={`mm ${kind} ${day === t0 ? 'today' : ''}`} title={hits.map((x) => x.label).join(', ')}>
            {i + 1}{kind && <i />}
          </span>
        );
      })}
    </div>
  );
}

/* =============================== Documentos =============================== */

export function ConcursoDocumentos({ t }: { t: Track }) {
  const d = useData();
  const ui = useUI();
  const [boleto, setBoleto] = useState<Attachment | null>(null);
  const extra = (a: Attachment) => {
    if (a.kind !== 'boleto') return null;
    const m = (a.meta ?? {}) as { valor?: number; vencimento?: string; pago?: boolean };
    return (
      <button type="button" className={`tag ${m.pago ? 'ok' : 'warn'}`} onClick={() => setBoleto(a)}>
        {m.valor ? `R$ ${m.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'valor?'}{m.vencimento ? ` · venc. ${ddmm(m.vencimento)}` : ''} · {m.pago ? 'pago' : 'a pagar'}
      </button>
    );
  };
  return (
    <div className="grid g2">
      <Card title="Documentos do concurso" wide>
        <AttachmentList owner={{ type: 'track', id: t.id! }} extra={extra} />
      </Card>
      <Card title="Anexar">
        <AttachmentDrop owner={{ type: 'track', id: t.id! }} kinds={['notice', 'boleto', 'receipt', 'material', 'link']}
          onAdded={(id, kind) => { if (kind === 'boleto') { const a = d.attachments.find((x) => x.id === id); setBoleto(a ?? ({ id, kind: 'boleto', name: 'Boleto', ownerType: 'track', ownerId: t.id! } as Attachment)); } }} />
        <p className="hint" style={{ marginTop: 8 }}>Tipos: Edital · Boleto · Comprovante · Material · Link de pasta. O boleto com vencimento vai para o Financeiro e o Calendário; marcado como pago, o valor entra nos lançamentos do Financeiro.</p>
      </Card>
      {boleto && (
        <Modal title="Boleto da inscrição" onClose={() => setBoleto(null)}>
          <BoletoForm a={boleto} t={t} onDone={(m) => { setBoleto(null); if (m) ui.toast(m); }} />
        </Modal>
      )}
    </div>
  );
}

function BoletoForm({ a, t, onDone }: { a: Attachment; t: Track; onDone: (m?: string) => void }) {
  const m0 = (a.meta ?? {}) as { valor?: number; vencimento?: string; pago?: boolean; eventId?: number; txId?: number };
  const [f, setF] = useState({ valor: m0.valor ? String(m0.valor) : '', vencimento: m0.vencimento ?? '', pago: !!m0.pago });
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault();
      const valor = Number(f.valor.replace(/\./g, '').replace(',', '.')) || undefined;
      const meta: Record<string, unknown> = { ...m0, valor, vencimento: f.vencimento || undefined, pago: f.pago };
      await db.transaction('rw', [db.attachments, db.events, db.financeTxs], async () => {
        // vencimento no Financeiro e no Calendário (um evento por boleto)
        if (f.vencimento && !f.pago) {
          const ev = { title: `Boleto · ${t.title}`, date: f.vencimento, area: 'financeiro' as const, kind: 'vencimento' as const, source: 'local' as const };
          if (m0.eventId && (await db.events.get(m0.eventId))) await db.events.update(m0.eventId, ev);
          else meta.eventId = await db.events.add(ev);
        } else if (m0.eventId) { await db.events.delete(m0.eventId); meta.eventId = undefined; }
        // pago: entra nos lançamentos do Financeiro (saída do saldo)
        if (f.pago && valor && !m0.txId) meta.txId = await db.financeTxs.add({ date: today(), amount: -valor, account: 'saldo', description: `Inscrição · ${t.title}`, source: 'manual' });
        if (!f.pago && m0.txId) { await db.financeTxs.delete(m0.txId); meta.txId = undefined; }
        await db.attachments.update(a.id!, { meta });
      });
      onDone(f.pago ? 'Boleto pago: lançado no Financeiro.' : f.vencimento ? `Vencimento ${ddmm(f.vencimento)} no Financeiro e no Calendário.` : undefined);
    }}>
      <div className="cols">
        <label className="field"><span>Valor (R$)</span><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="95,00" /></label>
        <label className="field"><span>Vencimento</span><input type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={f.pago} onChange={(e) => setF({ ...f, pago: e.target.checked })} /> Já paguei</label>
      <div className="actions"><button className="btn gold">Salvar</button><button type="button" className="btn out" onClick={() => onDone()}>Fechar</button></div>
    </form>
  );
}

/* =============================== Simulados =============================== */

export function ConcursoSimulados({ t }: { t: Track }) {
  const d = useData();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const list = d.mockExams.filter((x) => x.trackId === t.id).sort((a, b) => a.date.localeCompare(b.date));
  const meta = t.targetAccuracy ?? 75;
  const W = 320, H = 90;
  const ys = list.map((x) => Math.round((x.correct / x.total) * 100));
  const pts = ys.map((v, i) => `${ys.length > 1 ? (i * W) / (ys.length - 1) : W / 2},${H - 8 - (v / 100) * (H - 16)}`).join(' ');
  return (
    <div className="grid g2">
      <Card title="Simulados" act={<button className="add-link" style={{ margin: 0 }} onClick={() => setOpen(true)}>+ simulado</button>}>
        <div className="list">
          {[...list].reverse().map((x) => {
            const p = Math.round((x.correct / x.total) * 100);
            return (
              <div key={x.id} className="row small">
                <b style={{ width: '3.5rem' }}>{ddmm(x.date)}</b><span className="grow">{x.title}</span>
                <span className="muted">{x.correct}/{x.total}</span>
                <b style={{ color: p >= meta ? 'var(--ok)' : 'var(--accent)', width: '3rem', textAlign: 'right' }}>{p}%</b>
                <ItemMenu label={x.title} actions={{ delete: () => void ui.remove('mockExams', x.id!, `Simulado “${x.title}”`) }} />
              </div>
            );
          })}
          {list.length === 0 && <Empty action={{ label: '+ Simulado', run: () => setOpen(true) }}>Nenhum simulado lançado.</Empty>}
        </div>
      </Card>
      <Card title="Evolução nos simulados">
        {ys.length ? (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={list.map((x, i) => `${ddmm(x.date)}: ${ys[i]}%`).join('; ')}>
            <line x1="0" x2={W} y1={H - 8 - (meta / 100) * (H - 16)} y2={H - 8 - (meta / 100) * (H - 16)} stroke="var(--muted)" strokeDasharray="4 4" />
            <text x={W - 4} y={H - 12 - (meta / 100) * (H - 16)} textAnchor="end" fontSize="10" fill="var(--muted)">meta {meta}%</text>
            <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" />
          </svg>
        ) : <Empty>A linha aparece a partir do primeiro simulado.</Empty>}
      </Card>
      {open && <Modal title="Simulado" onClose={() => setOpen(false)}><MockForm t={t} onDone={() => setOpen(false)} /></Modal>}
    </div>
  );
}
