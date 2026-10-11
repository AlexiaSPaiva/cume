import { useRef, useState, type ReactNode } from 'react';

/**
 * Item de lista com gesto (celular): deslizar para a esquerda revela as ações (ex.: Realocar · Excluir).
 * No computador as mesmas ações ficam visíveis nos botões da linha, então o gesto é só um atalho.
 */
export function SwipeRow({ children, actions, label }: {
  children: ReactNode;
  actions: { label: string; run: () => void; tone?: 'gold' | 'danger' }[];
  label: string;
}) {
  const [x, setX] = useState(0);
  const start = useRef<{ x: number; y: number; base: number; locked?: 'h' | 'v' } | null>(null);
  const W = 84 * actions.length;

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY, base: x };
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (s.locked === 'h') (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (s.locked !== 'h') return;
    setX(Math.max(-W, Math.min(0, s.base + dx)));
  };
  const up = () => {
    if (!start.current) return;
    start.current = null;
    setX((v) => (v < -W / 2 ? -W : 0));
  };

  return (
    <div className={`swipe ${x ? 'open' : ''}`} aria-label={label}>
      <div className="swipe-actions" aria-hidden={x === 0}>
        {actions.map((a) => (
          <button key={a.label} type="button" className={`sw-btn ${a.tone ?? ''}`} tabIndex={x === 0 ? -1 : 0}
            onClick={() => { setX(0); a.run(); }}>{a.label}</button>
        ))}
      </div>
      <div className="swipe-front" style={{ transform: x ? `translateX(${x}px)` : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {children}
      </div>
    </div>
  );
}
