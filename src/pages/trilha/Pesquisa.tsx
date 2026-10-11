import { useEffect, useRef, useState } from 'react';
import { AttachmentDrop, AttachmentList } from '../../components/AttachmentDrop';
import { Card } from '../../components/Card';
import { ItemMenu } from '../../components/ItemMenu';
import { useUI } from '../../components/Overlays';
import { Empty, Icon, Stat, Stats } from '../../components/ui';
import { openAttachment } from '../../lib/attachments';
import { useData } from '../../lib/data';
import { db } from '../../lib/db';
import { ddmm, diffDays, dur, relDays, today, weekStart } from '../../lib/dates';
import { hhmm } from '../../lib/drafts';
import { nextDate, RESEARCH_STAGES, studyMinutesWeek } from '../../lib/study';
import type { ArticleNote, ArticleStatus, Track } from '../../lib/types';

const STATUS: ArticleStatus[] = ['a triar', 'lendo', 'incluído', 'excluído', 'fichado'];
const STATUS_CLS: Record<ArticleStatus, string> = { 'a triar': 'info', lendo: 'warn', incluído: 'ok', excluído: 'bad', fichado: 'ok' };

/** visão geral da pesquisa (p. 11): indicadores + artigos + nota + diário */
export function PesquisaVisao({ t }: { t: Track }) {
  const d = useData();
  const arts = d.articleNotes.filter((a) => a.trackId === t.id);
  const last = d.journal.filter((j) => j.trackId === t.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  const nx = nextDate(d, t);
  const week = studyMinutesWeek(d, weekStart(today()), t.id, true) + d.journal.filter((j) => j.trackId === t.id && j.date >= weekStart(today())).reduce((s, j) => s + (j.minutes ?? 0), 0);
  const stage = t.stage ?? 1;
  const [sel, setSel] = useState<number | undefined>(arts[0]?.id);
  const since = last ? diffDays(today(), last.date) : null;
  return (
    <>
      <Stats>
        <Stat k="Etapa" v={RESEARCH_STAGES[stage - 1] ?? '—'} s={`${stage} de ${RESEARCH_STAGES.length}`} />
        <Stat k="Artigos" v={arts.length ? `${arts.filter((a) => a.status !== 'a triar').length}/${arts.length}` : '0'} s={`triados · ${arts.filter((a) => a.status === 'fichado').length} fichados`} />
        <Stat k="Último registro" v={last ? ddmm(last.date) : '—'} s={last ? `há ${since} ${since === 1 ? 'dia' : 'dias'} · diário` : 'nenhum ainda'} />
        <Stat k="Próxima entrega" v={nx ? ddmm(nx.date) : '—'} s={nx ? `${nx.label} · ${relDays(nx.date)}` : 'cadastre em Editar trilha'} />
        <Stat k="Horas na pesquisa" v={dur(week) || '0h'} s={`nesta semana${t.hoursPerWeek ? ` · meta ${t.hoursPerWeek}h` : ''}`} />
      </Stats>
      {since != null && since >= (t.journalAlertDays ?? 5) && (
        <p className="note small">Faz {since} dias sem registro no diário. Um parágrafo sobre o que avançou já ajuda a não perder o fio.</p>
      )}
      <div className="grid g3">
        <Articles t={t} sel={sel} onSel={setSel} compact />
        <NoteEditor t={t} id={sel} />
        <Journal t={t} />
      </div>
    </>
  );
}

export function PesquisaArtigos({ t }: { t: Track }) {
  const d = useData();
  const arts = d.articleNotes.filter((a) => a.trackId === t.id);
  const [sel, setSel] = useState<number | undefined>(arts[0]?.id);
  return (
    <div className="grid g3">
      <Articles t={t} sel={sel} onSel={setSel} />
      <div className="span2"><NoteEditor t={t} id={sel} /></div>
    </div>
  );
}

export function PesquisaArquivos({ t }: { t: Track }) {
  return (
    <div className="grid g2">
      <Card title="Arquivos e links" wide><AttachmentList owner={{ type: 'track', id: t.id! }} kinds={['file', 'link', 'material', 'notice', 'boleto', 'receipt']} /></Card>
      <Card title="Anexar"><AttachmentDrop owner={{ type: 'track', id: t.id! }} kinds={['file', 'link', 'material']} defaultKind="link" />
        <p className="hint" style={{ marginTop: 8 }}>Planilhas, notebooks, a biblioteca do Zotero, a pasta do Drive: arquivo ou link.</p>
      </Card>
    </div>
  );
}

export function PesquisaDiario({ t }: { t: Track }) {
  return <div className="grid g2"><Journal t={t} /></div>;
}

function Articles({ t, sel, onSel, compact }: { t: Track; sel?: number; onSel: (id: number) => void; compact?: boolean }) {
  const d = useData();
  const ui = useUI();
  const [filter, setFilter] = useState<'todos' | ArticleStatus>('todos');
  const [adding, setAdding] = useState(false);
  const arts = d.articleNotes.filter((a) => a.trackId === t.id);
  const list = arts.filter((a) => filter === 'todos' || a.status === filter);
  const att = (a: ArticleNote) => d.attachments.find((x) => x.id === a.attachmentId);
  const links = d.attachments.filter((a) => a.ownerType === 'track' && a.ownerId === t.id && a.kind !== 'article');
  return (
    <Card title="Artigos" act={<button className="add-link" style={{ margin: 0 }} onClick={() => setAdding((x) => !x)}>+ anexar PDF</button>}>
      <div className="seg full" role="radiogroup" aria-label="Filtrar artigos" style={{ marginBottom: 10 }}>
        {(['todos', 'a triar', 'fichado'] as const).map((k) => (
          <button key={k} role="radio" aria-checked={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {k === 'todos' ? 'Todos' : k === 'a triar' ? 'A triar' : 'Fichados'} {k === 'todos' ? arts.length : arts.filter((a) => a.status === k).length}
          </button>
        ))}
      </div>
      {adding && (
        <AttachmentDrop compact owner={{ type: 'track', id: t.id! }} kinds={['article']} onAdded={async (id) => {
          const nid = (await db.articleNotes.add({ attachmentId: id, trackId: t.id!, status: 'a triar' })) as number;
          onSel(nid);
          setAdding(false);
        }} />
      )}
      <div className="list" style={{ gap: 6 }}>
        {list.map((a) => (
          <div key={a.id} className={`art ${a.id === sel ? 'on' : ''}`}>
            <Icon name="file" size={16} />
            <button type="button" className="plain grow" onClick={() => onSel(a.id!)}>
              <b>{att(a)?.name ?? 'artigo'}</b><small className="muted">{[a.authors, a.year].filter(Boolean).join(' · ') || 'autor e ano: preencha na nota'}</small>
            </button>
            <select className={`tag ${STATUS_CLS[a.status]} art-st`} value={a.status} onChange={(e) => db.articleNotes.update(a.id!, { status: e.target.value as ArticleStatus })} aria-label={`Situação de ${att(a)?.name}`}>
              {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <ItemMenu label={att(a)?.name ?? 'artigo'} actions={{ delete: () => void ui.remove('articleNotes', a.id!, 'Fichamento') }} />
          </div>
        ))}
        {list.length === 0 && <Empty>{arts.length ? 'Nenhum artigo com esse filtro.' : 'Anexe o primeiro PDF (ou cole o link).'}</Empty>}
      </div>
      {compact && links.length > 0 && (
        <>
          <span className="lab-up" style={{ display: 'block', margin: '12px 0 6px' }}>Arquivos e links</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {links.slice(0, 6).map((l) => <button key={l.id} type="button" className="chip" onClick={() => void openAttachment(l)}>{l.url ? '🔗' : '📄'} {l.name}</button>)}
          </div>
        </>
      )}
    </Card>
  );
}

/** nota de desenvolvimento (fichamento): salva sozinha ~0,6 s depois de parar de digitar */
function NoteEditor({ t, id }: { t: Track; id?: number }) {
  const d = useData();
  const note = d.articleNotes.find((a) => a.id === id && a.trackId === t.id);
  const att = note ? d.attachments.find((x) => x.id === note.attachmentId) : undefined;
  const [f, setF] = useState<Partial<ArticleNote>>(note ?? {});
  const [savedAt, setSavedAt] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<Partial<ArticleNote> | null>(null);
  // grava o que estiver pendente: ao parar de digitar, ao sair do campo e ao trocar de tela
  const flush = async () => {
    const n = pending.current;
    if (!n?.id) return;
    pending.current = null;
    clearTimeout(timer.current);
    const { id, createdAt: _c, updatedAt: _u, ...rest } = n;
    await db.articleNotes.update(id, rest);
    setSavedAt(hhmm());
  };
  // ao trocar de artigo ou sair da tela, nada fica sem gravar
  useEffect(() => () => { void flush(); }, [note?.id]);
  useEffect(() => { setF(note ?? {}); setSavedAt(note?.updatedAt ? hhmm(new Date(note.updatedAt)) : undefined); }, [note?.id]);
  if (!note) return <Card title="Nota de desenvolvimento"><Empty>Escolha um artigo para escrever a nota (objetivo, método, achados e como usa na pesquisa).</Empty></Card>;
  const set = (p: Partial<ArticleNote>) => {
    const n = { ...f, ...p };
    setF(n);
    pending.current = n;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  };
  const field = (k: 'objective' | 'method' | 'findings' | 'usage', label: string) => (
    <label className="field"><span className="lab-up">{label}</span>
      <textarea rows={3} value={(f[k] as string) ?? ''} onChange={(e) => set({ [k]: e.target.value })} onBlur={() => void flush()} />
    </label>
  );
  return (
    <Card title="Nota de desenvolvimento" act={<span className="small muted">{savedAt ? `salvo automaticamente · ${savedAt}` : 'salva sozinha'}</span>}>
      <div className="row" style={{ marginBottom: 8, gap: 8 }}>
        <b className="grow" style={{ whiteSpace: 'normal' }}>{att?.name}</b>
        {att && <button type="button" className="btn sm out" onClick={() => void openAttachment(att)}>Abrir PDF</button>}
      </div>
      <div className="form">
        <div className="cols">
          <label className="field"><span>Autores</span><input value={f.authors ?? ''} onChange={(e) => set({ authors: e.target.value })} onBlur={() => void flush()} /></label>
          <label className="field"><span>Ano</span><input inputMode="numeric" value={f.year ?? ''} onChange={(e) => set({ year: e.target.value })} onBlur={() => void flush()} /></label>
        </div>
        {field('objective', 'Objetivo')}
        {field('method', 'Método')}
        {field('findings', 'Achados')}
        {field('usage', 'Como uso na pesquisa')}
        <div className="cols">
          <label className="field"><span>Marcadores (separe com vírgula)</span><input value={(f.tags ?? []).join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} onBlur={() => void flush()} /></label>
          <label className="field"><span>Páginas destacadas</span><input value={f.pages ?? ''} onChange={(e) => set({ pages: e.target.value })} placeholder="4, 7, 12" onBlur={() => void flush()} /></label>
        </div>
      </div>
    </Card>
  );
}

function Journal({ t }: { t: Track }) {
  const d = useData();
  const ui = useUI();
  const [text, setText] = useState('');
  const [minutes, setMinutes] = useState('');
  const [articleId, setArticleId] = useState<number | ''>('');
  const list = d.journal.filter((j) => j.trackId === t.id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const arts = d.articleNotes.filter((a) => a.trackId === t.id);
  const name = (id?: number) => d.attachments.find((x) => x.id === d.articleNotes.find((a) => a.id === id)?.attachmentId)?.name;
  return (
    <Card title="Diário de acompanhamento">
      <form className="form journal-new" onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        const h = Number(minutes.replace(',', '.'));
        await db.journal.add({ trackId: t.id!, date: today(), text: text.trim(), minutes: h > 0 ? Math.round(h * 60) : undefined, articleId: articleId || undefined });
        setText(''); setMinutes(''); setArticleId('');
        ui.toast('Registro salvo no diário.');
      }}>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="O que você avançou hoje?" aria-label="O que você avançou hoje?" />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <select className="input sm" value={articleId} onChange={(e) => setArticleId(e.target.value ? Number(e.target.value) : '')} aria-label="Ligar a um artigo">
            <option value="">+ ligar a um artigo</option>{arts.map((a) => <option key={a.id} value={a.id}>{name(a.id)}</option>)}
          </select>
          <input className="input sm" style={{ width: '6rem' }} inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="+ horas" aria-label="Horas" />
          <button className="btn gold sm" style={{ marginLeft: 'auto' }}>Registrar</button>
        </div>
      </form>
      <ol className="timeline">
        {list.map((j) => (
          <li key={j.id}>
            <b>{ddmm(j.date)}{j.minutes ? ` · ${dur(j.minutes)}` : ''}</b>
            <p>{j.text}{j.articleId && name(j.articleId) ? <span className="muted"> · {name(j.articleId)}</span> : null}</p>
            <ItemMenu label={`registro de ${ddmm(j.date)}`} actions={{ delete: () => void ui.remove('journal', j.id!, 'Registro do diário') }} />
          </li>
        ))}
      </ol>
      {list.length === 0 && <Empty>Cada registro fica com a data. O mais recente aparece em cima.</Empty>}
    </Card>
  );
}
