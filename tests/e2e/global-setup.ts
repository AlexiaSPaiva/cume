import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** gera duas versões do app (A e B) para simular a publicação de um build novo */
export default function globalSetup() {
  const vite = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  for (const v of ['a', 'b']) {
    execFileSync(process.execPath, [vite, 'build', '--outDir', `.e2e/${v}`, '--emptyOutDir', '--logLevel', 'error'], {
      stdio: 'inherit',
      // sem nuvem nos testes: nada de contas de teste no Supabase de verdade
      env: { ...process.env, MEUPLANO_BUILD_ID: v.toUpperCase(), VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    });
  }
}
