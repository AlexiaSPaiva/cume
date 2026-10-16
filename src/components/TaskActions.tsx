import { useState } from 'react';
import { AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, DOW_SHORT, dur, fromMin, parse, toMin, today } from '../lib/dates';
import { isWeekly, toggleOccurrence } from '../lib/recurring';
import { itemMinutes, studyPlan } from '../lib/studyToday';
import { moveTask } from '../lib/tasks';
import type { Task } from '../lib/types';
import { QuickDone } from './QuickDone';

/**
 * Janela curta de uma tarefa (Agenda): o que fazer AGORA com ela — Concluir, Adiar, Realocar, Editar.
 * Bloco de estudo da graduação já mostra a matéria da vez e os itens do dia, para marcar ali mesmo.
 * Numa tarefa que se repete, adiar/realocar mexe só naquele dia.
 */
export function TaskActions({ task, day, onClose, onEdit, onPostpone, onReschedule, toast }: {
  task: Task; day?: string; onClose: () => void; onEdit: () => void; onPostpone: () => void; onReschedule: () => void;
  toast: (m: string) => void;
}) {
  const d = useData();
  const t = d.tasks.find((x) => x.id === task.id) ?? task;
  const when = day ?? t.date ?? today();
  const weekly = isWeekly(t);
  const done = weekly ? !!t.doneDates?.includes(when) : t.status === 'concluido';
  const [moving, setMoving] = useState(false);
  // só os blocos de estudo que se repetem (as entregas da mesma trilha não)
  const plan = weekly ? studyPlan(d, t) : null;
  const special = !!t.clock || d.goals.find((g) => g.id === t.goalId)?.auto === 'pagesToday';
  const end = t.start && t.durationMin ? fromMin(toMin(t.start) + t.durationMin) : undefined;

  async function complete() {
    if (weekly) await toggleOccurrence(t.id!, when);
    else await moveTask(t.id!, done ? 'afazer' : 'concluido');
    toast(done ? 'Desmarcada.' : 'Feito! ✓');
    onClose();
  }

  return (
    <div className="ta">
      <div className="ta-head">
        <span className="dotc" style={{ background: AREA[t.area].color, width: 12, height: 12, marginTop: 5 }} />
        <div className="grow">
          <b className="ta-title">{t.title}</b>
          <span className="muted small">
            {DOW_SHORT[parse(when).getDay()]} {ddmm(when)}{t.start ? ` · ${t.start}${end ? `–${end}` : ''}` : ''} · {AREA[t.area].name}
          </span>
        </div>
        {done && <span className="tag ok">feito</span>}
      </div>

      {plan && (
        <div className="ta-study">
          <div className="row small"><span className="muted">Matéria da vez</span><b>{plan.subject.name}</b><span className="right muted">≈ {dur(plan.minutes)}</span></div>
          <div className="list" style={{ gap: 2 }}>
            {plan.items.map((x) => (
              <label key={x.id} className="check topic-it">
                <input type="checkbox" checked={x.status !== 'todo'} onChange={(e) => db.topics.update(x.id!, { status: e.target.checked ? 'studied' : 'todo' })} />
                <span><span className="muted">{x.section?.split(' – ')[0]}</span> {x.name.split(' · ')[0].replace(/^A\d+\s*[–-]\s*/, '')} <span className="faint">· {itemMinutes(x.name)} min</span></span>
              </label>
            ))}
          </div>
          <span className="faint small">Marque cada item ao terminar; o próximo bloco começa de onde você parou.</span>
        </div>
      )}

      {special && <QuickDone task={t} day={when} onDone={onClose} />}

      {moving ? <MoveDay t={t} day={when} onDone={(m) => { toast(m); onClose(); }} onCancel={() => setMoving(false)} /> : (
        <div className="ta-actions">
          <button className={`btn ${done ? 'out' : 'gold'}`} onClick={complete}>{done ? '↺ Desmarcar' : '✓ Concluir'}</button>
          <button className="btn" onClick={() => (weekly ? setMoving(true) : onPostpone())}>⏸ Adiar</button>
          <button className="btn" onClick={() => (weekly ? setMoving(true) : onReschedule())}>↔ Realocar</button>
          <button className="btn" onClick={onEdit}>✎ Editar</button>
        </div>
      )}
    </div>
  );
}

/** tarefa que se repete: tira só este dia da repetição e cria uma cópia avulsa no dia/horário escolhido */
function MoveDay({ t, day, onDone, onCancel }: { t: Task; day: string; onDone: (m: string) => void; onCancel: () => void }) {
  const t0 = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t0, i));
  const [to, setTo] = useState(addDays(day < t0 ? t0 : day, 1));
  const [start, setStart] = useState(t.start ?? '');
  async function save(skipOnly = false) {
    await db.tasks.update(t.id!, { skipDates: [...new Set([...(t.skipDates ?? []), day])] });
    if (!skipOnly) {
      await db.tasks.add({
        title: t.title, area: t.area, status: 'afazer', priority: t.priority, date: to, start: start || undefined,
        durationMin: t.durationMin, trackId: t.trackId, subjectId: t.subjectId, projectId: t.projectId,
      } as Task);
    }
    onDone(skipOnly ? `Pulado em ${ddmm(day)}.` : `Só ${ddmm(day)} foi para ${DOW_SHORT[parse(to).getDay()]} ${ddmm(to)}${start ? ` às ${start}` : ''}.`);
  }
  return (
    <div className="ta-move">
      <b className="small">Mover só o dia {ddmm(day)} (as outras semanas continuam iguais)</b>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Novo dia">
          {days.map((x) => <option key={x} value={x}>{x === t0 ? 'Hoje' : `${DOW_SHORT[parse(x).getDay()]} ${ddmm(x)}`}</option>)}
        </select>
        <input className="input" style={{ width: 'auto' }} type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Novo horário" />
        <button className="btn gold" onClick={() => save()}>Mover</button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm ghost" onClick={() => save(true)}>só pular este dia</button>
        <button className="btn sm ghost right" onClick={onCancel}>voltar</button>
      </div>
    </div>
  );
}
