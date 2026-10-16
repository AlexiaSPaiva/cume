import { useState } from 'react';
import { ddmm, today } from '../lib/dates';
import { db } from '../lib/db';
import { isWeekly, toggleOccurrence } from '../lib/recurring';
import { moveTask } from '../lib/tasks';
import type { Task } from '../lib/types';

/**
 * Faixa no topo da janela da tarefa: concluir com um toque, sem precisar editar.
 * Tarefa semanal: marca só o dia clicado (na Agenda) ou hoje. Tarefa comum: vai para Concluídas.
 * Bloco com ponto (expediente): registra chegada e saída reais daquele dia.
 */
export function QuickDone({ task, day, onDone }: { task: Task; day?: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const weekly = isWeekly(task);
  const d = day ?? today();
  const when = d === today() ? 'hoje' : ddmm(d);
  const done = weekly ? !!task.doneDates?.includes(d) : task.status === 'concluido';
  const label = weekly
    ? (done ? `Desmarcar ${when}` : `Concluir ${d === today() ? 'hoje' : `em ${when}`}`)
    : (done ? 'Reabrir tarefa' : 'Concluir tarefa');
  const punch = task.punches?.[d] ?? {};
  const [pin, setPin] = useState(punch.in ?? '');
  const [pout, setPout] = useState(punch.out ?? '');

  async function run() {
    setBusy(true);
    if (weekly) await toggleOccurrence(task.id!, d);
    else await moveTask(task.id!, done ? 'afazer' : 'concluido');
    onDone();
  }

  async function savePunch() {
    setBusy(true);
    const cur = await db.tasks.get(task.id!);
    const punches = { ...(cur?.punches ?? {}) };
    if (pin || pout) punches[d] = { in: pin || undefined, out: pout || undefined };
    else delete punches[d];
    // registrar o ponto conta como dia cumprido
    const doneDates = pin && !cur?.doneDates?.includes(d) ? [...(cur?.doneDates ?? []), d].sort() : cur?.doneDates;
    await db.tasks.update(task.id!, { punches, doneDates });
    onDone();
  }

  if (weekly && task.clock) {
    return (
      <div className="quick-done punch">
        <b className="small">Ponto de {when}</b>
        <label className="field"><span>Chegada real</span><input type="time" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
        <label className="field"><span>Saída real</span><input type="time" value={pout} onChange={(e) => setPout(e.target.value)} /></label>
        <button className="btn gold" onClick={savePunch} disabled={busy}>✓ Salvar ponto</button>
        <span className="small muted">planejado {task.start}{task.durationMin ? ` · ${Math.round(task.durationMin / 60 * 10) / 10}h` : ''}</span>
      </div>
    );
  }

  return (
    <div className="quick-done">
      <button className={`btn ${done ? 'out' : 'gold'}`} onClick={run} disabled={busy}>
        {done ? '↺' : '✓'} {label}
      </button>
      {done && <span className="small muted">{weekly ? 'feita neste dia' : 'concluída'}</span>}
    </div>
  );
}
