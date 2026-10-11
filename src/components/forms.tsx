import { useMemo, useRef, useState, type FormEvent } from 'react';
import { db } from '../lib/db';
import { useFormModel } from '../lib/drafts';
import { addFileAttachment, addLinkAttachment } from '../lib/attachments';
import { AREAS, AREA } from '../lib/areas';
import { addDays, ddmm, DOW_LONG, DOW_SHORT, dur, fromMin, toMin, today } from '../lib/dates';
import { similarCount, type RecurringSuggestion } from '../lib/recurrence';
import { useData } from '../lib/data';
import type { AreaId, DocType, Goal, Imprevisto, ImprevistoType, Priority, Task, TaskStatus, VaultDoc } from '../lib/types';
import { AreaDot, Icon } from './ui';
import { useUI } from './Overlays';
import { postponeTask } from '../lib/tasks';
import { weeklyProgress } from '../lib/recurring';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  afazer: 'A fazer', hoje: 'Hoje', andamento: 'Em andamento', aguardando: 'Aguardando', concluido: 'Concluído', adiada: 'Adiada',
};

const IMP_TYPES: ImprevistoType[] = ['Trabalho', 'Saúde', 'Burocracia', 'Infraestrutura', 'Família', 'Transporte', 'Outro'];
const DOC_TYPES: DocType[] = ['Documento', 'Comprovante', 'Contrato', 'Imposto', 'Outro'];

function AreaSelect({ value, onChange }: { value: AreaId; onChange: (a: AreaId) => void }) {
  return (
    <label className="field"><span>Área</span>
      <select value={value} onChange={(e) => onChange(e.target.value as AreaId)}>
        {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------ tarefa */

/** "salvo às HH:MM" (rascunho ou registro) */
export function SavedNote({ at, draft }: { at?: string; draft?: boolean }) {
  if (!at) return null;
  return <span className="hint" role="status">{draft ? 'rascunho salvo' : 'salvo'} às {at}</span>;
}

function normalizeTask(t: Partial<Task>): Task {
  return {
    ...(t as Task),
    title: (t.title ?? '').trim(),
    date: t.date || undefined,
    start: t.start || undefined,
    deadline: t.deadline || undefined,
    repeatUntil: t.repeatDays?.length ? t.repeatUntil || undefined : undefined,
    durationMin: t.durationMin ? Number(t.durationMin) : undefined,
    doneAt: t.status === 'concluido' ? (t.doneAt ?? today()) : undefined,
    progress: t.status === 'concluido' ? 100 : t.progress,
  };
}

export function TaskForm({ task, onDone }: { task?: Partial<Task>; onDone: () => void }) {
  const { goals } = useData();
  const ui = useUI();
  const editing = !!task?.id;
  const draftKey = `task:new:${task?.date ?? ''}:${task?.status ?? ''}`;
  const model = useFormModel<Partial<Task>>(draftKey, { area: 'academica', priority: 'media', status: 'afazer', ...task },
    editing ? async (v) => { if (v.title?.trim()) await db.tasks.put(normalizeTask(v)); } : undefined);
  const t = model.value;
  const set = model.set;
  const repeating = !!t.repeatDays?.length;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!t.title?.trim()) return;
    if (!editing) {
      await db.tasks.add(normalizeTask(t));
      await model.clear();
    }
    onDone();
  }

  async function discard() {
    await model.clear();
    onDone();
  }

  async function remove() {
    if (!t.id) return;
    onDone();
    await ui.remove('tasks', t.id, `“${t.title}”`);
  }

  return (
    <form className="form" onSubmit={save}>
      <label className="field"><span>O que fazer</span>
        <input autoFocus required value={t.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Estudar Matemática" />
      </label>
      <div className="cols">
        <AreaSelect value={t.area as AreaId} onChange={(area) => set({ area })} />
        <label className="field"><span>Prioridade</span>
          <select value={t.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
            <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </select>
        </label>
      </div>
      <div className="cols">
        <label className="field"><span>Situação</span>
          <select value={t.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Prazo final</span>
          <input type="date" value={t.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value })} />
        </label>
      </div>
      <div className="cols" style={{ '--c': 3 } as React.CSSProperties}>
        <label className="field"><span>{repeating ? 'A partir de' : 'Dia'}</span>
          <input type="date" value={t.date ?? ''} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field"><span>Início</span>
          <input type="time" value={t.start ?? ''} onChange={(e) => set({ start: e.target.value })} />
        </label>
        <label className="field"><span>Duração (min)</span>
          <input type="number" min={5} step={5} value={t.durationMin ?? ''} onChange={(e) => set({ durationMin: Number(e.target.value) || undefined })} />
        </label>
      </div>
      <div className="field"><span>Repetir toda semana</span>
        <div className="actions">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = t.repeatDays?.includes(d);
            return (
              <button key={d} type="button" className={`btn sm ${on ? 'gold' : ''}`}
                onClick={() => set({ repeatDays: on ? t.repeatDays!.filter((x) => x !== d) : [...(t.repeatDays ?? []), d] })}>
                {DOW_SHORT[d]}
              </button>
            );
          })}
        </div>
      </div>
      {repeating && (
        <div className="cols">
          <label className="field"><span>Repetir até</span>
            <input type="date" value={t.repeatUntil ?? ''} min={t.date || undefined} onChange={(e) => set({ repeatUntil: e.target.value || undefined })} />
          </label>
          <RepeatHint t={t} goal={goals.find((g) => g.id === t.goalId)} />
        </div>
      )}
      {(t.status === 'andamento' || (t.progress ?? 0) > 0) && (
        <label className="field"><span>Progresso · {t.progress ?? 0}%</span>
          <input type="range" min={0} max={100} step={5} value={t.progress ?? 0} onChange={(e) => set({ progress: Number(e.target.value) })} />
        </label>
      )}
      {goals.length > 0 && (
        <label className="field"><span>Avança a meta (opcional)</span>
          <select value={t.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">—</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title} · {AREA[g.area].name}</option>)}
          </select>
        </label>
      )}
      <label className="check"><input type="checkbox" checked={!!t.soft} onChange={(e) => set({ soft: e.target.checked })} /> Bloco livre / descanso (aparece tracejado)</label>
      <div className="actions" style={{ alignItems: 'center' }}>
        <button className="btn gold" type="submit">{editing ? 'Pronto' : 'Criar tarefa'}</button>
        {!editing && <button className="btn" type="button" onClick={discard}>{model.hasDraft ? 'Descartar rascunho' : 'Cancelar'}</button>}
        <SavedNote at={model.savedAt} draft={!editing} />
        {editing && <button className="btn danger" type="button" style={{ marginLeft: 'auto' }} onClick={remove}><Icon name="trash" size={14} /> Excluir</button>}
      </div>
    </form>
  );
}

/** quantos dias a tarefa semanal soma até o fim (é isso que conta na meta) */
function RepeatHint({ t, goal }: { t: Partial<Task>; goal?: Goal }) {
  const task = { createdAt: new Date().toISOString(), ...t } as Task;
  const end = t.repeatUntil ?? goal?.deadline;
  if (!end) return <p className="hint" style={{ alignSelf: 'end', margin: 0 }}>Sem data final, repete sempre (blocos fixos como trabalho).</p>;
  const p = weeklyProgress(task, goal);
  return (
    <p className="hint" style={{ alignSelf: 'end', margin: 0 }}>
      {p.total} {p.total === 1 ? 'dia' : 'dias'} até {ddmm(end)}{t.repeatUntil ? '' : ' (prazo da meta)'}{p.done ? ` · ${p.done} feitos` : ''}.
      {t.goalId ? ' Cada dia feito avança a meta.' : ''}
    </p>
  );
}

/* --------------------------------------------------------------- imprevisto */

export function ImprevistoForm({ initial, onDone, onSaved, compact }: {
  initial?: Partial<Imprevisto>;
  onDone?: () => void;
  onSaved?: (imp: Imprevisto, becameRecurring: boolean) => void;
  compact?: boolean;
}) {
  const { tasks, imprevistos, settings } = useData();
  const now = new Date();
  const blank = (): Partial<Imprevisto> => ({
    area: 'profissional', type: 'Trabalho', date: today(),
    start: fromMin(Math.max(0, now.getHours() * 60 - 60)), end: fromMin(now.getHours() * 60), postponedTasks: false,
  });
  const ui = useUI();
  const editing = !!initial?.id;
  const model = useFormModel<Partial<Imprevisto>>('imp:new', { ...blank(), postponedTaskIds: [], ...initial },
    editing ? async (v) => { if (v.title?.trim()) await persist(v); } : undefined);
  const f = model.value;
  const set = model.set;
  const postpone = f.postponedTaskIds ?? [];
  const setPostpone = (fn: (p: number[]) => number[]) => set({ postponedTaskIds: fn(postpone) });

  const duration = f.start && f.end ? toMin(f.end) - toMin(f.start) : 0;
  const similar = useMemo(
    () => (f.title && f.area ? similarCount(f.title, f.area, imprevistos.filter((i) => i.id !== f.id)) : 0),
    [f.title, f.area, f.id, imprevistos],
  );

  // tarefas daquele dia que podem ter sido atrapalhadas
  const dayTasks = tasks.filter((t) => t.date === f.date && !t.repeatDays?.length && t.status !== 'concluido');

  async function persist(v: Partial<Imprevisto>): Promise<Imprevisto> {
    const dm = v.start && v.end ? toMin(v.end) - toMin(v.start) : 0;
    const rec: Imprevisto = {
      ...(v as Imprevisto),
      title: (v.title ?? '').trim(),
      durationMin: Math.max(0, dm),
      postponedTasks: !!v.postponedTasks,
      postponedTaskIds: v.postponedTasks ? v.postponedTaskIds ?? [] : [],
    };
    if (rec.id) await db.imprevistos.put(rec);
    else rec.id = await db.imprevistos.add(rec);
    if (rec.postponedTasks) {
      // motivo do adiamento = este imprevisto (aparece em Tarefas → Adiadas)
      for (const id of rec.postponedTaskIds ?? []) await postponeTask(id, { text: rec.title, imprevistoId: rec.id });
    }
    return rec;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.title?.trim() || duration <= 0) return;
    if (editing) { onDone?.(); return; }
    const rec = await persist(f);
    await model.clear();
    onSaved?.(rec, similar + 1 >= settings.recurrenceThreshold);
    model.reset({ ...blank(), postponedTaskIds: [] });
    onDone?.();
  }

  async function discard() {
    await model.clear();
    model.reset({ ...blank(), postponedTaskIds: [] });
    onDone?.();
  }

  async function remove() {
    if (!f.id) return;
    onDone?.();
    await ui.remove('imprevistos', f.id, `Imprevisto “${f.title}”`);
  }

  return (
    <form className="form" onSubmit={save}>
      <label className="field"><span>O que aconteceu</span>
        <input autoFocus={!compact} required value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Reunião extra na Antena 1" />
      </label>
      {similar > 0 && (
        <div className="hint" style={{ color: similar + 1 >= settings.recurrenceThreshold ? 'var(--imp)' : undefined }}>
          <Icon name="repeat" size={12} /> Já aconteceu {similar}x nos últimos 30 dias
          {similar + 1 >= settings.recurrenceThreshold ? ', e com este vira recorrente. Vou sugerir reservar tempo para ele.' : '.'}
        </div>
      )}
      <div className="cols">
        <AreaSelect value={f.area as AreaId} onChange={(area) => set({ area })} />
        <label className="field"><span>Tipo</span>
          <select value={f.type} onChange={(e) => set({ type: e.target.value as ImprevistoType })}>
            {IMP_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>O que demandou de mim</span>
        <input value={f.demand ?? ''} onChange={(e) => set({ demand: e.target.value })} placeholder="Ex.: Refazer a entrega do sprint" />
      </label>
      <div className="cols" style={{ '--c': 3 } as React.CSSProperties}>
        <label className="field"><span>Data</span><input type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="field"><span>Início</span><input type="time" required value={f.start} onChange={(e) => set({ start: e.target.value })} /></label>
        <label className="field"><span>Fim</span><input type="time" required value={f.end} onChange={(e) => set({ end: e.target.value })} /></label>
      </div>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        <div className="input" style={{ width: 'auto', color: duration > 0 ? undefined : 'var(--bad)' }}>
          {duration > 0 ? `${dur(duration)} (automática)` : 'o fim precisa ser depois do início'}
        </div>
        <label className="check"><input type="checkbox" checked={!!f.postponedTasks} onChange={(e) => set({ postponedTasks: e.target.checked })} /> Adiou tarefas</label>
      </div>
      {f.postponedTasks && (
        <div className="field"><span>Quais tarefas foram adiadas?</span>
          {dayTasks.length === 0 && <div className="hint">Nenhuma tarefa planejada nesse dia.</div>}
          {dayTasks.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={postpone.includes(t.id!)}
                onChange={(e) => setPostpone((p) => (e.target.checked ? [...p, t.id!] : p.filter((x) => x !== t.id)))} />
              <AreaDot area={t.area} /> {t.start && <b>{t.start}</b>} {t.title}
            </label>
          ))}
        </div>
      )}
      <div className="actions" style={{ alignItems: 'center' }}>
        <button className="btn imp" type="submit">{editing ? 'Pronto' : 'Salvar imprevisto'}</button>
        {!editing && (onDone || model.hasDraft) && <button className="btn" type="button" onClick={discard}>{model.hasDraft ? 'Descartar rascunho' : 'Cancelar'}</button>}
        <SavedNote at={model.savedAt} draft={!editing} />
        {editing && <button className="btn danger" type="button" style={{ marginLeft: 'auto' }} onClick={remove}><Icon name="trash" size={14} /> Excluir</button>}
      </div>
    </form>
  );
}

/* ------------------------------------------------------- sugestão recorrente */

export function SuggestionForm({ s, onDone }: { s: RecurringSuggestion; onDone: (msg?: string) => void }) {
  const [title, setTitle] = useState(`Reserva · ${s.label}`);
  const [weekday, setWeekday] = useState(s.weekday);
  const [start, setStart] = useState(s.start);
  const [minutes, setMinutes] = useState(s.avgMin);

  async function accept(e: FormEvent) {
    e.preventDefault();
    const taskId = await db.tasks.add({
      title, area: s.area, status: 'afazer', priority: 'media', date: today(), start, durationMin: minutes,
      repeatDays: [weekday], bufferFor: s.key, createdAt: new Date().toISOString(),
    });
    await db.suggestions.put({ key: s.key, status: 'aceita', taskId });
    onDone(`Reserva criada: ${DOW_LONG[weekday]} às ${start}, ${dur(minutes)}. Já aparece na Agenda e no Planejamento.`);
  }

  async function dismiss() {
    await db.suggestions.put({ key: s.key, status: 'dispensada', until: addDays(today(), 30) });
    onDone('Ok, não vou sugerir isso pelos próximos 30 dias.');
  }

  return (
    <form className="form" onSubmit={accept}>
      <p className="muted" style={{ margin: 0 }}>
        <b style={{ color: 'var(--text)' }}>{s.label}</b> aconteceu <b style={{ color: 'var(--imp)' }}>{s.count}x</b> nos últimos 30 dias,
        somando {dur(s.totalMin)}{s.weekdayStrong ? `, quase sempre às ${DOW_LONG[s.weekday]}s` : ''}. Em vez de ser pega de surpresa,
        reserve um bloco fixo para ele no seu planejamento. Se ele não acontecer, o tempo vira folga.
      </p>
      <div className="list small">
        {s.occurrences.slice(-5).reverse().map((o) => (
          <div key={o.id} className="row"><span className="dotc" style={{ background: 'var(--imp)' }} />
            <span className="grow">{o.title}</span><span className="muted">{DOW_SHORT[new Date(o.date + 'T12:00').getDay()]} {o.date.slice(8)}/{o.date.slice(5, 7)} · {o.start}</span><b>{dur(o.durationMin)}</b>
          </div>
        ))}
      </div>
      <label className="field"><span>Nome do bloco</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="cols" style={{ '--c': 3 } as React.CSSProperties}>
        <label className="field"><span>Toda</span>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{DOW_LONG[d]}</option>)}
          </select>
        </label>
        <label className="field"><span>Às</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field"><span>Duração (min)</span><input type="number" min={15} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>
      </div>
      <div className="actions">
        <button className="btn gold" type="submit">Incluir no planejamento</button>
        <button className="btn" type="button" onClick={dismiss}>Agora não</button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- documento */

export function isDriveUrl(u: string): boolean {
  try {
    const url = new URL(u.trim());
    return url.protocol === 'https:' && /(^|\.)(drive|docs)\.google\.com$/.test(url.hostname);
  } catch {
    return false;
  }
}

interface DocDraft {
  mode: 'arquivo' | 'drive';
  url?: string;
  name?: string;
  type: DocType;
  date?: string;
  linkedTo?: string;
  value?: number;
  remind?: boolean;
  renewDate?: string;
}

/**
 * Novo documento no Cofre. O arquivo vai para `blobs` (IndexedDB) e os metadados para um Attachment
 * ligado ao documento; o link do Drive também vira um Attachment (kind 'link').
 * Os campos ficam em rascunho até guardar; o arquivo escolhido precisa ser escolhido de novo se a página recarregar.
 */
export function DocForm({ onDone, initial }: { onDone: (msg?: string) => void; initial?: Partial<VaultDoc> }) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const model = useFormModel<DocDraft>(`doc:new:${initial?.linkedTo ?? ''}`, {
    mode: initial?.storage ?? 'arquivo', type: 'Comprovante', date: today(),
    ...(initial?.name ? { name: initial.name } : {}), ...(initial?.type ? { type: initial.type } : {}), ...(initial?.linkedTo ? { linkedTo: initial.linkedTo } : {}),
  });
  const f = model.value;
  const set = model.set;

  function pick(fl: File | undefined) {
    if (!fl) return;
    if (fl.size > 20 * 1024 * 1024) return setErr('O arquivo passa de 20 MB.');
    if (!/pdf|jpe?g|png|webp/i.test(fl.type)) return setErr('Use PDF, JPG ou PNG.');
    setErr('');
    setFile(fl);
    if (!f.name) set({ name: fl.name });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (f.mode === 'arquivo' && !file) return setErr('Escolha um arquivo.');
    if (f.mode === 'drive' && !isDriveUrl(f.url ?? '')) return setErr('Cole um link do Google Drive (drive.google.com ou docs.google.com).');
    if (!f.name?.trim()) return setErr('Dê um nome ao documento.');
    setBusy(true);
    try {
      const name = f.name.trim();
      await db.transaction('rw', [db.docs, db.attachments, db.blobs, db.events], async () => {
        const docId = (await db.docs.add({
          name, type: f.type, date: f.date || undefined, linkedTo: f.linkedTo || undefined, value: f.value ? Number(f.value) : undefined,
          remind: f.remind, renewDate: f.remind ? f.renewDate : undefined, storage: f.mode,
        })) as number;
        const owner = { type: 'doc', id: docId };
        const kind = f.type === 'Comprovante' ? 'receipt' : 'file';
        const attachmentId = f.mode === 'arquivo'
          ? await addFileAttachment(owner, kind, file!, { name })
          : await addLinkAttachment(owner, 'link', f.url!.trim(), name);
        await db.docs.update(docId, { attachmentId });
        if (f.remind && f.renewDate) {
          await db.events.add({ title: `Renovar ${name.replace(/\.\w+$/, '')}`, date: f.renewDate, area: 'adultices', kind: 'vencimento', source: 'local' });
        }
      });
      await model.clear();
      onDone(f.mode === 'drive' ? 'Link do Drive guardado no cofre.' : 'Documento guardado no cofre.');
    } catch (ex) {
      setErr(`Não consegui guardar: ${(ex as Error).message}. Nada foi perdido; tente de novo.`);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    await model.clear();
    onDone();
  }

  return (
    <form className="form" onSubmit={save}>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={f.mode === 'arquivo'} className={f.mode === 'arquivo' ? 'on' : ''} onClick={() => set({ mode: 'arquivo' })}><Icon name="file" size={13} /> Enviar arquivo</button>
        <button type="button" role="tab" aria-selected={f.mode === 'drive'} className={f.mode === 'drive' ? 'on' : ''} onClick={() => set({ mode: 'drive' })}><Icon name="drive" size={13} /> Link do Google Drive</button>
      </div>
      {f.mode === 'arquivo' ? (
        <div className={`dropzone ${over ? 'over' : ''}`} onClick={() => input.current?.click()} role="button" tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
          <div className="up"><Icon name="up" /></div>
          <b>{file ? file.name : 'Arraste o arquivo aqui'}</b>
          <span className="muted small">ou escolha no computador</span>
          <span className="faint small">PDF, JPG ou PNG · até 20 MB</span>
          <input ref={input} type="file" hidden accept=".pdf,image/png,image/jpeg,image/webp" data-testid="doc-file" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      ) : (
        <label className="field"><span>Link do Google Drive</span>
          <input type="url" inputMode="url" placeholder="https://drive.google.com/file/d/…" value={f.url ?? ''} onChange={(e) => set({ url: e.target.value })} />
          <span className="hint">O arquivo continua no seu Drive; o cofre guarda o link. No Drive, use “Compartilhar → Copiar link”.</span>
        </label>
      )}
      <label className="field"><span>Nome</span><input value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Comprovante aluguel out.pdf" /></label>
      <div className="cols">
        <label className="field"><span>Tipo</span>
          <select value={f.type} onChange={(e) => set({ type: e.target.value as DocType })}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="field"><span>Data</span><input type="date" value={f.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="field"><span>Vincular a</span><input value={f.linkedTo ?? ''} onChange={(e) => set({ linkedTo: e.target.value })} placeholder="Aluguel, Cartão Nubank…" /></label>
        <label className="field"><span>Valor (opcional)</span><input type="number" step="0.01" min={0} value={f.value ?? ''} onChange={(e) => set({ value: e.target.value ? Number(e.target.value) : undefined })} placeholder="R$" /></label>
      </div>
      <label className="check"><input type="checkbox" checked={!!f.remind} onChange={(e) => set({ remind: e.target.checked })} /> Lembrar de renovar este documento</label>
      {f.remind && <label className="field"><span>Renovar em</span><input type="date" value={f.renewDate ?? ''} onChange={(e) => set({ renewDate: e.target.value })} /></label>}
      {err && <div className="err" role="alert">{err}</div>}
      <div className="actions" style={{ alignItems: 'center' }}>
        <button className="btn gold" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar no cofre'}</button>
        <button className="btn" type="button" onClick={discard}>{model.hasDraft ? 'Descartar rascunho' : 'Cancelar'}</button>
        <SavedNote at={model.savedAt} draft />
      </div>
    </form>
  );
}
