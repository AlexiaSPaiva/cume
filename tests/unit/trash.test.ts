import { describe, expect, it } from 'vitest';
import { addFileAttachment, getBlob } from '../../src/lib/attachments';
import { listTrash, purgeExpired, restore, softDelete } from '../../src/lib/trash';
import { bytes, open, pdfBlob, PDF_BYTES, uniqueName } from './helpers';

const DAY = 86_400_000;

async function docWithPdf(d: ReturnType<typeof open>) {
  const docId = (await d.docs.add({ name: 'Boleto.pdf', type: 'Comprovante', storage: 'arquivo' })) as number;
  const attId = await addFileAttachment({ type: 'doc', id: docId }, 'boleto', Object.assign(pdfBlob(), { name: 'Boleto.pdf' }), {}, d);
  await d.docs.update(docId, { attachmentId: attId });
  return { docId, attId };
}

describe('lixeira (soft delete)', () => {
  it('excluir manda para a Lixeira e Desfazer devolve o MESMO item com o arquivo', async () => {
    const d = open(uniqueName('trash'));
    const { docId, attId } = await docWithPdf(d);
    await softDelete(d, 'docs', docId);
    expect((await d.docs.get(docId))?.deletedAt).toBeTruthy();
    expect((await d.attachments.get(attId))?.deletedAt).toBeTruthy();
    expect((await listTrash(d)).map((t) => t.id)).toContain(docId);

    await restore(d, 'docs', docId);
    const doc = await d.docs.get(docId);
    expect(doc?.deletedAt).toBeUndefined();
    expect(doc?.id).toBe(docId);
    const att = await d.attachments.get(attId);
    expect(att?.deletedAt).toBeUndefined();
    expect(await bytes(await getBlob(att!, d))).toEqual([...PDF_BYTES]);
  });

  it('o purge só apaga de verdade depois de 30 dias', async () => {
    const d = open(uniqueName('purge'));
    const { docId, attId } = await docWithPdf(d);
    const keep = (await d.tasks.add({ title: 'viva', area: 'pessoal', status: 'afazer', priority: 'media' })) as number;
    await softDelete(d, 'docs', docId);
    const blobKey = (await d.attachments.get(attId))!.blobKey!;

    expect(await purgeExpired(d, Date.now() + 29 * DAY)).toBe(0);
    expect(await d.docs.get(docId)).toBeTruthy();
    expect(await d.blobs.get(blobKey)).toBeTruthy();

    expect(await purgeExpired(d, Date.now() + 31 * DAY)).toBe(2);
    expect(await d.docs.get(docId)).toBeUndefined();
    expect(await d.blobs.get(blobKey)).toBeUndefined();
    expect(await d.tasks.get(keep)).toBeTruthy();
  });
});
