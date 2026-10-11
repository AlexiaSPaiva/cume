import { useState, type FormEvent } from 'react';
import { ItemMenu } from '../components/ItemMenu';
import { Page } from '../components/Layout';
import { Card } from '../components/Card';
import { useUI } from '../components/Overlays';
import { Bar, Empty, Icon, Modal, Ring, Stat, Stats } from '../components/ui';
import { AREAS, AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { addRecord, db } from '../lib/db';
import { MONTHS, parse } from '../lib/dates';
import { goalPct } from '../lib/week';
import type { AreaId, Goal, Objective, Task } from '../lib/types';
import { fmtGoal } from './Inicio';

export function objectivePct(o: Objective, goals: Goal[]): number {
  const gs = goals.filter((g) => g.objectiveId === o.id);
  return gs.length ? Math.round(gs.reduce((s, g) => s + goalPct(g), 0) / gs.length) : 0;
}

export function goalLabel(g: Goal): string {
  if (g.metric === 'nota') return `${g.title} · ${fmtGoal(g.current)}`;
  if (g.metric === 'valor' && g.unit === 'R$') return `${g.title} · R$ ${fmtGoal(g.current)}/${fmtGoal(g.target)}`;
  if (g.unit === '%') return g.title;
  return `${g.title} · ${fmtGoal(g.current)}/${fmtGoal(g.target)}${g.unit === 'h' ? 'h' : ''}`;
}

export function Metas() {
  const { objectives, goals } = useData();
  const ui = useUI();
  const [goalEdit, setGoalEdit] = useState<Partial<Goal> | null>(null);
  const [objEdit, setObjEdit] = useState<Partial<Objective> | null>(null);
  const [record, setRecord] = useState<Goal | null>(null);

  const ranked = objectives.map((o) => ({ o, p: objectivePct(o, goals) })).sort((a, b) => b.p - a.p);
  const nextDeadline = goals.filter((g) => g.deadline && goalPct(g) < 100).sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0];
  // metas sem objetivo (ou cujo objetivo está na Lixeira) continuam visíveis aqui
  const loose = goals.filter((g) => !g.objectiveId || !objectives.some((o) => o.id === g.objectiveId));

  return (
    <Page title="Objetivos e Metas" sub="A direção da vida e os números que provam que você está chegando lá.">
      <Stats>
        <Stat k="Objetivos" v={objectives.length} s="ativos" />
        <Stat k="Metas" v={`${goals.filter((g) => goalPct(g) < 100).length}/${goals.length}`} s="em progresso" />
        <Stat k="Mais perto" v={ranked[0]?.o.title.split(' ')[0] ?? '—'} s={ranked[0] ? `${ranked[0].p}% do caminho` : ''} />
        <Stat k="Mais longe" v={ranked.at(-1)?.o.title.split(' ')[0] ?? '—'} s={ranked.at(-1) ? `${ranked.at(-1)!.p}% · ${AREA[ranked.at(-1)!.o.area].name}` : ''} />
        <Stat k="Próxima meta" v={nextDeadline ? `${MONTHS[parse(nextDeadline.deadline!).getMonth()].slice(0, 3)}/${nextDeadline.deadline!.slice(0, 4)}` : '—'} s={nextDeadline?.title ?? ''} />
      </Stats>

      <div className="grid g4">
        {objectives.map((o) => {
          const c = AREA[o.area].color;
          const gs = goals.filter((g) => g.objectiveId === o.id);
          return (
            <section key={o.id} className="card obj" style={{ '--c': c } as React.CSSProperties}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow" style={{ whiteSpace: 'normal' }}><h3>{o.title}</h3><span className="muted small">{o.subtitle}</span></div>
                <ItemMenu label={o.title} actions={{
                  edit: () => setObjEdit(o),
                  delete: () => void ui.remove('objectives', o.id!, `Objetivo “${o.title}”`),
                }} />
              </div>
              <div className="ring"><Ring pct={objectivePct(o, goals)} color={c} /></div>
              {gs.map((g) => <GoalRow key={g.id} g={g} onEdit={() => setGoalEdit(g)} onRecord={() => setRecord(g)} />)}
              <button className="add-link" onClick={() => setGoalEdit({ objectiveId: o.id, area: o.area })}>+ meta</button>
            </section>
          );
        })}
        {objectives.length === 0 && <section className="card"><Empty action={{ label: '+ Novo objetivo', run: () => setObjEdit({ area: 'academica' }) }}>Comece criando um objetivo: a direção que você quer dar à vida.</Empty></section>}
      </div>

      {loose.length > 0 && (
        <Card title="Metas das áreas">
          <div className="grid g3">{loose.map((g) => <GoalRow key={g.id} g={g} onEdit={() => setGoalEdit(g)} onRecord={() => setRecord(g)} />)}</div>
        </Card>
      )}

      <div className="card row" style={{ flexWrap: 'wrap', padding: '14px 20px' }}>
        <button className="btn gold" onClick={() => setGoalEdit({ area: 'academica' })}>+ Nova meta</button>
        <button className="btn" onClick={() => setObjEdit({ area: 'academica' })}>+ Novo objetivo</button>
        <span className="muted small">objetivo &gt; métrica (valor, páginas, horas, tarefas ou frequência) &gt; valor inicial &gt; alvo &gt; prazo &gt; área</span>
      </div>

      {goalEdit && <Modal title={goalEdit.id ? 'Editar meta' : 'Nova meta'} onClose={() => setGoalEdit(null)}><GoalForm g={goalEdit} onDone={() => setGoalEdit(null)} /></Modal>}
      {objEdit && <Modal title={objEdit.id ? 'Editar objetivo' : 'Novo objetivo'} onClose={() => setObjEdit(null)}><ObjectiveForm o={objEdit} onDone={() => setObjEdit(null)} /></Modal>}
      {record && <Modal title={`${record.byTasks ? "Tarefas" : "Registrar"} · ${record.title}`} onClose={() => setRecord(null)}><RecordForm g={record} onDone={() => setRecord(null)} /></Modal>}
    </Page>
  );
}

export function GoalRow({ g, onEdit, onRecord }: { g: Goal; onEdit: () => void; onRecord: () => void }) {
  const p = goalPct(g);
  const c = AREA[g.area].color;
  return (
    <div className="metric" style={{ '--c': c } as React.CSSProperties}>
      <div className="row">
        <button style={{ cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={onEdit} className="plain grow">{goalLabel(g)}</button>
        <button className="icon-btn" title={g.byTasks ? "Tarefas desta meta" : "Registrar valor real"} aria-label={g.byTasks ? `Tarefas de ${g.title}` : `Registrar valor de ${g.title}`} onClick={onRecord} style={{ padding: 2, color: c }}>+</button>
        <b>{p}%</b>
      </div>
      <Bar pct={p} color={c} />
    </div>
  );
}

/**
 * Meta = um resultado que se mede pelas TAREFAS ligadas a ela: progresso = concluídas ÷ total.
 * Não há alvo nem valores inicial/final para preencher: ligue tarefas (ou crie aqui) e o progresso anda sozinho.
 */
function GoalForm({ g, onDone }: { g: Partial<Goal>; onDone: () => void }) {
  const { objectives, tasks } = useData();
  const ui = useUI();
  const [f, setF] = useState<Partial<Goal>>({ ...g });
  const set = (p: Partial<Goal>) => setF((o) => ({ ...o, ...p }));
  const area = f.area ?? 'academica';
  const linkedBefore = tasks.filter((t) => g.id != null && t.goalId === g.id && !t.repeatDays?.length);
  const [linked, setLinked] = useState<Set<number>>(() => new Set(linkedBefore.map((t) => t.id!)));
  const [news, setNews] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const candidates = tasks.filter((t) => !t.repeatDays?.length && !t.freelanceEntryId && (t.goalId == null || t.goalId === g.id)
    && (t.area === area || linked.has(t.id!)) && (t.status !== 'concluido' || linked.has(t.id!)));
  const chosen = tasks.filter((t) => linked.has(t.id!));
  const done = chosen.filter((t) => t.status === 'concluido').length;
  const total = chosen.length + news.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const wasByValues = g.id != null && !g.byTasks && !linkedBefore.length;

  function addNew() {
    const t = draft.trim();
    if (!t) return;
    setNews((n) => [...n, t]);
    setDraft('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.title?.trim()) return;
    const rec = {
      ...f, title: f.title.trim(), area, byTasks: true, metric: 'tarefas', unit: 'tarefas', initial: 0, current: done, target: total,
    } as Goal;
    await db.transaction('rw', db.goals, db.tasks, async () => {
      const id = rec.id ?? ((await db.goals.add(rec)) as number);
      if (rec.id) await db.goals.put(rec);
      for (const t of tasks) {
        const want = linked.has(t.id!);
        if (want && t.goalId !== id) await db.tasks.update(t.id!, { goalId: id });
        if (!want && t.goalId === id) await db.tasks.update(t.id!, { goalId: undefined });
      }
      for (const title of news) await db.tasks.add({ title, area, status: 'afazer', priority: 'media', goalId: id });
    });
    if (news.length) ui.toast(`${news.length} ${news.length === 1 ? 'tarefa criada' : 'tarefas criadas'} no backlog do Planejamento, ligada${news.length === 1 ? '' : 's'} à meta.`);
    onDone();
  }

  return (
    <form className="form" onSubmit={save}>
      <label className="field"><span>Meta</span><input autoFocus required value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Ler 3 livros do curso" /></label>
      <div className="cols">
        <label className="field"><span>Objetivo</span>
          <select value={f.objectiveId ?? ''} onChange={(e) => set({ objectiveId: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">— só da área —</option>
            {objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </label>
        <label className="field"><span>Área</span>
          <select value={area} onChange={(e) => set({ area: e.target.value as AreaId })}>{AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
      </div>

      <div className="field"><span>Tarefas desta meta</span>
        <p className="hint" style={{ margin: 0 }}>O progresso é a parte das tarefas que você já concluiu: {done} de {total} = <b>{pct}%</b>.</p>
        {wasByValues && <p className="hint" style={{ margin: 0 }}>Esta meta usava números digitados à mão; ao salvar, ela passa a andar pelas tarefas.</p>}
        <div className="goal-tasks">
          {candidates.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={linked.has(t.id!)} onChange={(e) => setLinked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(t.id!); else n.delete(t.id!); return n; })} />
              <span className="grow">{t.title}</span>
              {t.status === 'concluido' && <span className="tag ok">concluída</span>}
            </label>
          ))}
          {news.map((t, i) => (
            <label key={`n${i}`} className="check"><input type="checkbox" checked onChange={() => setNews((n) => n.filter((_, j) => j !== i))} /> <span className="grow">{t}</span><span className="tag info">nova</span></label>
          ))}
          {candidates.length === 0 && news.length === 0 && <span className="muted small">Nenhuma tarefa aberta nesta área. Crie a primeira abaixo.</span>}
        </div>
        <div className="row">
          <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nova tarefa para esta meta"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } }} aria-label="Nova tarefa para esta meta" />
          <button type="button" className="btn out" onClick={addNew}>Adicionar</button>
        </div>
      </div>

      <div className="cols">
        <label className="field"><span>Prazo</span><input type="date" value={f.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || undefined })} /></label>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={!!f.kpi} onChange={(e) => set({ kpi: e.target.checked })} /> Mostrar no topo do painel da área</label>
      </div>
      <div className="actions">
        <button className="btn gold">Salvar</button>
        <button className="btn" type="button" onClick={onDone}>Cancelar</button>
        {f.id && <button className="btn danger" type="button" style={{ marginLeft: 'auto' }} onClick={async () => { onDone(); await ui.remove('goals', f.id!, `Meta “${f.title}”`); }}><Icon name="trash" size={14} /> Excluir</button>}
      </div>
    </form>
  );
}

function ObjectiveForm({ o, onDone }: { o: Partial<Objective>; onDone: () => void }) {
  const ui = useUI();
  const [f, setF] = useState<Partial<Objective>>({ subtitle: '', ...o });
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.title?.trim()) return;
    const rec = { ...f, title: f.title.trim() } as Objective;
    if (rec.id) await db.objectives.put(rec); else await db.objectives.add(rec);
    onDone();
  }
  return (
    <form className="form" onSubmit={save}>
      <label className="field"><span>Objetivo</span><input autoFocus required value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Estabilidade financeira" /></label>
      <label className="field"><span>Como saber que chegou lá</span><input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} placeholder="R$ 6.000 até jun/2027" /></label>
      <label className="field"><span>Área</span>
        <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as AreaId })}>{AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </label>
      <div className="actions">
        <button className="btn gold">Salvar</button>
        <button className="btn" type="button" onClick={onDone}>Cancelar</button>
        {f.id && <button className="btn danger" type="button" style={{ marginLeft: 'auto' }} onClick={async () => {
          onDone();
          await ui.remove('objectives', f.id!, `Objetivo “${f.title}”`);
        }}><Icon name="trash" size={14} /> Excluir</button>}
      </div>
    </form>
  );
}

export function RecordForm({ g, onDone }: { g: Goal; onDone: () => void }) {
  const ui = useUI();
  const { tasks } = useData();
  if (g.byTasks) return <GoalTasks g={g} tasks={tasks} onDone={onDone} openTask={ui.openTask} />;
  return <ValueRecordForm g={g} onDone={onDone} />;
}

/** meta pelas tarefas: mostra as tarefas ligadas e cria uma nova já ligada */
function GoalTasks({ g, tasks, onDone, openTask }: { g: Goal; tasks: Task[]; onDone: () => void; openTask: (t?: Partial<Task>) => void }) {
  const list = tasks.filter((t) => t.goalId === g.id && !t.repeatDays?.length);
  return (
    <div className="form">
      <p className="muted" style={{ margin: 0 }}>Progresso: <b>{g.current} de {g.target}</b> tarefas concluídas ({goalPct(g)}%).</p>
      <div className="goal-tasks">
        {list.map((t) => (
          <div key={t.id} className="row small">
            <span className="dotc" style={{ background: t.status === 'concluido' ? 'var(--ok)' : 'var(--line-2)' }} />
            <button type="button" className="plain grow" onClick={() => { onDone(); openTask(t); }}>{t.title}</button>
            <span className="muted">{t.status === 'concluido' ? 'concluída' : t.status === 'adiada' ? 'adiada' : 'aberta'}</span>
          </div>
        ))}
        {list.length === 0 && <span className="muted small">Nenhuma tarefa ligada ainda.</span>}
      </div>
      <div className="actions">
        <button className="btn gold" type="button" onClick={() => { onDone(); openTask({ goalId: g.id, area: g.area }); }}>+ Tarefa para esta meta</button>
        <button className="btn" type="button" onClick={onDone}>Fechar</button>
      </div>
    </div>
  );
}

/** metas antigas, ainda sem tarefas ligadas: registro de valor (como antes) */
function ValueRecordForm({ g, onDone }: { g: Goal; onDone: () => void }) {
  const ui = useUI();
  const [v, setV] = useState('');
  const [note, setNote] = useState('');
  const absolute = g.metric === 'nota' || g.metric === 'horas';
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault();
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      if (absolute) await db.goals.update(g.id!, { current: n });
      else await addRecord(g.id!, n, note || undefined);
      ui.toast('Registro salvo, progresso atualizado.');
      onDone();
    }}>
      <p className="muted" style={{ margin: 0 }}>Atual: <b>{fmtGoal(g.current)}</b> de {fmtGoal(g.target)} {g.unit ?? ''}</p>
      <label className="field"><span>{absolute ? 'Novo valor' : 'Quanto você fez agora (soma ao atual)'}</span>
        <input autoFocus type="number" step="any" required value={v} onChange={(e) => setV(e.target.value)} placeholder={g.metric === 'páginas' ? '25' : g.metric === 'valor' ? '300' : '1'} />
      </label>
      {!absolute && <label className="field"><span>Nota (opcional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="li 25 págs" /></label>}
      <div className="actions"><button className="btn gold">Registrar</button><button className="btn" type="button" onClick={onDone}>Cancelar</button></div>
    </form>
  );
}
