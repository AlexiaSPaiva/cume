/** pede ao navegador para não apagar os dados do app quando faltar espaço */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageInfo {
  persisted: boolean;
  usage?: number;
  quota?: number;
}

export async function storageInfo(): Promise<StorageInfo> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = await navigator.storage?.estimate?.();
    return { persisted, usage: est?.usage, quota: est?.quota };
  } catch {
    return { persisted: false };
  }
}
