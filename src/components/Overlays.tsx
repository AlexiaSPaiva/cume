import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Imprevisto, Task } from '../lib/types';
import type { RecurringSuggestion } from '../lib/recurrence';
import { useData } from '../lib/data';
import { DocForm, ImprevistoForm, SuggestionForm, TaskForm } from './forms';
import { Modal } from './ui';

type Open =
  | { kind: 'task'; task?: Partial<Task> }
  | { kind: 'imp'; imp?: Partial<Imprevisto> }
  | { kind: 'doc' }
  | { kind: 'suggest'; s: RecurringSuggestion }
  | null;

interface UI {
  openTask(task?: Partial<Task>): void;
  openImprevisto(imp?: Partial<Imprevisto>): void;
  openDoc(): void;
  openSuggestion(s: RecurringSuggestion): void;
  toast(msg: string, action?: { label: string; run: () => void }): void;
  /** chamado depois de salvar um imprevisto: avisa se ele virou recorrente */
  afterImprevisto(becameRecurring: boolean): void;
}

const Ctx = createContext<UI | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const [toastMsg, setToast] = useState<{ msg: string; action?: { label: string; run: () => void } } | null>(null);
  const nav = useNavigate();
  const { suggestions } = useData();

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToast(null), toastMsg.action ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const close = useCallback(() => setOpen(null), []);
  const toast: UI['toast'] = useCallback((msg, action) => setToast({ msg, action }), []);

  const afterImprevisto = useCallback((became: boolean) => {
    if (became) {
      toast('Esse imprevisto ficou recorrente. Que tal reservar tempo para ele?', { label: 'Ver sugestão', run: () => nav('/imprevistos#sugestoes') });
    } else {
      toast('Imprevisto registrado.');
    }
  }, [nav, toast]);

  const ui: UI = {
    openTask: (task) => setOpen({ kind: 'task', task }),
    openImprevisto: (imp) => setOpen({ kind: 'imp', imp }),
    openDoc: () => setOpen({ kind: 'doc' }),
    openSuggestion: (s) => setOpen({ kind: 'suggest', s }),
    toast,
    afterImprevisto,
  };

  // se a sugestão aberta deixou de existir (aceita em outra aba), fecha
  const suggestStale = open?.kind === 'suggest' && !suggestions.some((s) => s.key === open.s.key);

  return (
    <Ctx.Provider value={ui}>
      {children}
      {open?.kind === 'task' && (
        <Modal title={open.task?.id ? 'Editar tarefa' : 'Nova tarefa'} onClose={close}>
          <TaskForm task={open.task} onDone={close} />
        </Modal>
      )}
      {open?.kind === 'imp' && (
        <Modal title={open.imp?.id ? 'Editar imprevisto' : 'Registrar imprevisto'} onClose={close}>
          <ImprevistoForm initial={open.imp} onDone={close} onSaved={(_, b) => !open.imp?.id && afterImprevisto(b)} />
        </Modal>
      )}
      {open?.kind === 'doc' && (
        <Modal title="Adicionar documento" onClose={close}>
          <DocForm onDone={(m) => { close(); if (m) toast(m); }} />
        </Modal>
      )}
      {open?.kind === 'suggest' && !suggestStale && (
        <Modal title="Imprevisto recorrente" onClose={close}>
          <SuggestionForm s={open.s} onDone={(m) => { close(); if (m) toast(m); }} />
        </Modal>
      )}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg.msg}
          {toastMsg.action && <button className="btn sm gold" onClick={() => { toastMsg.action!.run(); setToast(null); }}>{toastMsg.action.label}</button>}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useUI(): UI {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI fora do OverlayProvider');
  return v;
}
