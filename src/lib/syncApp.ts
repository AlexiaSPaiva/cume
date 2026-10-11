import { useSyncExternalStore } from 'react';
import { currentAccount } from './auth';
import { cloud, cloudUserId, SupabaseRemote } from './cloud';
import { activeDbName, db, onLocalChange, type MeuPlanoDB } from './db';
import { pending, SyncEngine, trackLocalChanges } from './sync';

/**
 * A sincronização dentro do app: quando roda e o que mostrar.
 * Roda ao abrir, a cada minuto, ao voltar para o app, quando a internet volta
 * e alguns segundos depois de cada mudança.
 */

export type SyncStatus =
  | { kind: 'desligada' } // app sem nuvem configurada
  | { kind: 'entrar' } // esta conta ainda não está ligada à nuvem neste aparelho
  | { kind: 'sincronizando'; at?: string }
  | { kind: 'ok'; at: string }
  | { kind: 'offline'; at?: string }
  | { kind: 'erro'; at?: string; message: string };

let status: SyncStatus = cloud ? { kind: 'sincronizando' } : { kind: 'desligada' };
const subs = new Set<() => void>();
const set = (s: SyncStatus) => { status = s; for (const f of subs) f(); };
const lastAt = () => ('at' in status ? status.at : undefined);

export const useSyncStatus = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => status);

if (cloud) trackLocalChanges();

/** sincroniza um banco com a conta da nuvem (também usado no login de um aparelho novo, antes de abrir o app) */
export async function syncDb(d: MeuPlanoDB, dbName: string, userId: string) {
  if (!cloud) return { up: 0, down: 0 };
  return new SyncEngine(d, dbName, new SupabaseRemote(cloud, userId), pending).sync();
}

let running: Promise<void> | null = null;
let again = false;

export function runSync(): Promise<void> {
  if (!cloud) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      const [uid, acc] = await Promise.all([cloudUserId(), currentAccount()]);
      if (!uid || !acc?.cloudId || acc.cloudId !== uid) return set({ kind: 'entrar' });
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return set({ kind: 'offline', at: lastAt() });
      set({ kind: 'sincronizando', at: lastAt() });
      await syncDb(db, activeDbName(), uid);
      set({ kind: 'ok', at: new Date().toISOString() });
    } catch (e) {
      const m = String((e as { message?: string })?.message ?? e);
      if (/fetch|network|Load failed/i.test(m)) set({ kind: 'offline', at: lastAt() });
      else { console.error('[cume] sincronizar', e); set({ kind: 'erro', at: lastAt(), message: m }); }
    } finally {
      running = null;
      if (again) { again = false; void runSync(); }
    }
  })();
  return running;
}

/** liga a sincronização automática; devolve a função que desliga */
export function startAutoSync(): () => void {
  if (!cloud) return () => {};
  void runSync();
  let t: ReturnType<typeof setTimeout> | undefined;
  const soon = () => { clearTimeout(t); t = setTimeout(() => void runSync(), 3000); };
  const off = onLocalChange((name) => { if (name === activeDbName()) soon(); });
  const tick = setInterval(() => void runSync(), 60_000);
  const vis = () => { if (document.visibilityState === 'visible') void runSync(); else if (pending.of(activeDbName()).size) void runSync(); };
  const online = () => void runSync();
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('online', online);
  return () => {
    off(); clearTimeout(t); clearInterval(tick);
    document.removeEventListener('visibilitychange', vis);
    window.removeEventListener('online', online);
  };
}
