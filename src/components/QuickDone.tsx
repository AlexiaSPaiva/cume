import { useState } from 'react';
import { ddmm, today } from '../lib/dates';
import { isWeekly, toggleOccurrence } from '../lib/recurring';
import { moveTask } from '../lib/tasks';
import type { Task } from '../lib/types';

/**
 * Faixa no topo da janela da tarefa: concluir com um toque, sem precisar editar.
 * Tarefa semanal: marca só o dia clicado (na Agenda) ou hoje. Tarefa comum: vai para Concluídas.
 */
export function QuickDone({ task, day, onDone }: { task: Task; day?: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const weekly = isWeekly(task);
  const d = day ?? today();
  const done = weekly ? !!task.doneDates?.includes(d) : task.status === 'concluido';
  const label = weekly
    ? (done ? `Desmarcar ${d === today() ? 'hoje' : ddmm(d)}` : `Concluir ${d === today() ? 'hoje' : `em ${ddmm(d)}`}`)
    : (done ? 'Reabrir tarefa' : 'Concluir tarefa');

  async function run() {
    setBusy(true);
    if (weekly) await toggleOccurrence(task.id!, d);
    else await moveTask(task.id!, done ? 'afazer' : 'concluido');
    onDone();
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
