import { useState } from 'react';
import { AttachmentDrop, AttachmentList, QuickLinks } from '../../components/AttachmentDrop';
import { Card } from '../../components/Card';
import { ItemMenu } from '../../components/ItemMenu';
import { useUI } from '../../components/Overlays';
import { Bar, Empty, Modal, Stat, Stats } from '../../components/ui';
import { useData } from '../../lib/data';
import { db } from '../../lib/db';
import { ddmm, dur, relDays, today } from '../../lib/dates';
import { coverage, subjectMinutes, TYPE } from '../../lib/study';
import type { Subject, Track } from '../../lib/types';
import { SubjectForm } from './Concurso';
import { DatesList } from './Trilha';

const WORD: Record<Track['type'], [string, string]> = {
  course: ['Módulo', 'Módulos'], degree: ['Disciplina', 'Disciplinas'], language: ['Nível', 'Níveis'],
  extension: ['Atividade', 'Atividades'], exam: ['Matéria', 'Matérias'], research: ['Etapa', 'Etapas'],
};
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** módulos (curso), disciplinas (graduação), níveis (idioma), atividades (extensão) */
export function Modulos({ t }: { t: Track }) {
  const d = useData();
  const ui = useUI();
  const [w, ws] = WORD[t.type];
  const subs = d.subjects.filter((s) => s.trackId === t.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const [edit, setEdit] = useState<Partial<Subject> | null>(null);
  const [linkFor, setLinkFor] = useState<number | null>(null);
  const done = subs.filter((s) => s.done).length;
  return (
    <>
      <Stats n={3}>
        <Stat k={ws} v={subs.length ? `${done}/${subs.length}` : '0'} s="concluídos" />
        <Stat k="Progresso" v={`${subs.length ? Math.round((done / subs.length) * 100) : 0}%`} s={t.type === 'degree' ? 'disciplinas concluídas' : 'da trilha'} />
        <Stat k="Horas estudadas" v={dur(subs.reduce((a, s) => a + subjectMinutes(d, s.id!), 0)) || '0h'} s="em sessões registradas" />
      </Stats>
      <Card title={ws} act={<button className="add-link" style={{ margin: 0 }} onClick={() => setEdit({ order: subs.length + 1 })}>+ {w.toLowerCase()}</button>}>
        <div className="list">
          {subs.map((s, i) => {
            const c = coverage(d, s.id!);
            return (
              <div key={s.id} className="mod-item">
              <div className="mod-row">
                <input type="checkbox" checked={!!s.done} onChange={(e) => db.subjects.update(s.id!, { done: e.target.checked })} aria-label={`${s.name} concluído`} />
                <span className="grow"><b>{i + 1}. {s.name}</b>
                  <small className="muted">{c.total ? `${c.done}/${c.total} tópicos · ` : ''}{dur(subjectMinutes(d, s.id!)) || '0h'} estudadas{t.type === 'degree' && s.grade != null ? ` · nota ${fmt(s.grade)}` : ''}</small>
                </span>
                {s.done && <span className="tag ok">concluído</span>}
                <button type="button" className="qlink-add" onClick={() => setLinkFor(s.id!)} aria-label={`Adicionar link em ${s.name}`}>+ link</button>
                <ItemMenu label={s.name} actions={{ edit: () => setEdit(s), delete: () => void ui.remove('subjects', s.id!, `${w} “${s.name}”`) }} />
              </div>
              <div className="mod-links"><QuickLinks owner={{ type: 'subject', id: s.id! }} showAdd={false} adding={linkFor === s.id} onAdding={(v) => setLinkFor(v ? s.id! : null)} /></div>
              </div>
            );
          })}
          {subs.length === 0 && <Empty action={{ label: `+ ${w}`, run: () => setEdit({ order: 1 }) }}>Cadastre {ws.toLowerCase()} para acompanhar o progresso.</Empty>}
        </div>
      </Card>
      {edit && <Modal title={edit.id ? `Editar ${w.toLowerCase()}` : `Novo(a) ${w.toLowerCase()}`} onClose={() => setEdit(null)}><SubjectForm t={t} s={edit} word={w} onDone={() => setEdit(null)} /></Modal>}
    </>
  );
}

export function Certificado({ t }: { t: Track }) {
  const c = t.certificate ?? {};
  const set = (p: Partial<NonNullable<Track['certificate']>>) => db.tracks.update(t.id!, { certificate: { ...c, ...p } });
  return (
    <div className="grid g2">
      <Card title="Certificado">
        <div className="form">
          <label className="check"><input type="checkbox" checked={!!c.done} onChange={(e) => void set({ done: e.target.checked, date: e.target.checked ? today() : undefined })} /> Já tenho o certificado</label>
          {c.done && <label className="field"><span>Emitido em</span><input type="date" value={c.date ?? ''} onChange={(e) => void set({ date: e.target.value || undefined })} /></label>}
          <p className="hint" style={{ margin: 0 }}>Guarde o PDF ou o link do certificado ao lado. Ele fica junto da trilha e aparece na busca.</p>
        </div>
      </Card>
      <Card title="Arquivo do certificado">
        <AttachmentList owner={{ type: 'track', id: t.id! }} kinds={['file', 'link', 'receipt']} />
        <div style={{ marginTop: 10 }}><AttachmentDrop compact owner={{ type: 'track', id: t.id! }} kinds={['file', 'link']} /></div>
      </Card>
    </div>
  );
}

/** graduação: provas (datas com a nota quando sair) */
export function Provas({ t }: { t: Track }) {
  const d = useData();
  const dates = d.trackDates.filter((x) => x.trackId === t.id && x.kind === 'prova').sort((a, b) => a.date.localeCompare(b.date));
  const next = dates.filter((x) => x.date >= today());
  return (
    <div className="grid g2">
      <Card title="Provas">
        <DatesList t={t} dates={dates} kind="prova" />
      </Card>
      <Card title="Próximas">
        <div className="list">
          {next.map((x) => <div key={x.id} className="row small"><b style={{ width: '3.5rem' }}>{ddmm(x.date)}</b><span className="grow">{x.label}</span><span className="tag warn">{relDays(x.date)}</span></div>)}
          {next.length === 0 && <Empty>Nenhuma prova marcada.</Empty>}
        </div>
      </Card>
    </div>
  );
}

/** graduação: notas por disciplina e média (CR) */
export function Notas({ t }: { t: Track }) {
  const d = useData();
  const subs = d.subjects.filter((s) => s.trackId === t.id);
  const graded = subs.filter((s) => s.grade != null);
  const avg = graded.length ? graded.reduce((a, s) => a + s.grade!, 0) / graded.length : null;
  const target = t.targetGrade ?? 7;
  return (
    <>
      <Stats n={3}>
        <Stat k="Média" v={avg != null ? fmt(avg) : '—'} s={`meta ≥ ${fmt(target)}`} />
        <Stat k="Com nota" v={`${graded.length}/${subs.length}`} s="disciplinas" />
        <Stat k="Abaixo da meta" v={graded.filter((s) => s.grade! < target).length} s="pedem atenção" />
      </Stats>
      <Card title="Notas por disciplina">
        <div className="list">
          {subs.map((s) => (
            <div key={s.id} className="row small">
              <span className="grow"><b>{s.name}</b></span>
              <div style={{ width: '8rem' }}><Bar pct={((s.grade ?? 0) / 10) * 100} color={(s.grade ?? 0) >= target ? 'var(--ok)' : TYPE.degree.color} tick={target * 10} /></div>
              <input className="input sm" style={{ width: '4.5rem' }} inputMode="decimal" defaultValue={s.grade != null ? String(s.grade).replace('.', ',') : ''}
                onBlur={(e) => { const v = e.target.value.trim(); void db.subjects.update(s.id!, { grade: v === '' ? undefined : Number(v.replace(',', '.')) }); }}
                aria-label={`Nota de ${s.name}`} placeholder="nota" />
            </div>
          ))}
          {subs.length === 0 && <Empty>Cadastre as disciplinas na aba Disciplinas.</Empty>}
        </div>
      </Card>
    </>
  );
}
