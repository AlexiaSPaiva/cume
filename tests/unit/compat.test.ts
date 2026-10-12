import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mix } from '../../src/lib/color';

describe('iPhones com iOS antigo', () => {
  it('o build gera CSS e JS que o Safari 14+ entende (senão o celular cai no layout de computador)', () => {
    const cfg = readFileSync('vite.config.ts', 'utf-8');
    expect(cfg).toMatch(/cssTarget:\s*\[[^\]]*'safari14'/);
    expect(cfg).toMatch(/target:\s*\[[^\]]*'safari14'/);
  });

  it('toda mistura de cor no CSS tem uma cor alternativa antes', () => {
    const css = readFileSync('src/styles.css', 'utf-8');
    for (const m of css.matchAll(/([\w-]+):\s*[^;{}]*color-mix\(/g)) {
      const before = css.slice(Math.max(0, m.index! - 160), m.index);
      // a mesma propriedade aparece logo antes, na mesma regra, com uma cor simples
      const ok = before.trimEnd().endsWith(';') && before.lastIndexOf(`${m[1]}:`) > before.lastIndexOf('{');
      expect(ok, `fallback de ${m[1]}`).toBe(true);
    }
  });

  it('mix() devolve uma cor sempre', () => {
    expect(mix('#c8a97e', 30, '#141b33')).toMatch(/color-mix|rgba/);
  });
});
