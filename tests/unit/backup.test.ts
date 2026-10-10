import { describe, expect, it } from 'vitest';
import { addFileAttachment, getBlob } from '../../src/lib/attachments';
import { exportBackup, importBackup } from '../../src/lib/backup';
import { softDelete } from '../../src/lib/trash';
import { bytes, open, pdfBlob, PDF_BYTES, uniqueName } from './helpers';

async function populate(d: ReturnType<typeof open>) {
  const objectiveId = (await d.objectives.add({ title: 'Estabilidade', subtitle: '', area: 'financeiro' })) as number;
  const goalId = (await d.goals.add({ objectiveId, title: 'Reserva', metric: 'valor', initial: 0, current: 100, target: 6000, area: 'financeiro' })) as number;
  await d.tasks.add({ title: 'Transferir R$ 300', area: 'financeiro', status: 'afazer', priority: 'alta', goalId });
  const docId = (await d.docs.add({ name: 'Edital.pdf', type: 'Documento', storage: 'arquivo' })) as number;
  const attId = await addFileAttachment({ type: 'doc', id: docId }, 'notice', Object.assign(pdfBlob(), { name: 'Edital.pdf' }), {}, d);
  await d.docs.update(docId, { attachmentId: attId });
  const lixo = (await d.tasks.add({ title: 'Arrumar armário', area: 'pessoal', status: 'afazer', priority: 'baixa' })) as number;
  await softDelete(d, 'tasks', lixo);
  await d.settings.put({
    id: 'me', name: 'Alexia', fullName: 'Alexia', phrase: '', accent: '#c8a97e', scenario: 'noite', widgets: [],
    desiredFocus: { academica: 30, profissional: 28, saude: 12, pessoal: 10, financeiro: 10, adultices: 10 },
    city: { name: 'Rio', lat: 0, lon: 0 }, recurrenceThreshold: 3,
  });
}

describe('backup .zip', () => {
  it('exportar e importar num aparelho vazio restaura tudo, inclusive o PDF e a Lixeira', async () => {
    const a = open(uniqueName('bk-a'));
    await populate(a);
    const zip = await exportBackup(a);

    const b = open(uniqueName('bk-b'));
    const r = await importBackup(b, zip);
    expect(r.files).toBe(1);
    expect(await b.tasks.count()).toBe(2);
    expect((await b.tasks.toArray()).find((t) => t.title === 'Arrumar armário')?.deletedAt).toBeTruthy();
    const doc = (await b.docs.toArray())[0];
    const att = await b.attachments.get(doc.attachmentId!);
    expect(await bytes(await getBlob(att!, b))).toEqual([...PDF_BYTES]);
    expect((await b.settings.get('me'))?.scenario).toBe('noite');
    const task = (await b.tasks.toArray()).find((t) => t.goalId)!;
    expect((await b.goals.get(task.goalId!))?.title).toBe('Reserva');
  });

  it('importar de novo no mesmo aparelho não duplica nem apaga', async () => {
    const a = open(uniqueName('bk-same'));
    await populate(a);
    const zip = await exportBackup(a);
    await a.tasks.add({ title: 'criada depois do backup', area: 'pessoal', status: 'afazer', priority: 'media' });
    const r = await importBackup(a, zip);
    expect(r.added).toBe(0);
    expect(await a.tasks.count()).toBe(3);
    expect(await a.blobs.count()).toBe(1);
  });

  it('ids que colidem com outro registro ganham id novo e as referências acompanham', async () => {
    const a = open(uniqueName('bk-col-a'));
    await populate(a);
    const zip = await exportBackup(a);

    const b = open(uniqueName('bk-col-b'));
    await b.objectives.add({ title: 'Outro objetivo', subtitle: '', area: 'saude', createdAt: '2020-01-01T00:00:00.000Z' });
    await b.goals.add({ title: 'Outra meta', metric: 'tarefas', initial: 0, current: 0, target: 1, area: 'saude', createdAt: '2020-01-01T00:00:00.000Z' });
    await importBackup(b, zip);
    expect(await b.objectives.count()).toBe(2);
    expect(await b.goals.count()).toBe(2);
    const reserva = (await b.goals.toArray()).find((g) => g.title === 'Reserva')!;
    expect((await b.objectives.get(reserva.objectiveId!))?.title).toBe('Estabilidade');
    const task = (await b.tasks.toArray()).find((t) => t.title === 'Transferir R$ 300')!;
    expect(task.goalId).toBe(reserva.id);
  });
});
