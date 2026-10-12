import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { MeuPlanoDB } from './db';
import { canStoreBlobs, readStored } from './blobstore';

/**
 * Backup = .zip com `meuplano-backup.json` (todas as tabelas, inclusive a Lixeira) e `files/<blobKey>`
 * com os arquivos. Importar SOMA ao que existe: nada é apagado; no mesmo registro vence o mais recente;
 * ids que colidem com outro registro ganham id novo e as referências são corrigidas.
 */

// nome histórico, não alterar: identifica os backups (inclusive os antigos)
const FORMAT = 'meuplano-backup';
export const NUMERIC_TABLES = [
  'objectives', 'goals', 'tasks', 'records', 'imprevistos', 'events', 'docs', 'attachments',
  'clients', 'freelanceProjects', 'freelanceEntries', 'financeTxs', 'metrics', 'metricEntries', 'snapshots',
  'tracks', 'subjects', 'topics', 'questionLogs', 'mockExams', 'trackDates', 'articleNotes', 'journal',
] as const;
export const KEYED_TABLES = ['plans', 'suggestions', 'settings'] as const;
export type NumTable = (typeof NUMERIC_TABLES)[number];
export type Row = Record<string, unknown> & { id?: number; createdAt?: string; updatedAt?: string };

interface BackupFile {
  format: typeof FORMAT;
  version: 1;
  schema: number;
  exportedAt: string;
  tables: Record<string, Row[]>;
  blobs: { key: string; type: string; size: number }[];
}

const OWNER_TABLE: Record<string, NumTable> = { doc: 'docs', task: 'tasks', goal: 'goals', track: 'tracks', subject: 'subjects', topic: 'topics' };

/**
 * Troca as referências de uma linha (goalId, trackId, ownerId…) pelo mapa de ids novos.
 * Usado ao importar backup e ao sincronizar um aparelho que já tinha dados com ids antigos.
 */
export function remapRefs(t: string, r: Row, m: (t: NumTable, v: unknown) => unknown): Row {
  const o: Row = { ...r };
  const ownerTable = OWNER_TABLE;
  if (t === 'goals') o.objectiveId = m('objectives', r.objectiveId);
  if (t === 'records') o.goalId = m('goals', r.goalId);
  if (t === 'tasks') { o.goalId = m('goals', r.goalId); o.freelanceEntryId = m('freelanceEntries', r.freelanceEntryId); }
  if (t === 'freelanceProjects') o.clientId = m('clients', r.clientId);
  if (t === 'metricEntries') o.metricId = m('metrics', r.metricId);
  if (['subjects', 'mockExams', 'trackDates', 'articleNotes', 'journal'].includes(t)) o.trackId = m('tracks', r.trackId);
  if (t === 'tasks') {
    o.trackId = m('tracks', r.trackId); o.subjectId = m('subjects', r.subjectId); o.topicId = m('topics', r.topicId);
    o.sessionOf = m('tasks', r.sessionOf); o.reviewOf = m('topics', r.reviewOf);
  }
  if (t === 'topics' || t === 'questionLogs') o.subjectId = m('subjects', r.subjectId);
  if (t === 'questionLogs') o.topicId = m('topics', r.topicId);
  if (t === 'articleNotes') o.attachmentId = m('attachments', r.attachmentId);
  if (t === 'journal') o.articleId = m('attachments', r.articleId);
  if (t === 'freelanceEntries') {
    o.clientId = m('clients', r.clientId);
    o.projectId = m('freelanceProjects', r.projectId);
    o.financeTxId = m('financeTxs', r.financeTxId);
    o.invoiceDocId = m('docs', r.invoiceDocId);
  }
  if (t === 'financeTxs' && r.source === 'renda_extra') o.sourceId = m('freelanceEntries', r.sourceId);
  if (t === 'imprevistos' && Array.isArray(r.postponedTaskIds)) o.postponedTaskIds = r.postponedTaskIds.map((x) => m('tasks', x));
  if (t === 'docs') o.attachmentId = m('attachments', r.attachmentId);
  if (t === 'attachments' && typeof r.ownerType === 'string' && ownerTable[r.ownerType]) o.ownerId = m(ownerTable[r.ownerType], r.ownerId);
  if (t === 'plans' && Array.isArray(r.top3)) o.top3 = r.top3.map((x) => m('tasks', x));
  if (t === 'suggestions') o.taskId = m('tasks', r.taskId);
  if (t === 'settings') o.photoAttachmentId = m('attachments', r.photoAttachmentId);
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

export async function exportBackup(d: MeuPlanoDB): Promise<Uint8Array> {
  const tables: Record<string, Row[]> = {};
  for (const t of [...NUMERIC_TABLES, ...KEYED_TABLES]) tables[t] = await d.table(t).toArray();
  const files: Record<string, Uint8Array> = {};
  const blobs: BackupFile['blobs'] = [];
  for (const s of await d.blobs.toArray()) {
    const b = readStored(s);
    if (!b || s.key.startsWith('__')) continue;
    files[`files/${s.key}`] = new Uint8Array(await b.arrayBuffer());
    blobs.push({ key: s.key, type: b.type, size: b.size });
  }
  const data: BackupFile = { format: FORMAT, version: 1, schema: d.verno, exportedAt: new Date().toISOString(), tables, blobs };
  files['meuplano-backup.json'] = strToU8(JSON.stringify(data));
  // arquivos já comprimidos (PDF, imagens) não ganham nada com deflate
  return zipSync(files, { level: 0 });
}

export interface ImportResult { added: number; updated: number; kept: number; files: number }

export async function importBackup(d: MeuPlanoDB, zip: Uint8Array): Promise<ImportResult> {
  const entries = unzipSync(zip);
  const json = entries['meuplano-backup.json'];
  if (!json) throw new Error('Arquivo não é um backup do Cume°.');
  const data = JSON.parse(strFromU8(json)) as BackupFile;
  if (data.format !== FORMAT) throw new Error('Arquivo não é um backup do Cume°.');

  const res: ImportResult = { added: 0, updated: 0, kept: 0, files: 0 };
  const allTables = [...NUMERIC_TABLES, ...KEYED_TABLES, 'blobs'];

  const asBlob = await canStoreBlobs(d); // testado antes: dentro da transação não pode
  await d.transaction('rw', allTables, async () => {
    // 1) arquivos: entram se ainda não existirem (a chave é única)
    for (const b of data.blobs ?? []) {
      const bytes = entries[`files/${b.key}`];
      if (!bytes || (await d.blobs.get(b.key))) continue;
      const u8 = bytes as Uint8Array<ArrayBuffer>;
      await d.blobs.add(asBlob ? { key: b.key, blob: new Blob([u8], { type: b.type }) } : { key: b.key, bytes: u8.slice().buffer, type: b.type });
      res.files++;
    }

    // 2) decide o id final de cada linha (mantém, atualiza, ou remapeia se colidir com outro registro)
    const maps: Record<NumTable, Map<number, number>> = Object.fromEntries(NUMERIC_TABLES.map((t) => [t, new Map()])) as never;
    const plan: { table: NumTable; row: Row; action: 'add' | 'put' | 'keep' }[] = [];
    for (const t of NUMERIC_TABLES) {
      let next = ((await d.table(t).orderBy(':id').lastKey()) as number | undefined) ?? 0;
      const incoming = (data.tables[t] ?? []) as Row[];
      next = Math.max(next, ...incoming.map((r) => r.id ?? 0));
      for (const row of incoming) {
        if (row.id == null) continue;
        const cur = (await d.table(t).get(row.id)) as Row | undefined;
        if (!cur) {
          maps[t].set(row.id, row.id);
          plan.push({ table: t, row, action: 'add' });
        } else if (cur.createdAt && row.createdAt && cur.createdAt !== row.createdAt) {
          const nid = ++next;
          maps[t].set(row.id, nid);
          plan.push({ table: t, row, action: 'add' });
        } else {
          maps[t].set(row.id, row.id);
          plan.push({ table: t, row, action: (row.updatedAt ?? '') > (cur.updatedAt ?? '') ? 'put' : 'keep' });
        }
      }
    }

    const m = (t: NumTable, v: unknown) => (typeof v === 'number' ? maps[t].get(v) ?? v : v);
    const fix = (t: string, r: Row): Row => {
      const o = remapRefs(t, r, m);
      if (t !== 'settings' && t !== 'plans' && t !== 'suggestions') o.id = maps[t as NumTable].get(r.id!) ?? r.id;
      return o;
    };

    for (const p of plan) {
      if (p.action === 'keep') { res.kept++; continue; }
      await d.table(p.table).put(fix(p.table, p.row));
      if (p.action === 'add') res.added++; else res.updated++;
    }

    // 3) tabelas com chave própria: no mesmo registro, vence o mais recente
    for (const t of KEYED_TABLES) {
      const pk = d.table(t).schema.primKey.keyPath as string;
      for (const row of (data.tables[t] ?? []) as Row[]) {
        const cur = (await d.table(t).get(row[pk] as string)) as Row | undefined;
        if (cur && (row.updatedAt ?? '') <= (cur.updatedAt ?? '')) { res.kept++; continue; }
        await d.table(t).put(fix(t, row));
        if (cur) res.updated++; else res.added++;
      }
    }
  });
  return res;
}
