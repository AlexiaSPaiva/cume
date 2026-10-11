import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './ui';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modo foco compartilhado por cards e pela página inteira.
 * O conteúdo NÃO é remontado: o mesmo elemento passa a ocupar a tela (position: fixed),
 * então formulários, filtros e rolagens internas continuam como estavam.
 * Fecha com ✕, Esc (se não houver diálogo aberto por cima) ou arrastando para baixo no celular;
 * ao fechar, devolve a rolagem da página e o foco do teclado para quem abriu.
 */
export function useFocusMode(box: React.RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  const back = useRef<{ y: number; el: HTMLElement | null }>({ y: 0, el: null });

  const open = () => {
    back.current = { y: window.scrollY, el: document.activeElement as HTMLElement | null };
    setOn(true);
  };
  const close = () => setOn(false);

  useEffect(() => {
    if (!on) return;
    document.body.classList.add('focus-lock');
    box.current?.focus({ preventScroll: true });
    const k = (e: KeyboardEvent) => {
      // um diálogo aberto por cima trata o próprio Esc/Tab
      if (document.querySelector('.overlay')) return;
      if (e.key === 'Escape') { e.preventDefault(); setOn(false); }
      if (e.key === 'Tab' && box.current) {
        const f = box.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('focus-lock');
      window.scrollTo(0, back.current.y);
      back.current.el?.focus?.({ preventScroll: true });
    };
  }, [on, box]);

  return { on, open, close };
}

/** alça de arrastar para baixo (celular): passou de 90px, fecha */
export function DragClose({ onClose, target }: { onClose: () => void; target: React.RefObject<HTMLElement | null> }) {
  const drag = useRef<{ y: number; dy: number } | null>(null);
  return (
    <div className="focus-handle" aria-hidden="true"
      onPointerDown={(e) => { drag.current = { y: e.clientY, dy: 0 }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        if (!drag.current || !target.current) return;
        drag.current.dy = Math.max(0, e.clientY - drag.current.y);
        target.current.style.transform = `translateY(${drag.current.dy}px)`;
      }}
      onPointerUp={() => {
        if (!drag.current || !target.current) return;
        const close = drag.current.dy > 90;
        drag.current = null;
        target.current.style.transform = '';
        if (close) onClose();
      }}
      onPointerCancel={() => { drag.current = null; if (target.current) target.current.style.transform = ''; }}>
      <i />
    </div>
  );
}

/**
 * Card padrão do app. Com `expandable` (padrão), mostra ⛶ no título e abre em tela cheia.
 * `act` fica à direita do título (botões e links do card).
 * Em tela cheia o conteúdo fica numa coluna central; `wide` usa a largura toda (grades, tabelas).
 */
export function Card({ title, act, expandable = true, wide = false, className = '', style, id, children }: {
  title: ReactNode; act?: ReactNode; expandable?: boolean; wide?: boolean; className?: string; style?: CSSProperties; id?: string; children: ReactNode;
}) {
  const box = useRef<HTMLElement>(null);
  const focus = useFocusMode(box);
  const name = typeof title === 'string' ? title : undefined;

  return (
    <section ref={box} id={id} style={style} tabIndex={focus.on ? -1 : undefined}
      className={`card ${className} ${wide ? 'wide' : ''} ${focus.on ? 'focused' : ''}`}
      role={focus.on ? 'dialog' : undefined} aria-modal={focus.on || undefined} aria-label={focus.on ? name : undefined}>
      {focus.on && <DragClose onClose={focus.close} target={box} />}
      <h2>
        {focus.on && <span className="focus-chip">Modo foco</span>}
        <span className="card-title">{title}</span>
        {(act || expandable) && (
          <span className="act">
            {act}
            {expandable && (focus.on
              ? <button type="button" className="icon-btn" onClick={focus.close} aria-label="Fechar modo foco" title="Fechar (Esc)"><Icon name="x" size={18} /></button>
              : <button type="button" className="icon-btn expand" onClick={focus.open} aria-label={name ? `Abrir ${name} em tela cheia` : 'Abrir em tela cheia'} title="Tela cheia"><Icon name="expand" size={15} /></button>)}
          </span>
        )}
      </h2>
      <div className="card-body">{children}</div>
    </section>
  );
}
