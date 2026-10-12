import { useEffect, useState, type ReactNode } from 'react';

/** quantas colunas cabem: 1 no celular, 2 a partir do tablet */
function useColumns(): number {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    // Safari antigo só tem addListener
    if (m.addEventListener) m.addEventListener('change', on); else m.addListener(on);
    return () => { if (m.removeEventListener) m.removeEventListener('change', on); else m.removeListener(on); };
  }, []);
  return wide ? 2 : 1;
}

/**
 * Caixas de alturas diferentes encaixadas em colunas, sem buracos: cada item vai para a coluna mais curta
 * (pela altura estimada em `weight`), então a ordem de leitura se mantém da esquerda para a direita, de cima para baixo.
 * No celular, uma coluna na ordem original.
 */
export function Masonry<T>({ items, weight, render, keyOf }: {
  items: T[]; weight: (x: T) => number; render: (x: T) => ReactNode; keyOf: (x: T) => string | number;
}) {
  const n = useColumns();
  const cols: T[][] = Array.from({ length: n }, () => []);
  const h = Array(n).fill(0);
  for (const it of items) {
    const i = h.indexOf(Math.min(...h));
    cols[i].push(it);
    h[i] += weight(it);
  }
  return (
    <div className="masonry" style={{ '--cols': n } as React.CSSProperties}>
      {cols.map((c, i) => <div key={i} className="masonry-col">{c.map((x) => <div key={keyOf(x)} className="masonry-item">{render(x)}</div>)}</div>)}
    </div>
  );
}
