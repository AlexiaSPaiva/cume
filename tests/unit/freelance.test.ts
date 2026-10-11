import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from '../../src/lib/backup';
import { addDays, today } from '../../src/lib/dates';
import {
  balances, computeAmount, entryHours, equivalence, fmtWork, markPaid, monthStats, saveEntry, type EntryInput,
} from '../../src/lib/freelance';
import { defaultSettings } from '../../src/lib/seed';
import { restore, softDelete } from '../../src/lib/trash';
import { open, uniqueName } from './helpers';

const settings = { ...defaultSettings('Teste'), hoursPerDay: 7 };
const base: EntryInput = {
  clientName: 'Studio Lume', projectTitle: 'Landing page', dateStart: today(), dateEnd: addDays(today(), 1),
  unit: 'days', quantity: 1.5, billing: 'day', rate: 400, status: 'receivable', dueDate: addDays(today(), 10),
  blockAgenda: true, toBalance: true,
};

describe('renda extra: contas e unidades', () => {
  it('converte dias ↔ horas só na exibição', () => {
    expect(fmtWork(10.5, 'hours', 7)).toBe('10h30');
    expect(fmtWork(10.5, 'days', 7)).toBe('1,5 dia');
    expect(fmtWork(14, 'days', 7)).toBe('2 dias');
    expect(equivalence('days', 1.5, 7)).toBe('≈ 10h30');
    expect(equivalence('hours', 14, 7)).toBe('≈ 2 dias');
  });

  it('calcula o valor por dia, por hora e fechado', () => {
    expect(computeAmount('day', 400, 'days', 1.5, 7)).toBe(600);
    expect(computeAmount('day', 400, 'hours', 14, 7)).toBe(800);
    expect(computeAmount('hour', 50, 'days', 2, 7)).toBe(700);
    expect(computeAmount('fixed', 1000, 'hours', 3, 7)).toBe(1000);
  });
});

describe('renda extra: gravação', () => {
  it('cria cliente e projeto pelo nome, sem duplicar', async () => {
    const d = open(uniqueName('fl'));
    await saveEntry(base, settings, d);
    await saveEntry({ ...base, clientName: ' studio lume ', projectTitle: 'landing page' }, settings, d);
    expect(await d.clients.count()).toBe(1);
    expect(await d.freelanceProjects.count()).toBe(1);
    expect(await d.freelanceEntries.count()).toBe(2);
    d.close();
  });

  it('mudar as horas do dia nas configurações não altera um registro salvo', async () => {
    const d = open(uniqueName('fl'));
    const id = await saveEntry(base, settings, d);
    const saved = (await d.freelanceEntries.get(id))!;
    expect(entryHours(saved)).toBe(10.5);
    // depois a pessoa muda para 8h/dia e edita outra coisa no mesmo registro
    await saveEntry({ ...base, id, status: 'paid' }, { ...settings, hoursPerDay: 8 }, d);
    const after = (await d.freelanceEntries.get(id))!;
    expect(after.quantity).toBe(1.5);
    expect(after.hoursPerDay).toBe(7);
    expect(after.amount).toBe(600);
    expect(entryHours(after)).toBe(10.5);
    d.close();
  });

  it('pago entra no saldo uma única vez; com Reserva vai para a Reserva; deixar de ser pago desfaz', async () => {
    const d = open(uniqueName('fl'));
    const id = await saveEntry(base, settings, d);
    expect(await d.financeTxs.count()).toBe(0);
    await markPaid(id, today(), d);
    await markPaid(id, today(), d);
    let txs = await d.financeTxs.toArray();
    expect(txs).toHaveLength(1);
    expect(balances(txs)).toEqual({ saldo: 600, reserva: 0 });

    await saveEntry({ ...base, id, status: 'paid', toReserve: true }, settings, d);
    txs = await d.financeTxs.toArray();
    expect(txs).toHaveLength(1);
    expect(balances(txs)).toEqual({ saldo: 0, reserva: 600 });

    await saveEntry({ ...base, id, status: 'receivable' }, settings, d);
    expect(await d.financeTxs.count()).toBe(0);
    expect((await d.freelanceEntries.get(id))!.financeTxId).toBeUndefined();
    d.close();
  });

  it('bloqueia o tempo na Agenda (área Financeiro) dividido pelos dias, sem duplicar ao editar', async () => {
    const d = open(uniqueName('fl'));
    const id = await saveEntry(base, settings, d);
    let blocks = await d.tasks.where('freelanceEntryId').equals(id).toArray();
    expect(blocks).toHaveLength(2);
    expect(blocks.every((t) => t.area === 'financeiro' && t.subcategory === 'renda_extra')).toBe(true);
    expect(blocks.reduce((s, t) => s + (t.durationMin ?? 0), 0)).toBe(630);

    await saveEntry({ ...base, id, quantity: 2 }, settings, d);
    blocks = await d.tasks.where('freelanceEntryId').equals(id).toArray();
    expect(blocks).toHaveLength(2);
    expect(blocks.reduce((s, t) => s + (t.durationMin ?? 0), 0)).toBe(840);

    await saveEntry({ ...base, id, blockAgenda: false }, settings, d);
    expect(await d.tasks.where('freelanceEntryId').equals(id).count()).toBe(0);
    d.close();
  });

  it('excluir leva o lançamento e os blocos para a Lixeira, e Desfazer devolve tudo', async () => {
    const d = open(uniqueName('fl'));
    const id = await saveEntry({ ...base, status: 'paid' }, settings, d);
    const txId = (await d.freelanceEntries.get(id))!.financeTxId!;
    await softDelete(d, 'freelanceEntries', id);
    expect((await d.financeTxs.get(txId))!.deletedAt).toBeTruthy();
    expect((await d.tasks.where('freelanceEntryId').equals(id).toArray()).every((t) => t.deletedAt)).toBe(true);
    await restore(d, 'freelanceEntries', id);
    expect((await d.financeTxs.get(txId))!.deletedAt).toBeUndefined();
    expect((await d.tasks.where('freelanceEntryId').equals(id).toArray()).every((t) => !t.deletedAt)).toBe(true);
    d.close();
  });

  it('faturado do mês conta pago + a receber, não "em negociação"', async () => {
    const d = open(uniqueName('fl'));
    await saveEntry({ ...base, status: 'paid' }, settings, d);
    await saveEntry({ ...base, status: 'receivable', rate: 200 }, settings, d);
    await saveEntry({ ...base, status: 'negotiating', rate: 999 }, settings, d);
    const s = monthStats(await d.freelanceEntries.toArray(), today().slice(0, 7));
    expect(s.billed).toBe(900);
    expect(s.paid).toBe(600);
    expect(s.receivable).toBe(300);
    expect(s.hours).toBe(21);
    d.close();
  });

  it('backup leva clientes, projetos, registros e lançamentos, e corrige os vínculos ao importar', async () => {
    const a = open(uniqueName('fl'));
    await saveEntry({ ...base, status: 'paid' }, settings, a);
    const zip = await exportBackup(a);
    a.close();

    // destino já tem outro cliente/registro com os mesmos ids
    const b = open(uniqueName('fl'));
    await saveEntry({ ...base, clientName: 'Café Arpoador', projectTitle: 'Dashboard', status: 'paid' }, settings, b);
    await importBackup(b, zip);
    const entries = await b.freelanceEntries.toArray();
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      const client = await b.clients.get(e.clientId);
      const tx = await b.financeTxs.get(e.financeTxId!);
      expect(tx?.sourceId).toBe(e.id);
      expect(tx?.description).toContain(e.projectId ? (await b.freelanceProjects.get(e.projectId))!.title : client!.name);
    }
    expect(new Set(entries.map((e) => e.clientId)).size).toBe(2);
    b.close();
  });
});
