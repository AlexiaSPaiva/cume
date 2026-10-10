import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(css|tsx?|html)$/.test(f) ? [p] : [];
  });
}

const sources = [...files('src'), 'index.html'].map((p) => ({ p, s: readFileSync(p, 'utf-8') }));

/** proibições do item "Acabar com a letra esticada" */
describe('tipografia sem distorção', () => {
  const rules: [string, RegExp][] = [
    ['transform: scale/scaleX/scaleY', /scale[XY]?\(/],
    ['zoom', /(^|[\s;{])zoom\s*:/m],
    ['font-stretch diferente de normal', /font-stretch\s*:\s*(?!normal)/],
    ['font-size em vw puro', /font(?:-size)?\s*:[^;]*?(?<!\+\s?[\d.]*)(?<![\w(,]\s?)\d+(?:\.\d+)?vw/],
    ['preserveAspectRatio="none"', /preserveAspectRatio=["']none["']/],
    ['font-size em px', /font-size\s*:\s*\d+(?:\.\d+)?px/],
  ];
  for (const [name, re] of rules) {
    it(`nenhum ${name}`, () => {
      const hits = sources.filter(({ s }) => re.test(s)).map(({ p }) => p);
      expect(hits).toEqual([]);
    });
  }

  it('viewport correto e font-synthesis desligado', () => {
    const html = readFileSync('index.html', 'utf-8');
    expect(html).toMatch(/name="viewport" content="width=device-width, initial-scale=1(\.0)?, viewport-fit=cover"/);
    const css = readFileSync('src/styles.css', 'utf-8');
    expect(css).toContain('font-synthesis: none');
    expect(css).toContain('-webkit-text-size-adjust: 100%');
  });
});
