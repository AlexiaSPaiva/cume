import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from './db';

const DEBOUNCE = 500;

export function hhmm(d = new Date()) {
  return d.toTimeString().slice(0, 5);
}

/**
 * Estado de formulário que nunca se perde.
 * - Registro novo (`persist` ausente): vira rascunho no IndexedDB (`drafts[draftKey]`) a cada mudança;
 *   sobrevive a recarregar a página. `clear()` ao criar ou descartar.
 * - Registro existente (`persist` presente): cada mudança é salva no próprio registro, sem botão "Salvar".
 * Em ambos: debounce de 500 ms, "salvo às HH:MM" e gravação do que estiver pendente ao fechar.
 */
export function useFormModel<T extends object>(draftKey: string, initial: T, persist?: (v: T) => Promise<void>) {
  const [value, setValue] = useState<T>(initial);
  const [savedAt, setSavedAt] = useState<string>();
  const [hasDraft, setHasDraft] = useState(false);
  const [loaded, setLoaded] = useState(!!persist);
  const dirty = useRef(false);
  const latest = useRef(value);
  latest.current = value;
  const saver = useRef(persist);
  saver.current = persist;
  const isDraft = !persist;

  useEffect(() => {
    if (!isDraft) return;
    let alive = true;
    db.drafts.get(draftKey).then((d) => {
      if (!alive) return;
      if (d?.value && typeof d.value === 'object') {
        setValue((v) => ({ ...v, ...(d.value as Partial<T>) }));
        setSavedAt(hhmm(new Date(d.updatedAt)));
        setHasDraft(true);
      }
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [draftKey, isDraft]);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    if (saver.current) await saver.current(latest.current);
    else await db.drafts.put({ key: draftKey, value: JSON.parse(JSON.stringify(latest.current)), updatedAt: new Date().toISOString() });
  }, [draftKey]);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    const t = setTimeout(async () => {
      await flush();
      setSavedAt(hhmm());
      if (isDraft) setHasDraft(true);
    }, DEBOUNCE);
    return () => clearTimeout(t);
  }, [value, loaded, flush, isDraft]);

  // fechar o formulário não perde nada que esteja pendente
  useEffect(() => () => { void flush(); }, [flush]);

  const set = useCallback((patch: Partial<T>) => { dirty.current = true; setValue((v) => ({ ...v, ...patch })); }, []);
  const reset = useCallback((v: T) => { setValue(v); }, []);
  const clear = useCallback(async () => {
    dirty.current = false;
    if (isDraft) await db.drafts.delete(draftKey);
    setSavedAt(undefined);
    setHasDraft(false);
  }, [draftKey, isDraft]);

  return { value, set, reset, clear, savedAt, hasDraft, loaded };
}
