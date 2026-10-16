import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Attachment, Imprevisto, Task } from '../lib/types';
import { setAttachmentViewer } from '../lib/attachments';
import { FileViewer } from './FileViewer';
import type { RecurringSuggestion } from '../lib/recurrence';
import { useData } from '../lib/data';
import { db, type TrashableTable } from '../lib/db';
import { restore, softDelete } from '../lib/trash';
import { DocForm, ImprevistoForm, SuggestionForm, TaskForm } from './forms';
import { Modal } from './ui';
import { PostponeForm, RescheduleForm } from './Reschedule';
import { QuickDone } from './QuickDone';

type Open =
  | { kind: 'task'; task?: Partial<Task>; day?: string }
  | { kind: 'imp'; imp?: Partial<Imprevisto> }
  | { kind: 'doc' }
  | { kind: 'suggest'; s: RecurringSuggestion }
  | { kind: 'resched'; task: Task }
  | { kind: 'postpone'; task: Task }
  | { kind: 'file'; a: Attachment }
  | null;

interface UI {
  /** `day`: o dia clicado na Agenda (nas tarefas semanais, é esse dia que fica marcado como feito) */
  openTask(task?: Partial<Task>, day?: string): void;
  openImprevisto(imp?: Partial<Imprevisto>): void;
  openDoc(): void;
  openSuggestion(s: RecurringSuggestion): void;
  /** Realocar: a mesma tarefa vai para um dia, para o Planejamento ou para o backlog */
  openReschedule(task: Task): void;
  /** Adiar com motivo */
  openPostpone(task: Task): void;
  toast(msg: string, action?: { label: string; run: () => void }): void;
  /** exclusão padrão: vai para a Lixeira (30 dias) e mostra "Desfazer" por 6 s, que devolve o MESMO item */
  remove(table: TrashableTable, id: number, label: string): Promise<void>;
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
    const t = setTimeout(() => setToast(null), toastMsg.action ? 6000 : 4500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const close = useCallback(() => setOpen(null), []);

  // arquivos anexados abrem no visualizador do app (em qualquer tela que chame openAttachment)
  useEffect(() => {
    setAttachmentViewer((a) => setOpen({ kind: 'file', a }));
    return () => setAttachmentViewer(null);
  }, []);
  const toast: UI['toast'] = useCallback((msg, action) => setToast({ msg, action }), []);

  const afterImprevisto = useCallback((became: boolean) => {
    if (became) {
      toast('Esse imprevisto ficou recorrente. Que tal reservar tempo para ele?', { label: 'Ver sugestão', run: () => nav('/imprevistos#sugestoes') });
    } else {
      toast('Imprevisto registrado.');
    }
  }, [nav, toast]);

  const remove = useCallback(async (table: TrashableTable, id: number, label: string) => {
    await softDelete(db, table, id);
    toast(`${label} foi para a Lixeira.`, { label: 'Desfazer', run: () => { void restore(db, table, id); } });
  }, [toast]);

  const ui: UI = {
    openTask: (task, day) => setOpen({ kind: 'task', task, day }),
    openImprevisto: (imp) => setOpen({ kind: 'imp', imp }),
    openDoc: () => setOpen({ kind: 'doc' }),
    openSuggestion: (s) => setOpen({ kind: 'suggest', s }),
    openReschedule: (task) => setOpen({ kind: 'resched', task }),
    openPostpone: (task) => setOpen({ kind: 'postpone', task }),
    toast,
    remove,
    afterImprevisto,
  };

  // se a sugestão aberta deixou de existir (aceita em outra aba), fecha
  const suggestStale = open?.kind === 'suggest' && !suggestions.some((s) => s.key === open.s.key);

  return (
    <Ctx.Provider value={ui}>
      {children}
      {open?.kind === 'task' && (
        <Modal title={open.task?.id ? 'Editar tarefa' : 'Nova tarefa'} onClose={close}>
          {open.task?.id != null && <QuickDone task={open.task as Task} day={open.day} onDone={close} />}
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
      {open?.kind === 'resched' && (
        <Modal title="Realocar tarefa" onClose={close} drawer>
          <RescheduleForm task={open.task} onDone={(m) => { close(); if (m) toast(m); }}
            onDelete={() => { close(); void remove('tasks', open.task.id!, `“${open.task.title}”`); }} />
        </Modal>
      )}
      {open?.kind === 'postpone' && (
        <Modal title="Adiar tarefa" onClose={close}>
          <PostponeForm task={open.task} onDone={(m) => { close(); if (m) toast(m); }} />
        </Modal>
      )}
      {open?.kind === 'file' && (
        <Modal title="Arquivo" onClose={close} wide>
          <FileViewer a={open.a} />
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
