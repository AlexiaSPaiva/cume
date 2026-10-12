import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PushRow, Remote, RemoteRow } from './sync';
import type { Row } from './backup';

/**
 * Nuvem (Supabase): contas e cópia dos dados para usar o Cume° em qualquer aparelho.
 * Sem as variáveis VITE_SUPABASE_* o app funciona só no aparelho, como antes (os testes rodam assim).
 * A chave pública pode ficar no app: cada pessoa só lê e grava as próprias linhas (regras no banco, supabase/schema.sql).
 */

// tira espaços e caracteres invisíveis (ex.: o BOM que o Windows põe ao colar o valor)
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[^!-~]/g, '') : '') || undefined;
const URL_ = clean(import.meta.env.VITE_SUPABASE_URL);
const KEY = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

// o link do e-mail "esqueci a senha" chega com #...type=recovery; guardado antes do cliente limpar o endereço
export const recoveryLink = typeof location !== 'undefined' && /type=recovery/.test(location.hash);

export const cloud: SupabaseClient | null = URL_ && KEY
  ? createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'cume.nuvem' } })
  : null;

export const cloudOn = () => cloud != null;

export type CloudSignIn = { ok: true; userId: string } | { ok: false; reason: 'credenciais' | 'rede' | 'outro'; message?: string };

const offline = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e);
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network|Failed to|Load failed|timeout/i.test(m);
};

export async function cloudSignIn(email: string, password: string): Promise<CloudSignIn> {
  if (!cloud) return { ok: false, reason: 'outro' };
  try {
    const { data, error } = await cloud.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, reason: error.status === 400 || /invalid/i.test(error.message) ? 'credenciais' : offline(error) ? 'rede' : 'outro', message: error.message };
    return { ok: true, userId: data.user.id };
  } catch (e) {
    return { ok: false, reason: offline(e) ? 'rede' : 'outro', message: String(e) };
  }
}

export type CloudSignUp = { ok: true; userId: string } | { ok: false; reason: 'existe' | 'rede' | 'outro'; message?: string };

export async function cloudSignUp(email: string, password: string): Promise<CloudSignUp> {
  if (!cloud) return { ok: false, reason: 'outro' };
  try {
    const { data, error } = await cloud.auth.signUp({ email, password });
    if (error) return { ok: false, reason: /already|registered|exists/i.test(error.message) ? 'existe' : offline(error) ? 'rede' : 'outro', message: error.message };
    // com "confirmar e-mail" ligado o Supabase devolve um usuário sem identidades quando o e-mail já existe
    if (!data.user || data.user.identities?.length === 0) return { ok: false, reason: 'existe' };
    if (!data.session) {
      const s = await cloudSignIn(email, password);
      return s.ok ? s : { ok: false, reason: 'outro', message: s.message };
    }
    return { ok: true, userId: data.user.id };
  } catch (e) {
    return { ok: false, reason: offline(e) ? 'rede' : 'outro', message: String(e) };
  }
}

export async function cloudUserId(): Promise<string | null> {
  if (!cloud) return null;
  const { data } = await cloud.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function cloudSignOut() {
  if (!cloud) return;
  try { await cloud.auth.signOut({ scope: 'local' }); } catch { /* sem internet: a sessão local some mesmo assim */ }
}

/** e-mail com o link para criar uma senha nova */
export async function cloudSendReset(email: string): Promise<{ ok: boolean; message?: string }> {
  if (!cloud) return { ok: false };
  const { error } = await cloud.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** depois de abrir o link do e-mail: grava a senha nova na nuvem */
export async function cloudSetPassword(password: string): Promise<{ ok: boolean; email?: string; userId?: string; message?: string }> {
  if (!cloud) return { ok: false };
  const { data, error } = await cloud.auth.updateUser({ password });
  return error ? { ok: false, message: error.message } : { ok: true, email: data.user.email, userId: data.user.id };
}

/* ---------- a nuvem para a sincronização ---------- */

const PAGE = 1000;

export class SupabaseRemote implements Remote {
  constructor(private c: SupabaseClient, readonly userId: string) {}

  async pull(since: string | null): Promise<RemoteRow[]> {
    const out: RemoteRow[] = [];
    for (let off = 0; ; off += PAGE) {
      let q = this.c.from('rows').select('tbl,pk,data,deleted,client_updated_at,updated_at')
        .order('updated_at').order('tbl').order('pk').range(off, off + PAGE - 1);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q;
      if (error) throw error;
      for (const r of data ?? []) {
        out.push({ tbl: r.tbl, pk: r.pk, data: r.data as Row | null, deleted: r.deleted, cu: r.client_updated_at, at: new Date(r.updated_at).toISOString() });
      }
      if (!data || data.length < PAGE) return out;
    }
  }

  async push(rows: PushRow[]): Promise<void> {
    const { error } = await this.c.rpc('push_rows', { items: rows });
    if (error) throw error;
  }

  async hasData(): Promise<boolean> {
    const { count, error } = await this.c.from('rows').select('pk', { count: 'exact', head: true });
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async upload(key: string, blob: Blob): Promise<void> {
    const { error } = await this.c.storage.from('arquivos').upload(`${this.userId}/${key}`, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (error) throw error;
  }

  async download(key: string): Promise<Blob | null> {
    const { data, error } = await this.c.storage.from('arquivos').download(`${this.userId}/${key}`);
    return error ? null : data;
  }
}

/** endereço temporário (1 h) do arquivo na nuvem: abre no leitor do próprio aparelho (Safari, Chrome, Livros…) */
export async function cloudFileUrl(key: string): Promise<string | null> {
  if (!cloud) return null;
  try {
    const uid = await cloudUserId();
    if (!uid) return null;
    const { data, error } = await cloud.storage.from('arquivos').createSignedUrl(`${uid}/${key}`, 3600);
    return error ? null : data.signedUrl;
  } catch { return null; }
}

/** arquivo que ainda não desceu para este aparelho */
export async function cloudFile(key: string): Promise<Blob | null> {
  if (!cloud) return null;
  try {
    const uid = await cloudUserId();
    if (!uid) return null;
    const { data, error } = await cloud.storage.from('arquivos').download(`${uid}/${key}`);
    return error ? null : data;
  } catch { return null; }
}
