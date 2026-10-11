import { useEffect, useRef, useState } from 'react';
import { duplicateTask } from '../lib/tasks';
import type { Task } from '../lib/types';
import { useUI } from './Overlays';
import { Icon } from './ui';

/** ordem fixa em todo o app (princípio 3 da v7) */
const ORDER = ['open', 'edit', 'move', 'postpone', 'duplicate', 'delete'] as const;
type Key = (typeof ORDER)[number];
const LABEL: Record<Key, string> = {
  open: 'Abrir', edit: 'Editar', move: 'Mover', postpone: 'Adiar', duplicate: 'Duplicar', delete: 'Excluir',
};

export type ItemActions = Partial<Record<Key, (() => void) | { label: string; run: () => void }>>;

/**
 * Menu ⋯ de um item. Só mostra as ações que o item tem, sempre na ordem
 * Abrir · Editar · Mover/Realocar · Adiar · Duplicar · Excluir. "Excluir" fica separado e em vermelho.
 */
export function ItemMenu({ label, actions }: { label: string; actions: ItemActions }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    // o menu fica "fixed" (não é cortado por listas com rolagem); se a tela rolar, fecha
    const away = (e: Event) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', out);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', resize);
    ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', out);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const right = Math.max(8, window.innerWidth - r.right);
      setPos(r.bottom > window.innerHeight * 0.6 ? { right, bottom: window.innerHeight - r.top + 4 } : { right, top: r.bottom + 4 });
    }
    setOpen((o) => !o);
  };

  const items = ORDER.filter((k) => actions[k]).map((k) => {
    const a = actions[k]!;
    return typeof a === 'function' ? { k, label: LABEL[k], run: a } : { k, label: a.label, run: a.run };
  });
  if (!items.length) return null;

  const onKey = (e: React.KeyboardEvent) => {
    const list = [...(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    // Enter/espaço no ⋯ não pode "clicar" no card que está por baixo
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  };

  return (
    <div className="item-menu" ref={ref} onKeyDown={onKey} onClick={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" className="icon-btn dots" aria-label={`Ações: ${label}`} aria-haspopup="menu" aria-expanded={open}
        onClick={toggle}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={`Ações: ${label}`} style={pos}>
          {items.map((it) => (
            <button key={it.k} type="button" role="menuitem" className={it.k === 'delete' ? 'del' : ''}
              onClick={() => { setOpen(false); it.run(); }}>
              {it.k === 'delete' && <Icon name="trash" size={14} />}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** menu ⋯ padrão de uma tarefa (quadro, Início, Planejamento, painéis) */
export function TaskMenu({ t }: { t: Task }) {
  const ui = useUI();
  if (!t.id) return null;
  const id = t.id;
  const open = t.status !== 'concluido';
  return (
    <ItemMenu label={t.title} actions={{
      edit: () => ui.openTask(t),
      move: open ? { label: 'Realocar…', run: () => ui.openReschedule(t) } : undefined,
      postpone: open && t.status !== 'adiada' ? () => ui.openPostpone(t) : undefined,
      duplicate: () => void duplicateTask(t).then(() => ui.toast('Tarefa duplicada.')),
      delete: () => void ui.remove('tasks', id, `“${t.title}”`),
    }} />
  );
}
