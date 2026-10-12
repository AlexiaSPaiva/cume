import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newKey, type MeuPlanoDB } from './db';
import type { Attachment, AttachmentKind } from './types';
import { cloudFile } from './cloud';
import { readStored, toStored } from './blobstore';

/**
 * Arquivos: o binário vai para a tabela `blobs` (IndexedDB) e os metadados para `attachments`.
 * Nunca se salva `URL.createObjectURL`: a URL é criada na hora de exibir e revogada depois.
 */

export async function addFileAttachment(
  owner: { type: string; id: number | string },
  kind: AttachmentKind,
  file: Blob & { name?: string },
  extra: Partial<Attachment> = {},
  d: MeuPlanoDB = db,
): Promise<number> {
  const key = newKey();
  const stored = await toStored(d, key, file);
  return d.transaction('rw', d.blobs, d.attachments, async () => {
    await d.blobs.add(stored);
    return (await d.attachments.add({
      ownerType: owner.type, ownerId: owner.id, kind, name: file.name ?? 'arquivo', size: file.size, mime: file.type, blobKey: key, ...extra,
    })) as number;
  });
}

export async function addLinkAttachment(
  owner: { type: string; id: number | string },
  kind: AttachmentKind,
  url: string,
  name: string,
  extra: Partial<Attachment> = {},
  d: MeuPlanoDB = db,
): Promise<number> {
  return (await d.attachments.add({ ownerType: owner.type, ownerId: owner.id, kind, name, url, ...extra })) as number;
}

/** troca o arquivo de um anexo existente (mesmo id) por um novo blob */
export async function replaceAttachmentFile(id: number, file: Blob & { name?: string }, d: MeuPlanoDB = db) {
  const key = newKey();
  const stored = await toStored(d, key, file);
  await d.transaction('rw', d.blobs, d.attachments, async () => {
    await d.blobs.add(stored);
    await d.attachments.update(id, { blobKey: key, url: undefined, size: file.size, mime: file.type, name: file.name ?? 'arquivo' });
  });
}

export async function getBlob(a: Attachment, d: MeuPlanoDB = db): Promise<Blob | undefined> {
  if (!a.blobKey) return undefined;
  return readStored(await d.blobs.get(a.blobKey));
}

/** quem mostra o arquivo dentro do app (o OverlayProvider se registra aqui) */
let viewer: ((a: Attachment) => void) | null = null;
export function setAttachmentViewer(f: ((a: Attachment) => void) | null) { viewer = f; }

/**
 * Abre o anexo. Link: aba nova (na hora do toque, senão o Safari bloqueia).
 * Arquivo: o visualizador do app, com Abrir / Baixar / Compartilhar, que funcionam em qualquer aparelho.
 * (Antes o arquivo abria com window.open depois de ler o banco; o iPhone bloqueava e "ver" não fazia nada.)
 */
export async function openAttachment(a: Attachment): Promise<boolean> {
  if (a.url) {
    window.open(a.url, '_blank', 'noopener');
    return true;
  }
  if (viewer) { viewer(a); return true; }
  const blob = await loadFile(a);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** o arquivo do anexo: do aparelho ou, se ainda não desceu, da nuvem (e fica guardado) */
export async function loadFile(a: Attachment, d: MeuPlanoDB = db): Promise<Blob | undefined> {
  const local = await getBlob(a, d);
  if (local || !a.blobKey) return local;
  const remote = await cloudFile(a.blobKey);
  if (!remote) return undefined;
  const blob = a.mime && !remote.type ? new Blob([remote], { type: a.mime }) : remote;
  await d.blobs.put(await toStored(d, a.blobKey, blob));
  return blob;
}

/** URL temporária para exibir um anexo (ex.: foto do cenário); revogada ao desmontar */
export function useAttachmentUrl(id?: number): string | undefined {
  const blob = useLiveQuery(async () => {
    if (!id) return null;
    const a = await db.attachments.get(id);
    if (!a || a.deletedAt) return null;
    return (await getBlob(a)) ?? null;
  }, [id]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) { setUrl(undefined); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function fmtSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
}
