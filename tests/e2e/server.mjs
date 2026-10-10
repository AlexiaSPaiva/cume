// Servidor estático só para os testes e2e: serve o build A ou B (troca em /__switch?to=b),
// simulando a publicação de uma versão nova do app no mesmo endereço.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = join(process.cwd(), '.e2e');
const PORT = Number(process.env.E2E_PORT ?? 4317);
let current = 'a';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/__switch') {
    current = url.searchParams.get('to') === 'b' ? 'b' : 'a';
    res.end(current);
    return;
  }
  const base = join(ROOT, current);
  let file = normalize(join(base, decodeURIComponent(url.pathname)));
  if (!file.startsWith(base) || !existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
  const ext = extname(file);
  const noCache = ext === '.html' || url.pathname === '/sw.js' || url.pathname.startsWith('/workbox-') || ext === '.webmanifest';
  res.writeHead(200, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': noCache ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`e2e server em http://localhost:${PORT}`));
