import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { defineSchema, migrateV1toV2, openDb, SCHEMA_V1, SCHEMA_V2 } from '../../src/lib/db';
import { getBlob } from '../../src/lib/attachments';
import { bytes, makeV1, open, PDF_BYTES, uniqueName } from './helpers';

describe('migração de schema', () => {
  it('v1 → v2 move os arquivos para attachments/blobs sem perder nada', async () => {
    const name = uniqueName('mig');
    await makeV1(name);
    const d = open(name);
    await d.open();
    expect(d.verno).toBe(3); // v1 → v2 → v3 de uma vez

    // nada some
    expect(await d.tasks.count()).toBe(2);
    expect(await d.imprevistos.count()).toBe(1);
    expect(await d.docs.count()).toBe(2);
    const corrida = await d.tasks.where('status').equals('adiada').first();
    expect(corrida?.title).toBe('Corrida no parque');
    expect(corrida?.postponedCount).toBe(2);

    // timestamps em tudo
    for (const t of await d.tasks.toArray()) {
      expect(t.createdAt).toBeTruthy();
      expect(t.updatedAt).toBeTruthy();
    }

    // o PDF agora é Attachment + blob, com os mesmos bytes
    const edital = (await d.docs.toArray()).find((x) => x.name === 'Edital.pdf')!;
    expect((edital as unknown as Record<string, unknown>).blob).toBeUndefined();
    const att = await d.attachments.get(edital.attachmentId!);
    expect(att?.kind).toBe('file');
    expect(att?.mime).toBe('application/pdf');
    expect(await bytes(await getBlob(att!, d))).toEqual([...PDF_BYTES]);

    // o link do Drive virou Attachment kind 'link'
    const pasta = (await d.docs.toArray()).find((x) => x.storage === 'drive')!;
    expect((await d.attachments.get(pasta.attachmentId!))?.url).toBe('https://drive.google.com/drive/folders/abc');

    // a foto do cenário saiu do texto base64 e virou blob
    const s = await d.settings.get('me');
    expect((s as unknown as Record<string, unknown>).customPhoto).toBeUndefined();
    const photo = await d.attachments.get(s!.photoAttachmentId!);
    expect((await getBlob(photo!, d))?.type).toBe('image/png');
    d.close();
  });

  it('reabrir o banco já migrado não muda nem duplica nada', async () => {
    const name = uniqueName('mig2');
    await makeV1(name);
    const a = open(name);
    await a.open();
    const before = { tasks: await a.tasks.toArray(), atts: await a.attachments.toArray(), blobs: await a.blobs.count() };
    a.close();
    const b = open(name);
    await b.open();
    expect(await b.tasks.toArray()).toEqual(before.tasks);
    expect(await b.attachments.toArray()).toEqual(before.atts);
    expect(await b.blobs.count()).toBe(before.blobs);
    b.close();
  });

  it('v2 → v3 (renda extra) só acrescenta tabelas: tudo o que existia continua igual', async () => {
    const name = uniqueName('mig23');
    await makeV1(name);
    // abre só até a v2, como o app publicado antes desta versão
    const v2 = new Dexie(name);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores(SCHEMA_V2).upgrade(migrateV1toV2);
    await v2.open();
    const before = { tasks: await v2.table('tasks').toArray(), docs: await v2.table('docs').toArray(), atts: await v2.table('attachments').toArray() };
    v2.close();

    const d = open(name);
    await d.open();
    expect(d.verno).toBe(3);
    expect(await d.tasks.toArray()).toEqual(before.tasks);
    expect(await d.docs.toArray()).toEqual(before.docs);
    expect(await d.attachments.toArray()).toEqual(before.atts);
    for (const t of ['clients', 'freelanceProjects', 'freelanceEntries', 'financeTxs'] as const) expect(await d.table(t).count()).toBe(0);
    d.close();
  });

  it('uma migração futura (v4) mantém anexos, arquivos e notas', async () => {
    const name = uniqueName('mig3');
    await makeV1(name);
    const v2 = openDb(name);
    await v2.open();
    await v2.tasks.add({ title: 'Nota: ler paper ViT', area: 'academica', status: 'afazer', priority: 'baixa' });
    v2.close();

    // simula a próxima versão do app: nova tabela + transformação de um campo
    const v3 = new Dexie(name);
    defineSchema(v3);
    v3.version(4).stores({ journal: '++id, trackId' }).upgrade(async (tx) => {
      await tx.table('tasks').toCollection().modify((t: Record<string, unknown>) => {
        t.postponeCount = (t.postponedCount as number | undefined) ?? 0;
      });
    });
    await v3.open();
    expect(v3.verno).toBe(4);
    const tasks = await v3.table('tasks').toArray();
    expect(tasks.map((t) => t.title)).toContain('Nota: ler paper ViT');
    expect(tasks.find((t) => t.title === 'Corrida no parque')?.postponeCount).toBe(2);
    const docs = await v3.table('docs').toArray();
    const att = await v3.table('attachments').get(docs.find((x) => x.name === 'Edital.pdf').attachmentId);
    const blob = (await v3.table('blobs').get(att.blobKey)).blob as Blob;
    expect(await bytes(blob)).toEqual([...PDF_BYTES]);
    v3.close();
  });
});
