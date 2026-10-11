import { addFileAttachment } from './attachments';
import { db, type MeuPlanoDB } from './db';
import { addDays, diffDays, today } from './dates';
import type { Billing, FinanceTx, FreelanceEntry, FreelanceUnit, PayStatus, Settings, Task } from './types';

/**
 * Renda extra: aba do Financeiro (não é área nova).
 * - O tempo vira blocos da Agenda na área Financeiro (subcategory 'renda_extra'), então soma no foco do Financeiro.
 * - Pago + "entra no saldo" vira um lançamento (FinanceTx) no saldo ou na Reserva. Um lançamento por registro.
 * - Dias ↔ horas é só exibição: cada registro guarda a unidade, a quantidade e o hoursPerDay da época.
 */

export const DEFAULT_HOURS_PER_DAY = 7;
export const hoursPerDay = (s: Pick<Settings, 'hoursPerDay'>) => s.hoursPerDay || DEFAULT_HOURS_PER_DAY;

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n % 1 ? 2 : 0 });

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** horas trabalhadas de um registro (com o hoursPerDay salvo nele) */
export function entryHours(e: Pick<FreelanceEntry, 'unit' | 'quantity' | 'hoursPerDay'>): number {
  return e.unit === 'days' ? e.quantity * e.hoursPerDay : e.quantity;
}

/** "1,5 dia" / "10h30" — formata horas na unidade escolhida (a conversão usa a configuração atual) */
export function fmtWork(hours: number, unit: FreelanceUnit, hpd: number): string {
  if (unit === 'days') {
    const d = round(hours / hpd);
    return `${d.toLocaleString('pt-BR')} ${d < 2 ? 'dia' : 'dias'}`;
  }
  const h = Math.floor(hours + 1e-9), m = Math.round((hours - h) * 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** equivalência mostrada no formulário: 1,5 dia → "≈ 10h30"; 10 h → "≈ 1,4 dia" */
export function equivalence(unit: FreelanceUnit, quantity: number, hpd: number): string {
  if (!quantity) return '';
  return `≈ ${unit === 'days' ? fmtWork(quantity * hpd, 'hours', hpd) : fmtWork(quantity, 'days', hpd)}`;
}

export function computeAmount(billing: Billing, rate: number, unit: FreelanceUnit, quantity: number, hpd: number): number {
  const hrs = unit === 'days' ? quantity * hpd : quantity;
  if (billing === 'fixed') return rate;
  if (billing === 'day') return round(rate * (hrs / hpd), 2);
  return round(rate * hrs, 2);
}

export const ym = (date: string) => date.slice(0, 7);
export const counts = (e: FreelanceEntry) => e.status !== 'negotiating';

export interface MonthStats { billed: number; paid: number; receivable: number; hours: number; projects: number; entries: number }

export function monthStats(entries: FreelanceEntry[], month: string): MonthStats {
  const list = entries.filter((e) => ym(e.dateStart) === month && counts(e));
  return {
    billed: list.reduce((s, e) => s + e.amount, 0),
    paid: list.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amount, 0),
    receivable: list.filter((e) => e.status === 'receivable').reduce((s, e) => s + e.amount, 0),
    hours: list.reduce((s, e) => s + entryHours(e), 0),
    projects: new Set(list.map((e) => e.projectId ?? `c${e.clientId}`)).size,
    entries: list.length,
  };
}

/** últimos n meses (do mais antigo ao atual) */
export function lastMonths(month: string, n = 6): string[] {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function receivables(entries: FreelanceEntry[]): FreelanceEntry[] {
  return entries.filter((e) => e.status === 'receivable').sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));
}

export function balances(txs: FinanceTx[]) {
  return {
    saldo: txs.filter((t) => t.account === 'saldo').reduce((s, t) => s + t.amount, 0),
    reserva: txs.filter((t) => t.account === 'reserva').reduce((s, t) => s + t.amount, 0),
  };
}

/* ---------- gravação ---------- */

export interface EntryInput {
  id?: number;
  clientName: string;
  projectTitle?: string;
  dateStart: string;
  dateEnd?: string;
  unit: FreelanceUnit;
  quantity: number;
  billing: Billing;
  rate: number;
  status: PayStatus;
  dueDate?: string;
  blockAgenda: boolean;
  toBalance: boolean;
  toReserve?: boolean;
  /** nota fiscal: vai para o Cofre como comprovante, ligada ao registro */
  invoice?: File;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

/** cria ou atualiza um registro (e o cliente/projeto pelo nome, se ainda não existirem) */
export async function saveEntry(input: EntryInput, settings: Settings, d: MeuPlanoDB = db): Promise<number> {
  const hpd = hoursPerDay(settings);
  const clientName = input.clientName.trim();
  if (!clientName) throw new Error('Informe o cliente.');
  if (!(input.quantity > 0)) throw new Error('Informe quanto trabalhou.');
  const dateEnd = input.dateEnd && input.dateEnd >= input.dateStart ? input.dateEnd : input.dateStart;

  const id = await d.transaction('rw', [d.clients, d.freelanceProjects, d.freelanceEntries, d.financeTxs, d.tasks], async () => {
    const clients = (await d.clients.toArray()).filter((c) => !c.deletedAt);
    const clientId = clients.find((c) => norm(c.name) === norm(clientName))?.id
      ?? ((await d.clients.add({ name: clientName })) as number);

    let projectId: number | undefined;
    const title = input.projectTitle?.trim();
    if (title) {
      const projects = (await d.freelanceProjects.where('clientId').equals(clientId).toArray()).filter((p) => !p.deletedAt);
      projectId = projects.find((p) => norm(p.title) === norm(title))?.id
        ?? ((await d.freelanceProjects.add({ clientId, title, status: input.status === 'negotiating' ? 'negociacao' : 'andamento', progress: 0 })) as number);
    }

    const prev = input.id ? await d.freelanceEntries.get(input.id) : undefined;
    const row: FreelanceEntry = {
      ...(prev ?? {}),
      clientId, projectId,
      dateStart: input.dateStart, dateEnd,
      unit: input.unit, quantity: input.quantity,
      // um registro editado mantém o hoursPerDay com que foi criado
      hoursPerDay: prev?.hoursPerDay ?? hpd,
      billing: input.billing, rate: input.rate,
      amount: computeAmount(input.billing, input.rate, input.unit, input.quantity, prev?.hoursPerDay ?? hpd),
      status: input.status,
      dueDate: input.status === 'receivable' ? input.dueDate || undefined : undefined,
      paidAt: input.status === 'paid' ? prev?.paidAt ?? today() : undefined,
      blockAgenda: input.blockAgenda,
      toBalance: input.toBalance,
      toReserve: input.toBalance && !!input.toReserve,
    };
    const eid = input.id ? (await d.freelanceEntries.put({ ...row, id: input.id }), input.id) : ((await d.freelanceEntries.add(row)) as number);
    await syncPayment(eid, d);
    await syncAgenda(eid, d);
    return eid;
  });

  if (input.invoice) await attachInvoice(id, input.invoice, d);
  return id;
}

/** marca como pago (hoje) e lança no saldo/Reserva, se o registro pede */
export async function markPaid(id: number, date = today(), d: MeuPlanoDB = db) {
  await d.transaction('rw', [d.freelanceEntries, d.financeTxs, d.clients, d.freelanceProjects], async () => {
    await d.freelanceEntries.update(id, { status: 'paid', paidAt: date, dueDate: undefined });
    await syncPayment(id, d);
  });
}

/** mantém exatamente um lançamento para um registro pago que entra no saldo; desfaz se deixou de ser pago */
async function syncPayment(id: number, d: MeuPlanoDB) {
  const e = await d.freelanceEntries.get(id);
  if (!e) return;
  const want = e.status === 'paid' && e.toBalance;
  const tx = e.financeTxId ? await d.financeTxs.get(e.financeTxId) : undefined;
  if (!want) {
    if (tx) await d.financeTxs.delete(tx.id!);
    if (e.financeTxId) await d.freelanceEntries.update(id, { financeTxId: undefined });
    return;
  }
  const client = await d.clients.get(e.clientId);
  const project = e.projectId ? await d.freelanceProjects.get(e.projectId) : undefined;
  const data: FinanceTx = {
    date: e.paidAt ?? today(), amount: e.amount, account: e.toReserve ? 'reserva' : 'saldo',
    description: `Renda extra · ${project?.title ?? client?.name ?? 'freela'}`, source: 'renda_extra', sourceId: id,
  };
  if (tx) await d.financeTxs.update(tx.id!, data);
  else await d.freelanceEntries.update(id, { financeTxId: (await d.financeTxs.add(data)) as number });
}

/** recria os blocos da Agenda do registro: as horas se dividem igualmente entre os dias do período */
async function syncAgenda(id: number, d: MeuPlanoDB) {
  const e = await d.freelanceEntries.get(id);
  if (!e) return;
  // os blocos são derivados do registro: recriar não perde nada que a pessoa tenha digitado
  await d.tasks.where('freelanceEntryId').equals(id).delete();
  if (!e.blockAgenda) return;
  const client = await d.clients.get(e.clientId);
  const project = e.projectId ? await d.freelanceProjects.get(e.projectId) : undefined;
  const n = Math.min(31, Math.max(0, diffDays(e.dateEnd, e.dateStart)) + 1);
  const perDay = Math.max(15, Math.round((entryHours(e) * 60) / n / 15) * 15);
  const t0 = today();
  const blocks: Task[] = Array.from({ length: n }, (_, i) => {
    const date = addDays(e.dateStart, i);
    const past = date < t0;
    return {
      title: `Renda extra · ${project?.title ?? client?.name ?? 'freela'}`,
      area: 'financeiro', subcategory: 'renda_extra', freelanceEntryId: id,
      status: past ? 'concluido' : 'afazer', doneAt: past ? date : undefined, progress: past ? 100 : undefined,
      priority: 'media', date, start: '09:00', durationMin: perDay,
    };
  });
  await d.tasks.bulkAdd(blocks);
}

async function attachInvoice(id: number, file: File, d: MeuPlanoDB) {
  const e = await d.freelanceEntries.get(id);
  if (!e) return;
  const client = await d.clients.get(e.clientId);
  const name = file.name || 'nota-fiscal.pdf';
  await d.transaction('rw', [d.docs, d.attachments, d.blobs, d.freelanceEntries], async () => {
    const docId = (await d.docs.add({
      name, type: 'Comprovante', date: e.paidAt ?? e.dateEnd, linkedTo: `Renda extra · ${client?.name ?? ''}`.trim(), value: e.amount, storage: 'arquivo',
    })) as number;
    const attachmentId = await addFileAttachment({ type: 'doc', id: docId }, 'receipt', file, { name }, d);
    await d.docs.update(docId, { attachmentId });
    await d.freelanceEntries.update(id, { invoiceDocId: docId });
  });
}
