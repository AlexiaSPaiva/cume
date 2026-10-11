import { useMemo, useState, type FormEvent } from 'react';
import { AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { addDays, ddmm, DOW_SHORT, dur, parse, today, weekStart } from '../lib/dates';
import { freeByDay, postponeTask, rescheduleTask, suggestSlot, type RescheduleTo } from '../lib/tasks';
import type { Task } from '../lib/types';
import { AreaTag } from './ui';
import { askNotify } from '../lib/reminders';

/**
 * Realocar tarefa (p. 5 da v7): a MESMA tarefa vai para um dia e horário, para o Planejamento
 * da semana que vem ou para o backlog. Mostra as horas livres da semana e sugere um horário.
 */
export function RescheduleForm({ task, onDone, onDelete }: { task: Task; onDone: (msg?: string) => void; onDelete: () => void }) {
  const d = useData();
  const sug = useMemo(() => suggestSlot(d, task), [d, task]);
  const [kind, setKind] = useState<RescheduleTo['kind']>('dia');
  const [date, setDate] = useState(sug.date);
  const [start, setStart] = useState(sug.start);
  const [remind, setRemind] = useState(true);
  const [remindMin, setRemindMin] = useState(task.remindMin ?? 15);
  const [split, setSplit] = useState(false);
  const ws = weekStart(date);
  const week = freeByDay(d, ws);
  const goal = task.goalId ? d.goals.find((g) => g.id === task.goalId) : undefined;
  const label = kind === 'dia'
    ? `${DOW_SHORT[parse(date).getDay()].toLowerCase()} ${ddmm(date)}${start ? ` · ${start}` : ''}`
    : kind === 'planejamento' ? 'a semana que vem' : 'o backlog';

  async function save(e: FormEvent) {
    e.preventDefault();
    const to: RescheduleTo = kind === 'dia' ? { kind, date, start: start || undefined } : { kind };
    if (remind && kind === 'dia') askNotify();
    await rescheduleTask(task.id!, to, { remindMin: remind ? remindMin : 0, split: split ? 2 : undefined });
    onDone(`${task.title} realocada para ${label}.`);
  }

  return (
    <form className="form resched" onSubmit={save}>
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <b className="grow" style={{ fontSize: '1.0625rem', whiteSpace: 'normal' }}>{task.title}</b>
        <AreaTag area={task.area} />
        {(task.postponedCount ?? 0) > 0 && <span className="tag bad">adiada {task.postponedCount}x</span>}
      </div>
      <p className="muted small" style={{ margin: '-6px 0 0' }}>
        {task.durationMin ? dur(task.durationMin) : 'sem duração'}{goal ? ` · meta ${goal.title}` : ''} · é a mesma tarefa: histórico{goal ? ' e vínculo com a meta' : ''} continuam
      </p>

      <div className="field"><span className="lab-up">Para onde?</span>
        <div className="seg full" role="radiogroup" aria-label="Para onde">
          {([['dia', 'Um dia e horário'], ['planejamento', 'Planejamento'], ['backlog', 'Backlog']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
      </div>

      {kind === 'dia' && (
        <>
          <div className="field"><span className="lab-up">Horas livres · semana {ddmm(ws)}–{ddmm(addDays(ws, 6))}</span>
            <div className="free-week">
              {week.map((x) => (
                <button key={x.date} type="button" className={`fw ${x.date === date ? 'on' : ''} ${x.date < today() ? 'past' : ''}`}
                  disabled={x.date < today()} onClick={() => setDate(x.date)} aria-label={`${ddmm(x.date)}: ${dur(x.freeMin)} livres`}>
                  <small>{DOW_SHORT[parse(x.date).getDay()][0]}</small><b>{x.date.slice(8)}</b>
                  <span className={x.freeMin < (task.durationMin ?? 30) ? 'bad' : ''}>{x.freeMin ? dur(x.freeMin) : '0h'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="cols">
            <label className="field"><span>Dia</span><input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value || date)} /></label>
            <label className="field"><span>Horário</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          </div>
          <div className="sug">
            Sugestão: <b>{DOW_SHORT[parse(sug.date).getDay()]} {ddmm(sug.date)} · {sug.start}</b>. {sug.why}
            {(sug.date !== date || sug.start !== start) && <button type="button" className="add-link" onClick={() => { setDate(sug.date); setStart(sug.start); }}>usar sugestão</button>}
          </div>
          <label className="check"><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} /> Avisar
            <select className="input sm" value={remindMin} onChange={(e) => setRemindMin(Number(e.target.value))} disabled={!remind} aria-label="Minutos antes">
              {[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select> antes
          </label>
          {(task.durationMin ?? 0) >= 30 && (
            <label className="check"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Quebrar em 2 sessões de {dur(Math.round((task.durationMin ?? 0) / 2))}</label>
          )}
        </>
      )}
      {kind === 'planejamento' && <p className="muted small" style={{ margin: 0 }}>Ela entra no backlog do Planejamento, para você escolher o dia ao planejar a semana que vem.</p>}
      {kind === 'backlog' && <p className="muted small" style={{ margin: 0 }}>Ela fica sem dia, no backlog, até você decidir.</p>}

      <div className="actions">
        <button className="btn gold big" style={{ flex: 1 }}>Realocar para {label}</button>
        <button type="button" className="btn out" onClick={() => onDone()}>Cancelar</button>
      </div>
      <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
        <button type="button" className="add-link danger-link" onClick={onDelete}>Excluir tarefa</button> · vai para a Lixeira por 30 dias
      </p>
    </form>
  );
}

const REASONS = ['Imprevisto', 'Sem tempo', 'Sem energia', 'Perdeu prioridade', 'Esperando alguém'];

/** adiar com motivo (o motivo aparece em Adiadas e alimenta "motivo mais comum") */
export function PostponeForm({ task, onDone }: { task: Task; onDone: (msg?: string) => void }) {
  const d = useData();
  const [reason, setReason] = useState('Sem tempo');
  const [text, setText] = useState('');
  const [imp, setImp] = useState<number | ''>('');
  const recent = d.imprevistos.filter((i) => i.date >= addDays(today(), -7)).sort((a, b) => b.date.localeCompare(a.date));
  async function save(e: FormEvent) {
    e.preventDefault();
    const im = imp ? recent.find((i) => i.id === imp) : undefined;
    await postponeTask(task.id!, { text: im ? im.title : [reason, text.trim()].filter(Boolean).join(': '), imprevistoId: im?.id });
    onDone(`“${task.title}” adiada. Ela está em Tarefas → Adiadas.`);
  }
  return (
    <form className="form" onSubmit={save}>
      <p className="muted small" style={{ margin: 0 }}><b style={{ color: AREA[task.area].color }}>{task.title}</b> vai para Adiadas, com o motivo. Dá para realocar quando quiser.</p>
      <div className="field"><span>Por que adiou?</span>
        <div className="chips" role="radiogroup" aria-label="Motivo">
          {REASONS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => { setReason(r); if (r !== 'Imprevisto') setImp(''); }}>{r}</button>
          ))}
        </div>
      </div>
      {reason === 'Imprevisto' && recent.length > 0 && (
        <label className="field"><span>Qual imprevisto?</span>
          <select value={imp} onChange={(e) => setImp(e.target.value ? Number(e.target.value) : '')}>
            <option value="">nenhum destes</option>
            {recent.map((i) => <option key={i.id} value={i.id}>{ddmm(i.date)} · {i.title}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span>Detalhe (opcional)</span><input value={text} onChange={(e) => setText(e.target.value)} placeholder="ex.: reunião extra" /></label>
      <div className="actions"><button className="btn gold">Adiar</button><button type="button" className="btn out" onClick={() => onDone()}>Cancelar</button></div>
    </form>
  );
}
