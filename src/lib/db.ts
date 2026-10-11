import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type {
  Account, Attachment, CalendarEvent, Client, Draft, FinanceTx, FreelanceEntry, FreelanceProject, Goal, GoalRecord,
  HistorySnapshot, Imprevisto, Metric, MetricEntry, Objective, Settings, StoredBlob, SuggestionState, Task, VaultDoc, WeekPlan,
} from './types';

/**
 * Banco local (IndexedDB). REGRAS:
 * - toda mudança de estrutura ganha uma nova `db.version(n)` com `.upgrade()` que TRANSFORMA os dados antigos;
 * - nunca apagar, recriar ou resetar o banco numa atualização;
 * - versões antigas ficam declaradas aqui para sempre (o Dexie precisa delas para migrar).
 */

export type MeuPlanoDB = Dexie & {
  tasks: EntityTable<Task, 'id'>;
  imprevistos: EntityTable<Imprevisto, 'id'>;
  objectives: EntityTable<Objective, 'id'>;
  goals: EntityTable<Goal, 'id'>;
  records: EntityTable<GoalRecord, 'id'>;
  events: EntityTable<CalendarEvent, 'id'>;
  docs: EntityTable<VaultDoc, 'id'>;
  plans: EntityTable<WeekPlan, 'weekStart'>;
  settings: EntityTable<Settings, 'id'>;
  account: EntityTable<Account, 'email'>;
  suggestions: EntityTable<SuggestionState, 'key'>;
  attachments: EntityTable<Attachment, 'id'>;
  blobs: EntityTable<StoredBlob, 'key'>;
  drafts: EntityTable<Draft, 'key'>;
  meta: EntityTable<{ key: string; value: unknown }, 'key'>;
  clients: EntityTable<Client, 'id'>;
  freelanceProjects: EntityTable<FreelanceProject, 'id'>;
  freelanceEntries: EntityTable<FreelanceEntry, 'id'>;
  financeTxs: EntityTable<FinanceTx, 'id'>;
  metrics: EntityTable<Metric, 'id'>;
  metricEntries: EntityTable<MetricEntry, 'id'>;
  snapshots: EntityTable<HistorySnapshot, 'id'>;
};

// nome histórico, não alterar: guarda os dados da usuária
export const DB_NAME = 'meuplano';

/** tabelas que existiam na v2 (a migração v1→v2 só conhece estas) */
const STAMPED_V2 = [
  'tasks', 'imprevistos', 'objectives', 'goals', 'records', 'events', 'docs', 'plans', 'settings', 'suggestions', 'attachments',
] as const;

/** tabelas com createdAt/updatedAt/deletedAt */
export const STAMPED_TABLES = [
  ...STAMPED_V2, 'clients', 'freelanceProjects', 'freelanceEntries', 'financeTxs', 'metrics', 'metricEntries', 'snapshots',
] as const;

/** tabelas cujos itens podem ir para a Lixeira */
export const TRASHABLE_TABLES = [
  'tasks', 'imprevistos', 'objectives', 'goals', 'records', 'events', 'docs', 'attachments',
  'clients', 'freelanceProjects', 'freelanceEntries', 'financeTxs', 'metrics', 'metricEntries',
] as const;
export type TrashableTable = (typeof TRASHABLE_TABLES)[number];

export const SCHEMA_V1 = {
  tasks: '++id, area, status, date, deadline',
  imprevistos: '++id, area, date, type',
  objectives: '++id, area',
  goals: '++id, objectiveId, area',
  records: '++id, goalId, date',
  events: '++id, date, area, kind, source, externalId',
  docs: '++id, type, date',
  plans: 'weekStart',
  settings: 'id',
  account: 'email',
  suggestions: 'key',
};

export const SCHEMA_V2 = {
  tasks: '++id, area, status, date, deadline, deletedAt',
  imprevistos: '++id, area, date, type, deletedAt',
  objectives: '++id, area, deletedAt',
  goals: '++id, objectiveId, area, deletedAt',
  records: '++id, goalId, date, deletedAt',
  events: '++id, date, area, kind, source, externalId, deletedAt',
  docs: '++id, type, date, deletedAt',
  plans: 'weekStart',
  settings: 'id',
  account: 'email',
  suggestions: 'key',
  attachments: '++id, [ownerType+ownerId], kind, blobKey, deletedAt',
  blobs: 'key',
  drafts: 'key',
  meta: 'key',
};

/** v3 (v7, renda extra no Financeiro): só ACRESCENTA tabelas e o índice de tarefas por registro */
export const SCHEMA_V3 = {
  ...SCHEMA_V2,
  tasks: '++id, area, status, date, deadline, deletedAt, freelanceEntryId',
  clients: '++id, name, deletedAt',
  freelanceProjects: '++id, clientId, status, deletedAt',
  freelanceEntries: '++id, clientId, projectId, dateStart, status, dueDate, deletedAt',
  financeTxs: '++id, date, account, sourceId, deletedAt',
};

/** v4 (v7, Histórico e desempenho): só ACRESCENTA as métricas próprias e os fechamentos mensais */
export const SCHEMA_V4 = {
  ...SCHEMA_V3,
  metrics: '++id, area, deletedAt',
  metricEntries: '++id, metricId, date, deletedAt',
  snapshots: '++id, [period+start]',
};

export function newKey(): string {
  return crypto.randomUUID();
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * v1 → v2: os arquivos saem de dentro dos registros e viram Attachment + blob separado;
 * todo registro ganha createdAt/updatedAt. Nada é apagado.
 */
export async function migrateV1toV2(tx: Transaction) {
  const now = new Date().toISOString();

  for (const t of STAMPED_V2) {
    if (t === 'attachments') continue;
    await tx.table(t).toCollection().modify((r: Record<string, unknown>) => {
      r.createdAt ??= now;
      r.updatedAt ??= r.createdAt;
    });
  }

  const docs = await tx.table('docs').toArray();
  for (const d of docs) {
    const base = { ownerType: 'doc', ownerId: d.id, name: d.name, createdAt: d.createdAt ?? now, updatedAt: now };
    let attachmentId: number | undefined;
    if (d.blob instanceof Blob) {
      const key = newKey();
      await tx.table('blobs').add({ key, blob: d.blob });
      attachmentId = await tx.table('attachments').add({
        ...base, kind: 'file', blobKey: key, mime: d.mime ?? d.blob.type, size: d.size ?? d.blob.size,
      });
    } else if (d.driveUrl) {
      attachmentId = await tx.table('attachments').add({ ...base, kind: 'link', url: d.driveUrl });
    }
    const { blob: _b, mime: _m, size: _s, driveUrl: _u, ...rest } = d;
    await tx.table('docs').put({ ...rest, attachmentId, updatedAt: now });
  }

  const s = await tx.table('settings').get('me');
  if (s?.customPhoto && typeof s.customPhoto === 'string' && s.customPhoto.startsWith('data:')) {
    const blob = dataUrlToBlob(s.customPhoto);
    const key = newKey();
    await tx.table('blobs').add({ key, blob });
    const photoAttachmentId = await tx.table('attachments').add({
      ownerType: 'settings', ownerId: 'me', kind: 'photo', name: 'cenario.jpg', mime: blob.type, size: blob.size, blobKey: key, createdAt: now, updatedAt: now,
    });
    const { customPhoto: _p, ...rest } = s;
    await tx.table('settings').put({ ...rest, photoAttachmentId, updatedAt: now });
  }
}

export function defineSchema(d: Dexie) {
  d.version(1).stores(SCHEMA_V1);
  d.version(2).stores(SCHEMA_V2).upgrade(migrateV1toV2);
  // nada a transformar: as tabelas novas começam vazias e os registros antigos continuam iguais
  d.version(3).stores(SCHEMA_V3);
  d.version(4).stores(SCHEMA_V4);
}

function stampHooks(d: Dexie) {
  for (const t of STAMPED_TABLES) {
    d.table(t).hook('creating', (_pk, obj: Record<string, unknown>) => {
      const n = new Date().toISOString();
      obj.createdAt ??= n;
      obj.updatedAt ??= n;
    });
    d.table(t).hook('updating', ((mods: Record<string, unknown>) => ('updatedAt' in mods ? undefined : { updatedAt: new Date().toISOString() })) as never);
  }
}

export function openDb(name = DB_NAME): MeuPlanoDB {
  const d = new Dexie(name) as MeuPlanoDB;
  defineSchema(d);
  stampHooks(d);
  return d;
}

/** qual banco abrir: o da conta que entrou por último neste aparelho (chave nova; sem ela, o histórico) */
export const ACTIVE_DB_KEY = 'meuplano.db';
export function activeDbName(): string {
  try { return localStorage.getItem(ACTIVE_DB_KEY) || DB_NAME; } catch { return DB_NAME; }
}

export const db = openDb(typeof localStorage === 'undefined' ? DB_NAME : activeDbName());

/** registra um valor real numa meta e atualiza o progresso */
export async function addRecord(goalId: number, value: number, note?: string, date = new Date().toISOString().slice(0, 10)) {
  await db.transaction('rw', db.records, db.goals, async () => {
    await db.records.add({ goalId, value, note, date });
    const g = await db.goals.get(goalId);
    if (g) await db.goals.update(goalId, { current: g.current + value });
  });
}
