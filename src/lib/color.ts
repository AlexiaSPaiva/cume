/**
 * Mistura de cores para estilos na tela. Usa color-mix() quando o navegador entende;
 * nos iPhones com iOS antigo (Safari < 16.2) calcula a cor aqui, senão o fundo ficava vazio.
 */
const supported = typeof CSS !== 'undefined' && CSS.supports?.('color', 'color-mix(in srgb, red 50%, blue)');

function resolve(c: string): string {
  const v = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(c.trim());
  if (!v || typeof document === 'undefined') return c;
  const got = getComputedStyle(document.documentElement).getPropertyValue(v[1]).trim();
  return got || (v[2] ? resolve(v[2]) : c);
}

function rgb(c: string): [number, number, number, number] | null {
  const h = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(c.trim());
  if (h) {
    const x = h[1].length === 3 ? h[1].split('').map((d) => d + d).join('') : h[1];
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), 1];
  }
  if (c.trim() === 'transparent') return [0, 0, 0, 0];
  const m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}

/** `pct`% de `c` sobre `base` (como color-mix(in srgb, c pct%, base)) */
export function mix(c: string, pct: number, base: string): string {
  if (supported) return `color-mix(in srgb, ${c} ${pct}%, ${base})`;
  const a = rgb(resolve(c));
  const b = rgb(resolve(base));
  if (!a || !b) return resolve(c);
  const t = pct / 100;
  const alpha = a[3] * t + b[3] * (1 - t);
  if (alpha === 0) return 'transparent';
  // mistura pré-multiplicada (igual ao color-mix com transparência)
  const ch = (i: number) => Math.round((a[i] * a[3] * t + b[i] * b[3] * (1 - t)) / alpha);
  return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${+alpha.toFixed(3)})`;
}
