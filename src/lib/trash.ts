import type { MeuPlanoDB, TrashableTable } from './db';
import { TRASHABLE_TABLES } from './db';

export const TRASH_DAYS = 30;

/** itens que dependem do item excluído e vão junto para a Lixeira (e voltam juntos) */
async function dependents(d: MeuPlanoDB, table: TrashableTable, id: number): Promise<[TrashableTable, number][]> {
  if (table === 'docs') {
    const doc = await d.docs.get(id);
    return doc?.attachmentId ? [['attachments', doc.attachmentId]] : [];
  }
  if (table === 'metrics') {
    // os valores lançados são da métrica: saem e voltam juntos
    const es = await d.metricEntries.where('metricId').equals(id).toArray();
    return es.map((e) => ['metricEntries', e.id!] as [TrashableTable, number]);
  }
  if (table === 'freelanceEntries') {
    // o lançamento no saldo e os blocos da Agenda pertencem ao registro: saem e voltam juntos
    const e = await d.freelanceEntries.get(id);
    const out: [TrashableTable, number][] = [];
    if (e?.financeTxId) out.push(['financeTxs', e.financeTxId]);
    for (const t of await d.tasks.where('freelanceEntryId').equals(id).toArray()) out.push(['tasks', t.id!]);
    return out;
  }
  const ownerType = table === 'tasks' ? 'task' : table === 'goals' ? 'goal' : null;
  if (!ownerType) return [];
  const atts = await d.attachments.where('[ownerType+ownerId]').equals([ownerType, id]).toArray();
  return atts.map((a) => ['attachments', a.id!] as [TrashableTable, number]);
}

/** soft delete: marca deletedAt; o item some das telas e fica 30 dias na Lixeira */
export async function softDelete(d: MeuPlanoDB, table: TrashableTable, id: number) {
  const at = new Date().toISOString();
  const deps = await dependents(d, table, id);
  await d.transaction('rw', [...new Set([table, ...deps.map(([t]) => t)])], async () => {
    await d.table(table).update(id, { deletedAt: at });
    for (const [t, depId] of deps) {
      const cur = await d.table(t).get(depId);
      if (cur && !cur.deletedAt) await d.table(t).update(depId, { deletedAt: at });
    }
  });
}

/** desfaz a exclusão: o MESMO registro (mesmo id) volta */
export async function restore(d: MeuPlanoDB, table: TrashableTable, id: number) {
  const item = await d.table(table).get(id);
  if (!item?.deletedAt) return;
  const at = item.deletedAt;
  const deps = await dependents(d, table, id);
  await d.transaction('rw', [...new Set([table, ...deps.map(([t]) => t)])], async () => {
    await d.table(table).update(id, { deletedAt: undefined });
    // só restaura dependentes que foram para a lixeira junto (mesmo instante)
    for (const [t, depId] of deps) {
      const cur = await d.table(t).get(depId);
      if (cur?.deletedAt === at) await d.table(t).update(depId, { deletedAt: undefined });
    }
  });
}

export interface TrashItem {
  table: TrashableTable;
  id: number;
  label: string;
  deletedAt: string;
  daysLeft: number;
}

const LABEL: Record<TrashableTable, string> = {
  tasks: 'Tarefa', imprevistos: 'Imprevisto', objectives: 'Objetivo', goals: 'Meta', records: 'Registro',
  events: 'Evento', docs: 'Documento', attachments: 'Arquivo',
  clients: 'Cliente', freelanceProjects: 'Projeto de renda extra', freelanceEntries: 'Trabalho de renda extra', financeTxs: 'Lançamento',
  metrics: 'Métrica', metricEntries: 'Valor de métrica',
};

export function daysLeft(deletedAt: string, now = Date.now()): number {
  return Math.max(0, TRASH_DAYS - Math.floor((now - Date.parse(deletedAt)) / 86_400_000));
}

export async function listTrash(d: MeuPlanoDB): Promise<TrashItem[]> {
  const out: TrashItem[] = [];
  for (const t of TRASHABLE_TABLES) {
    const rows = await d.table(t).where('deletedAt').above('').toArray();
    for (const r of rows) {
      // anexos que foram junto com o documento aparecem só pelo documento
      if (t === 'attachments' && r.ownerType === 'doc') continue;
      // blocos de agenda e lançamentos de um trabalho de renda extra aparecem só pelo trabalho
      if ((t === 'tasks' && r.freelanceEntryId) || (t === 'financeTxs' && r.source === 'renda_extra')) continue;
      if (t === 'metricEntries' && rows.length && (await d.metrics.get(r.metricId))?.deletedAt === r.deletedAt) continue;
      out.push({ table: t, id: r.id, label: `${LABEL[t]} · ${r.title ?? r.name ?? r.description ?? r.note ?? `#${r.id}`}`, deletedAt: r.deletedAt, daysLeft: daysLeft(r.deletedAt) });
    }
  }
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Apaga de verdade só o que está na Lixeira há mais de 30 dias.
 * Os blobs só são removidos quando nenhum anexo vivo aponta para eles.
 */
export async function purgeExpired(d: MeuPlanoDB, now = Date.now()): Promise<number> {
  const limit = new Date(now - TRASH_DAYS * 86_400_000).toISOString();
  let n = 0;
  await d.transaction('rw', [...TRASHABLE_TABLES, 'blobs'], async () => {
    for (const t of TRASHABLE_TABLES) {
      const old = await d.table(t).where('deletedAt').below(limit).toArray();
      if (!old.length) continue;
      if (t === 'attachments') {
        for (const a of old) {
          if (!a.blobKey) continue;
          const others = await d.attachments.where('blobKey').equals(a.blobKey).filter((x) => x.id !== a.id).count();
          if (!others) await d.blobs.delete(a.blobKey);
        }
      }
      await d.table(t).bulkDelete(old.map((r) => r.id));
      n += old.length;
    }
  });
  return n;
}
