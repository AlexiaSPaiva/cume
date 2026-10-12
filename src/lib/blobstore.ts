import type { MeuPlanoDB } from './db';
import type { StoredBlob } from './types';

/**
 * Alguns Safari (iPhone com iOS antigo, WebKit no Windows) recusam guardar arquivo (Blob) no banco do aparelho:
 * "Error preparing Blob/File data to be stored in object store". Nesses, o arquivo vai como bytes (ArrayBuffer)
 * e volta a ser arquivo na leitura. O teste é feito uma vez por banco.
 */
const probes = new WeakMap<MeuPlanoDB, Promise<boolean>>();
const PROBE = '__teste-arquivo__';

export function canStoreBlobs(d: MeuPlanoDB): Promise<boolean> {
  let p = probes.get(d);
  if (!p) {
    p = (async () => {
      try {
        await d.blobs.put({ key: PROBE, blob: new Blob(['ok'], { type: 'text/plain' }) });
        await d.blobs.delete(PROBE);
        return true;
      } catch { return false; }
    })();
    probes.set(d, p);
  }
  return p;
}

/** o registro a gravar em `blobs` (chamar ANTES de abrir a transação: ler os bytes não pode ficar dentro dela) */
export async function toStored(d: MeuPlanoDB, key: string, blob: Blob): Promise<StoredBlob> {
  if (await canStoreBlobs(d)) return { key, blob };
  return { key, bytes: await blob.arrayBuffer(), type: blob.type };
}

/** o arquivo guardado, venha como Blob ou como bytes */
export function readStored(s?: StoredBlob | null): Blob | undefined {
  if (!s) return undefined;
  if (s.blob) return s.blob;
  if (s.bytes) return new Blob([s.bytes], { type: s.type ?? '' });
  return undefined;
}
