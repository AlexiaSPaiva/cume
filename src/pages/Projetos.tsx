import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Page } from '../components/Layout';
import { Card } from '../components/Card';
import { useUI } from '../components/Overlays';
import { Bar, Empty, Modal } from '../components/ui';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { ddmm, relDays, today } from '../lib/dates';
import { softDelete } from '../lib/trash';
import type { DevFolder, DevProject, DevStatus, Task, TaskStatus } from '../lib/types';

export const FOLDERS: { id: DevFolder; name: string; hint: string }[] = [
  { id: 'pessoal', name: 'Pessoais', hint: 'ideias suas, estudos e o Cume' },
  { id: 'empresa', name: 'Da empresa', hint: 'o que você entrega no trabalho' },
  { id: 'vaga', name: 'Para a vaga', hint: 'portfólio feito para provar o que as vagas pedem' },
];
const STATUS: Record<DevStatus, string> = { ideia: 'ideia', andamento: 'em andamento', pausado: 'pausado', concluido: 'concluído' };
const COLS: { id: TaskStatus; name: string }[] = [
  { id: 'afazer', name: 'A fazer' }, { id: 'andamento', name: 'Fazendo' }, { id: 'concluido', name: 'Feito' },
];

const projTasks = (tasks: Task[], id?: number) => tasks.filter((t) => t.projectId === id);
const colOf = (t: Task): TaskStatus => (t.status === 'concluido' ? 'concluido' : t.status === 'andamento' ? 'andamento' : 'afazer');

/** progresso do projeto: tarefas feitas ÷ todas */
export function projectProgress(tasks: Task[], id?: number) {
  const ts = projTasks(tasks, id);
  const done = ts.filter((t) => t.status === 'concluido').length;
  return { done, total: ts.length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0, next: ts.find((t) => t.status === 'andamento') ?? ts.find((t) => colOf(t) === 'afazer') };
}

/** cartão no painel Profissional: pastas e projetos, cada um com o próximo passo */
export function ProjectsCard() {
  const { devProjects, tasks } = useData();
  const [folder, setFolder] = useState<DevFolder>('vaga');
  const [form, setForm] = useState<Partial<DevProject> | null>(null);
  const list = devProjects.filter((p) => p.folder === folder)
    .sort((a, b) => (a.status === 'concluido' ? 1 : 0) - (b.status === 'concluido' ? 1 : 0) || (a.deadline ?? '9').localeCompare(b.deadline ?? '9'));
  const f = FOLDERS.find((x) => x.id === folder)!;
  return (
    <Card title="Meus projetos" wide>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="seg">
          {FOLDERS.map((x) => (
            <button key={x.id} className={folder === x.id ? 'on' : ''} onClick={() => setFolder(x.id)}>
              📁 {x.name} <span className="muted">{devProjects.filter((p) => p.folder === x.id && p.status !== 'concluido').length}</span>
            </button>
          ))}
        </div>
        <span className="faint small">{f.hint}</span>
        <button className="btn gold right" onClick={() => setForm({ folder, status: 'andamento' })}>+ Projeto</button>
      </div>
      <div className="proj-grid">
        {list.map((p) => {
          const pr = projectProgress(tasks, p.id);
          return (
            <Link key={p.id} to={`/area/profissional/projetos/${p.id}`} className="proj-card">
              <div className="row"><b className="grow">{p.title}</b><span className={`tag ${p.status === 'concluido' ? 'ok' : p.status === 'pausado' ? 'warn' : p.status === 'ideia' ? '' : 'info'}`}>{STATUS[p.status]}</span></div>
              {p.stack?.length ? <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{p.stack.map((s) => <span key={s} className="chip">{s}</span>)}</div> : null}
              <div className="row small"><span className="muted">{pr.done}/{pr.total} tarefas</span>{p.deadline && <span className="right muted">prazo {ddmm(p.deadline)} · {relDays(p.deadline)}</span>}</div>
              <Bar pct={pr.pct} color="#7da0c9" />
              <span className="small">{pr.next ? <>Próximo passo: <b>{pr.next.title}</b></> : <span className="faint">sem próximo passo: abra e adicione</span>}</span>
            </Link>
          );
        })}
        {list.length === 0 && <Empty action={{ label: '+ Projeto', run: () => setForm({ folder, status: 'andamento' }) }}>Nenhum projeto em “{f.name}”.</Empty>}
      </div>
      {form && <Modal title={form.id ? 'Editar projeto' : 'Novo projeto'} onClose={() => setForm(null)}><ProjectForm p={form} onDone={() => setForm(null)} /></Modal>}
    </Card>
  );
}

function ProjectForm({ p, onDone }: { p: Partial<DevProject>; onDone: (id?: number) => void }) {
  const [v, setV] = useState<Partial<DevProject>>(p);
  const set = (x: Partial<DevProject>) => setV({ ...v, ...x });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title?.trim()) return;
    const id = await db.devProjects.put({ ...v, title: v.title.trim(), folder: v.folder ?? 'pessoal', status: v.status ?? 'andamento', deadline: v.deadline || undefined } as DevProject);
    onDone(id as number);
  }
  return (
    <form className="list" style={{ gap: 12 }} onSubmit={submit}>
      <label className="field"><span>Nome do projeto</span><input className="input" value={v.title ?? ''} onChange={(e) => set({ title: e.target.value })} autoFocus /></label>
      <div className="row" style={{ gap: 10 }}>
        <label className="field grow"><span>Pasta</span>
          <select className="input" value={v.folder} onChange={(e) => set({ folder: e.target.value as DevFolder })}>{FOLDERS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className="field grow"><span>Situação</span>
          <select className="input" value={v.status} onChange={(e) => set({ status: e.target.value as DevStatus })}>{Object.entries(STATUS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      </div>
      <label className="field"><span>O que é (uma frase)</span><input className="input" value={v.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} /></label>
      <label className="field"><span>Tecnologias (separe por vírgula)</span><input className="input" value={(v.stack ?? []).join(', ')} onChange={(e) => set({ stack: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="React, TypeScript, Node" /></label>
      {v.folder === 'vaga' && <label className="field"><span>Que vaga ou requisito este projeto prova?</span><input className="input" value={v.target ?? ''} onChange={(e) => set({ target: e.target.value })} placeholder="ex.: júnior full stack remoto · pede React + API REST + testes" /></label>}
      <div className="row" style={{ gap: 10 }}>
        <label className="field grow"><span>Repositório</span><input className="input" value={v.repoUrl ?? ''} onChange={(e) => set({ repoUrl: e.target.value })} placeholder="https://github.com/…" /></label>
        <label className="field grow"><span>No ar</span><input className="input" value={v.liveUrl ?? ''} onChange={(e) => set({ liveUrl: e.target.value })} placeholder="https://…" /></label>
      </div>
      <label className="field"><span>Prazo (opcional)</span><input className="input" type="date" value={v.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value })} /></label>
      <div className="row"><button className="btn gold" type="submit">{p.id ? 'Salvar' : 'Criar projeto'}</button></div>
    </form>
  );
}

/** página do projeto: quadro A fazer / Fazendo / Feito, com adicionar rápido */
export function Projeto() {
  const { id } = useParams();
  const { devProjects, tasks } = useData();
  const ui = useUI();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState('');
  const p = devProjects.find((x) => x.id === Number(id));
  if (!p) return <Navigate to="/area/profissional" replace />;
  const ts = projTasks(tasks, p.id);
  const pr = projectProgress(tasks, p.id);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await db.tasks.add({ title: title.trim(), area: 'profissional', status: 'afazer', priority: 'media', projectId: p!.id } as Task);
    setTitle('');
  }
  const move = (t: Task, s: TaskStatus) => db.tasks.update(t.id!, { status: s, ...(s === 'concluido' ? { doneAt: today(), progress: 100 } : { doneAt: undefined }) });

  return (
    <Page title={p.title} sub={p.summary ?? FOLDERS.find((f) => f.id === p.folder)!.hint}
      crumbs={[{ to: '/', label: 'Início' }, { to: '/area/profissional', label: 'Profissional' }, { label: p.title }]}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="tag info">📁 {FOLDERS.find((f) => f.id === p.folder)!.name}</span>
        <span className="tag">{STATUS[p.status]}</span>
        {p.stack?.map((s) => <span key={s} className="chip">{s}</span>)}
        {p.deadline && <span className="tag">prazo {ddmm(p.deadline)} · {relDays(p.deadline)}</span>}
        {p.repoUrl && <a className="btn sm" href={p.repoUrl} target="_blank" rel="noreferrer">código ↗</a>}
        {p.liveUrl && <a className="btn sm" href={p.liveUrl} target="_blank" rel="noreferrer">no ar ↗</a>}
        <button className="btn sm right" onClick={() => setEdit(true)}>editar</button>
      </div>
      {p.target && <div className="card small" style={{ padding: '10px 14px' }}><b>Prova para a vaga:</b> {p.target}</div>}
      <div className="row small" style={{ gap: 10 }}><span className="muted">{pr.done} de {pr.total} tarefas feitas</span><div className="grow"><Bar pct={pr.pct} color="#7da0c9" /></div><b>{pr.pct}%</b></div>

      <form className="row" style={{ gap: 8 }} onSubmit={add}>
        <input className="input grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa do projeto (ex.: criar tela de login) e Enter" aria-label="Nova tarefa do projeto" />
        <button className="btn gold" type="submit">Adicionar</button>
      </form>

      <div className="kanban">
        {COLS.map((c) => (
          <Card key={c.id} title={<>{c.name} <span className="muted">{ts.filter((t) => colOf(t) === c.id).length}</span></>}>
            <div className="list" style={{ gap: 6 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { const tid = Number(e.dataTransfer.getData('task')); const t = ts.find((x) => x.id === tid); if (t) void move(t, c.id); }}>
              {ts.filter((t) => colOf(t) === c.id).map((t) => (
                <div key={t.id} className={`noday-row ${c.id === 'concluido' ? 'done-row' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('task', String(t.id))}>
                  <button className="plain noday-t" onClick={() => ui.openTask(t)} title={t.title}><span>{t.title}</span></button>
                  {t.date && <span className="tag">{ddmm(t.date)}</span>}
                  <span className="row" style={{ gap: 4 }}>
                    {c.id !== 'afazer' && <button className="btn sm" aria-label="voltar" onClick={() => move(t, c.id === 'concluido' ? 'andamento' : 'afazer')}>‹</button>}
                    {c.id !== 'concluido' && <button className="btn sm" aria-label="avançar" onClick={() => move(t, c.id === 'afazer' ? 'andamento' : 'concluido')}>{c.id === 'andamento' ? '✓' : '›'}</button>}
                  </span>
                </div>
              ))}
              {ts.filter((t) => colOf(t) === c.id).length === 0 && <span className="faint small">{c.id === 'afazer' ? 'adicione o que falta fazer' : c.id === 'andamento' ? 'o que você está fazendo agora' : 'nada feito ainda'}</span>}
            </div>
          </Card>
        ))}
      </div>
      <p className="faint small">Arraste entre as colunas ou use ‹ › ✓. Para fazer numa data, abra a tarefa e escolha o dia: ela aparece na Agenda.</p>
      <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={async () => { await softDelete(db, 'devProjects', p.id!); ui.toast('Projeto foi para a Lixeira (com as tarefas).'); nav('/area/profissional'); }}>Excluir projeto</button>
      {edit && <Modal title="Editar projeto" onClose={() => setEdit(false)}><ProjectForm p={p} onDone={() => setEdit(false)} /></Modal>}
    </Page>
  );
}

/** resumo na Visão geral do Profissional: projetos em andamento e o próximo passo de cada um */
export function ProjectsSummary() {
  const { devProjects, tasks } = useData();
  const active = devProjects.filter((p) => p.status === 'andamento').slice(0, 4);
  return (
    <Card title="Projetos em andamento">
      <div className="list" style={{ gap: 10 }}>
        {active.map((p) => {
          const pr = projectProgress(tasks, p.id);
          return (
            <Link key={p.id} to={`/area/profissional/projetos/${p.id}`} className="plain" style={{ color: 'inherit', textDecoration: 'none', display: 'grid', gap: 4 }}>
              <div className="row small"><b className="grow">{p.title}</b><span className="muted">{pr.pct}%</span></div>
              <Bar pct={pr.pct} color="#7da0c9" />
              <span className="faint small">{pr.next ? `próximo: ${pr.next.title}` : 'sem próximo passo'}</span>
            </Link>
          );
        })}
        {active.length === 0 && <Empty>Nenhum projeto em andamento.</Empty>}
        <Link className="add-link" to="/area/profissional?aba=projetos">{active.length ? 'todos os projetos →' : '+ criar projeto →'}</Link>
      </div>
    </Card>
  );
}
