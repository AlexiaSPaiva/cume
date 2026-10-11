import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { AREA } from '../lib/areas';
import type { AreaId } from '../lib/types';

export function Stat({ k, v, s, onClick }: { k: string; v: ReactNode; s?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s && <div className="s">{s}</div>}
    </>
  );
  return onClick ? <button type="button" className="stat" onClick={onClick}>{body}</button> : <div className="stat">{body}</div>;
}

export function Stats({ children, n }: { children: ReactNode; n?: number }) {
  return <div className="stats" style={{ '--n': n ?? 5 } as CSSProperties}>{children}</div>;
}

export function Bar({ pct, color, extra, extraColor, tick }: { pct: number; color: string; extra?: number; extraColor?: string; tick?: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const e = Math.max(0, Math.min(100 - p, extra ?? 0));
  return (
    <div className="bar">
      <i style={{ width: `${p}%`, background: color }} />
      {e > 0 && <i style={{ left: `${p}%`, width: `${e}%`, background: extraColor, borderRadius: '0 3px 3px 0' }} />}
      {tick != null && <span className="tick" style={{ left: `${Math.min(99, tick)}%` }} />}
    </div>
  );
}

export function AreaDot({ area, size = 8 }: { area: AreaId; size?: number }) {
  return <span className="dotc" style={{ background: AREA[area].color, width: size, height: size }} />;
}

export function AreaTag({ area }: { area: AreaId }) {
  const c = AREA[area].color;
  return <span className="tag" style={{ background: `color-mix(in srgb, ${c} 18%, #141b30)`, color: c }}>{AREA[area].name}</span>;
}

/** rosca com vários segmentos */
export function Donut({ data, size = 130, stroke = 22, center }: { data: { value: number; color: string }[]; size?: number; stroke?: number; center?: ReactNode }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#232b47" strokeWidth={stroke} />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const gap = data.length > 1 ? 2 : 0;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-acc} />
          );
          acc += len;
          return el;
        })}
      </svg>
      {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{center}</div>}
    </div>
  );
}

export function Ring({ pct, color, size = 96 }: { pct: number; color: string; size?: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <Donut size={size} stroke={14} data={[{ value: p, color }, { value: 100 - p, color: '#3a4266' }]}
      center={<b style={{ fontSize: size / 4.4 }}>{Math.round(p)}%</b>} />
  );
}

/** linha de ritmo: trechos em queda ficam vermelhos */
export function RhythmLine({ values, color, labels, highlightLast = true }: { values: number[]; color: string; labels: string[]; highlightLast?: boolean }) {
  const W = 320, H = 110, pad = 14;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i * (W - pad * 2)) / (values.length - 1), 12 + (1 - (v - min) / span) * (H - 40)]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {[0, 1, 2].map((i) => <line key={i} x1={pad} x2={W - pad} y1={12 + i * ((H - 40) / 2)} y2={12 + i * ((H - 40) / 2)} stroke="#2a3150" strokeDasharray="2 4" />)}
      {pts.slice(1).map((p, i) => (
        <line key={i} x1={pts[i][0]} y1={pts[i][1]} x2={p[0]} y2={p[1]} stroke={values[i + 1] < values[i] ? '#d9776b' : color} strokeWidth="2" />
      ))}
      {pts.map((p, i) => (
        <g key={i}>
          {highlightLast && i === pts.length - 1 && <circle cx={p[0]} cy={p[1]} r="8" fill="none" stroke="#fff" strokeWidth="1.2" />}
          <circle cx={p[0]} cy={p[1]} r="4" fill={color} />
          <text x={p[0]} y={H - 6} textAnchor="middle" fontSize="10" fill="#9198b4">{labels[i]}</text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Janela de diálogo. No celular (< 768px) vira folha que sobe de baixo (bottom sheet):
 * arrastar a alça para baixo fecha. Esc fecha em qualquer tamanho; o foco fica preso dentro.
 */
export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && box.current) {
        const f = box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', k);
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
    return () => { window.removeEventListener('keydown', k); prev?.focus?.(); };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    box.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onUp = () => {
    if (!drag.current || !box.current) return;
    const close = drag.current.dy > 90;
    drag.current = null;
    box.current.style.transform = '';
    if (close) onClose();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden="true"><i /></div>
        <h2>{title}<button className="icon-btn x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button></h2>
        {children}
      </div>
    </div>
  );
}

const PATHS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.3-4.3',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0',
  menu: 'M4 7h16M4 12h16M4 17h16',
  x: 'M6 6l12 12M18 6 6 18',
  up: 'M12 19V5m-6 6 6-6 6 6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  file: 'M7 3h7l5 5v13H7V3Zm7 0v5h5',
  check: 'M5 12l5 5 9-10',
  trash: 'M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-3v2a4 4 0 0 1-4 4H4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  week: 'M4 5h16v15H4zM4 10h16M9 5v15M14 5v15',
  agenda: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4M8 14h3M8 17h6',
  tasks: 'M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10',
  plan: 'M4 18l5-12 4 8 3-5 4 9',
  calendar: 'M4 6h16v14H4zM4 11h16M8 3v5M16 3v5',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  zap: 'M13 3 5 14h6l-1 7 8-11h-6z',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M15 6l-6 6 6 6M20 6l-6 6 6 6',
  uncollapse: 'M9 6l6 6-6 6M4 6l6 6-6 6',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  if (name === 'drive') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3h8l6 10.5-4 7H6l-4-7L8 3Z" fill="none" />
        <path d="M8.2 3 2 13.6l3.1 5.4L11.3 8.4 8.2 3Z" fill="#1fa463" />
        <path d="M15.8 3H8.2l6.1 10.6h7.7L15.8 3Z" fill="#ffd04b" />
        <path d="M5.1 19h12.6l3.3-5.4H8.4L5.1 19Z" fill="#4688f4" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

/** estado vazio: diz o que falta e, quando houver, convida para o primeiro passo */
export function Empty({ children, action }: { children: ReactNode; action?: { label: string; run: () => void } }) {
  return (
    <div className={`empty ${action ? 'invite' : ''}`}>
      <span>{children}</span>
      {action && <button type="button" className="btn sm out" onClick={action.run}>{action.label}</button>}
    </div>
  );
}
