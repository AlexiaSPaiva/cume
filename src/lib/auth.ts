import { db } from './db';

/**
 * Conta local: os dados ficam só neste aparelho (IndexedDB), então a senha
 * protege o acesso ao app aqui, não sincroniza com nenhum servidor.
 */

const SESSION_KEY = 'meuplano.session';

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 210_000, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

export async function hasAccount(): Promise<boolean> {
  return (await db.account.count()) > 0;
}

export async function createAccount(email: string, password: string) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await db.account.clear();
  await db.account.put({ email: email.trim().toLowerCase(), salt, passwordHash: await hash(password, salt) });
  startSession();
}

export async function login(email: string, password: string): Promise<boolean> {
  const acc = await db.account.get(email.trim().toLowerCase());
  if (!acc) return false;
  const ok = (await hash(password, acc.salt)) === acc.passwordHash;
  if (ok) startSession();
  return ok;
}

export async function accountEmail(): Promise<string | undefined> {
  return (await db.account.toCollection().first())?.email;
}

function startSession() {
  try { localStorage.setItem(SESSION_KEY, '1'); } catch { /* modo privado */ }
}

export function hasSession(): boolean {
  try { return localStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

export function logout() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
