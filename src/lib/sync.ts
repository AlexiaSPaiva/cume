import { applyRemote, newId, onLocalChange, STAMPED_TABLES, type MeuPlanoDB } from './db';
import { NUMERIC_TABLES, remapRefs, type NumTable, type Row } from './backup';
import { readStored, toStored } from './blobstore';

/**
 * Sincronização com a nuvem. O aparelho continua sendo o lugar principal (funciona sem internet);
 * a nuvem guarda uma cópia de cada registro e leva as mudanças para os outros aparelhos.
 *
 * - SOBE: o que mudou neste aparelho (a lista "pendente" fica no localStorage, então sobrevive a fechar o app).
 *   Excluir de verdade vira uma marca de "excluído" na nuvem.
 * - DESCE: o que mudou na nuvem desde a última vez. No mesmo registro, vence a mudança mais recente (updatedAt).
 * - ARQUIVOS: cada arquivo vai para a pasta da pessoa no armazenamento da nuvem.
 * - Nada é apagado por engano: um registro só some se foi excluído (Lixeira esvaziada) em algum aparelho.
 */

/** tabelas que vão para a nuvem (conta, rascunhos e controles internos ficam só no aparelho) */
export const SYNC_TABLES: readonly string[] = STAMPED_TABLES;
const NUMERIC = new Set<string>(NUMERIC_TABLES);

export interface RemoteRow { tbl: string; pk: string; data: Row | null; deleted: boolean; cu: string; at: string }
export interface PushRow { tbl: string; pk: string; data: Row | null; deleted: boolean; cu: string }

/** a nuvem, vista pelo app (a de verdade é o Supabase; nos testes, uma de mentira na memória) */
export interface Remote {
  userId: string;
  /** tudo que mudou depois de `since` (horário do servidor), em ordem */
  pull(since: string | null): Promise<RemoteRow[]>;
  push(rows: PushRow[]): Promise<void>;
  hasData(): Promise<boolean>;
  upload(key: string, blob: Blob): Promise<void>;
  download(key: string): Promise<Blob | null>;
}

/** onde ficam a lista de pendentes e o estado (localStorage no app; memória nos testes) */
export interface KV { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void }
const memKV = (): KV => { const m = new Map<string, string>(); return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); }, del: (k) => { m.delete(k); } }; };
export const localKV: KV = (() => {
  try {
    localStorage.setItem('cume.kv.test', '1'); localStorage.removeItem('cume.kv.test');
    return { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), del: (k) => localStorage.removeItem(k) };
  } catch { return memKV(); }
})();
export { memKV };

const dirtyKey = (dbName: string) => `cume.sync.pendente.${dbName}`;
const stateKey = (dbName: string) => `cume.sync.estado.${dbName}`;
const sentKey = (dbName: string) => `cume.sync.arquivos.${dbName}`;
const OVERLAP_MS = 60_000; // relê o último minuto: uma gravação lenta no servidor não fica para trás
const BATCH = 200;

interface State { userId: string; lastPull: string | null }

/** lista de pendentes (tabela|chave) de cada banco; grava logo depois de cada mudança */
export class Pending {
  private sets = new Map<string, Set<string>>();
  private queued = new Set<string>();
  constructor(private kv: KV) {}
  of(dbName: string): Set<string> {
    let s = this.sets.get(dbName);
    if (!s) {
      try { s = new Set(JSON.parse(this.kv.get(dirtyKey(dbName)) ?? '[]') as string[]); } catch { s = new Set(); }
      this.sets.set(dbName, s);
    }
    return s;
  }
  add(dbName: string, tbl: string, pk: unknown) {
    this.of(dbName).add(`${tbl}|${pk}`);
    this.save(dbName);
  }
  remove(dbName: string, keys: Iterable<string>) {
    const s = this.of(dbName);
    for (const k of keys) s.delete(k);
    this.save(dbName);
  }
  private save(dbName: string) {
    if (this.queued.has(dbName)) return;
    this.queued.add(dbName);
    queueMicrotask(() => { this.queued.delete(dbName); this.kv.set(dirtyKey(dbName), JSON.stringify([...this.of(dbName)])); });
  }
}

const split = (k: string) => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1)] as const; };
const pkOf = (tbl: string, pk: string): string | number => (NUMERIC.has(tbl) ? Number(pk) : pk);
/** ids criados antes da sincronização (1, 2, 3…); os novos são enormes (newId) */
const isOldId = (v: unknown) => typeof v === 'number' && v < 1e12;

export type SyncResult = { up: number; down: number };

export class SyncEngine {
  constructor(
    readonly d: MeuPlanoDB,
    readonly dbName: string,
    readonly remote: Remote,
    readonly pending: Pending,
    readonly kv: KV = localKV,
  ) {}

  private get state(): State | null {
    try { return JSON.parse(this.kv.get(stateKey(this.dbName)) ?? 'null') as State | null; } catch { return null; }
  }
  private set state(s: State | null) {
    if (s) this.kv.set(stateKey(this.dbName), JSON.stringify(s)); else this.kv.del(stateKey(this.dbName));
  }

  /** este banco já está ligado a esta conta da nuvem? */
  get linked(): boolean { return this.state?.userId === this.remote.userId; }

  /**
   * Primeira vez deste aparelho com esta conta: tudo que já existe aqui entra na lista para subir.
   * Se a nuvem já tem um registro DIFERENTE com o mesmo id antigo (outro aparelho subiu antes),
   * o daqui ganha id novo e as ligações entre registros são corrigidas. O mesmo registro
   * (mesmo createdAt) continua com o id: religar um aparelho não duplica nada.
   */
  async link(): Promise<void> {
    if (this.linked) return;
    this.kv.del(sentKey(this.dbName));
    if (await this.remote.hasData()) await this.renumberOldIds(await this.remote.pull(null));
    const all: string[] = [];
    for (const t of SYNC_TABLES) {
      const pkPath = this.d.table(t).schema.primKey.keyPath as string;
      for (const r of (await this.d.table(t).toArray()) as Row[]) all.push(`${t}|${r[pkPath]}`);
    }
    const p = this.pending.of(this.dbName);
    for (const k of all) p.add(k);
    this.pending.remove(this.dbName, []);
    this.state = { userId: this.remote.userId, lastPull: null };
  }

  private async renumberOldIds(remoteRows: RemoteRow[]) {
    const there = new Map(remoteRows.map((r) => [`${r.tbl}|${r.pk}`, r.data?.createdAt ?? null]));
    const maps = Object.fromEntries(NUMERIC_TABLES.map((t) => [t, new Map<number, number>()])) as Record<NumTable, Map<number, number>>;
    let any = false;
    for (const t of NUMERIC_TABLES) {
      for (const r of (await this.d.table(t).toArray()) as Row[]) {
        const k = `${t}|${r.id}`;
        if (isOldId(r.id) && there.has(k) && there.get(k) !== r.createdAt) { maps[t].set(r.id!, newId()); any = true; }
      }
    }
    if (!any) return;
    const m = (t: NumTable, v: unknown) => (typeof v === 'number' ? maps[t].get(v) ?? v : v);
    await applyRemote(this.d, [...SYNC_TABLES], async () => {
      for (const t of SYNC_TABLES) {
        const rows = (await this.d.table(t).toArray()) as Row[];
        for (const r of rows) {
          const o = remapRefs(t, r, m);
          if (NUMERIC.has(t) && maps[t as NumTable].has(r.id!)) {
            o.id = maps[t as NumTable].get(r.id!);
            await this.d.table(t).delete(r.id!);
            await this.d.table(t).add(o);
          } else if (JSON.stringify(o) !== JSON.stringify(r)) {
            await this.d.table(t).put(o);
          }
        }
      }
    });
    // o que estava pendente com o id antigo passa a valer com o id novo
    const p = this.pending.of(this.dbName);
    for (const k of [...p]) {
      const [t, pk] = split(k);
      const nid = NUMERIC.has(t) ? maps[t as NumTable].get(Number(pk)) : undefined;
      if (nid != null) { p.delete(k); p.add(`${t}|${nid}`); }
    }
    this.pending.remove(this.dbName, []);
  }

  /** sobe os pendentes, depois desce as novidades */
  async sync(): Promise<SyncResult> {
    if (!this.linked) await this.link();
    const up = await this.push();
    const down = await this.pull();
    return { up, down };
  }

  async push(): Promise<number> {
    const keys = [...this.pending.of(this.dbName)];
    let n = 0;
    const sent = new Set<string>(JSON.parse(this.kv.get(sentKey(this.dbName)) ?? '[]') as string[]);
    for (let i = 0; i < keys.length; i += BATCH) {
      const chunk = keys.slice(i, i + BATCH);
      const rows: PushRow[] = [];
      for (const k of chunk) {
        const [tbl, pk] = split(k);
        if (!SYNC_TABLES.includes(tbl)) continue;
        const r = (await this.d.table(tbl).get(pkOf(tbl, pk))) as Row | undefined;
        if (r) {
          // o arquivo vai antes do registro que aponta para ele
          const blobKey = tbl === 'attachments' ? (r.blobKey as string | undefined) : undefined;
          if (blobKey && !sent.has(blobKey)) {
            const b = await this.d.blobs.get(blobKey);
            const file = readStored(b);
            if (file) { await this.remote.upload(blobKey, file); sent.add(blobKey); this.kv.set(sentKey(this.dbName), JSON.stringify([...sent])); }
          }
          rows.push({ tbl, pk, data: r, deleted: false, cu: r.updatedAt ?? '' });
        } else {
          rows.push({ tbl, pk, data: null, deleted: true, cu: new Date().toISOString() });
        }
      }
      if (rows.length) await this.remote.push(rows);
      this.pending.remove(this.dbName, chunk);
      n += rows.length;
    }
    return n;
  }

  async pull(): Promise<number> {
    const st = this.state;
    const since = st?.lastPull ? new Date(new Date(st.lastPull).getTime() - OVERLAP_MS).toISOString() : null;
    const rows = await this.remote.pull(since);
    let last = st?.lastPull ?? null;
    let n = 0;
    const pend = this.pending.of(this.dbName);
    const applied: string[] = [];
    const tables = [...new Set(rows.map((r) => r.tbl))].filter((t) => SYNC_TABLES.includes(t));
    if (tables.length) {
      await applyRemote(this.d, tables, async () => {
        for (const r of rows) {
          if (!SYNC_TABLES.includes(r.tbl)) continue;
          const pk = pkOf(r.tbl, r.pk);
          const cur = (await this.d.table(r.tbl).get(pk)) as Row | undefined;
          const mine = cur?.updatedAt ?? '';
          if (r.deleted) {
            if (!cur || mine > r.cu) continue;
            await this.d.table(r.tbl).delete(pk);
          } else {
            if (!r.data || (cur && mine >= r.cu)) continue;
            await this.d.table(r.tbl).put(r.data);
          }
          applied.push(`${r.tbl}|${r.pk}`);
          n++;
        }
      });
    }
    for (const r of rows) if (!last || r.at > last) last = r.at;
    // o que veio da nuvem e era mais novo não precisa subir de volta
    this.pending.remove(this.dbName, applied.filter((k) => pend.has(k)));
    this.state = { userId: this.remote.userId, lastPull: last };
    await this.fetchMissingFiles();
    return n;
  }

  /** anexos cujo arquivo ainda não está neste aparelho: baixa da nuvem */
  private async fetchMissingFiles() {
    const atts = (await this.d.attachments.toArray()).filter((a) => a.blobKey);
    for (const a of atts) {
      if (await this.d.blobs.get(a.blobKey!)) continue;
      const blob = await this.remote.download(a.blobKey!).catch(() => null);
      if (blob) await this.d.blobs.put(await toStored(this.d, a.blobKey!, blob));
    }
  }
}

/** lista de pendentes do app: toda mudança local (em qualquer banco de conta) entra aqui */
export const pending = new Pending(localKV);
let listening = false;
export function trackLocalChanges() {
  if (listening) return;
  listening = true;
  onLocalChange((dbName, tbl, pk) => pending.add(dbName, tbl, pk));
}

/** esquece o vínculo deste banco com a nuvem (ex.: outra conta da nuvem entrou neste banco) */
export function forgetLink(dbName: string, kv: KV = localKV) {
  kv.del(stateKey(dbName));
  kv.del(sentKey(dbName));
}
