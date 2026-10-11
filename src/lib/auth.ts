import { ACTIVE_DB_KEY, activeDbName, DB_NAME, openDb, type MeuPlanoDB } from './db';
import type { Account } from './types';

/**
 * Contas locais: os dados ficam neste aparelho (IndexedDB) e a senha protege o acesso aqui;
 * nada vai para um servidor. Cada conta tem o próprio banco (`dbName`):
 * - a primeira conta do aparelho (e as contas da v6) usa o banco histórico `meuplano`;
 * - as outras ganham `meuplano-<código>`.
 * A lista de contas fica sempre no banco `meuplano`, para a tela de entrada achar todas.
 */

// nome histórico, não alterar: guarda os dados da usuária
const SESSION_KEY = 'meuplano.session';

let reg: MeuPlanoDB | null = null;
/** banco que guarda a lista de contas (sempre o histórico) */
export const registry = () => (reg ??= openDb(DB_NAME));

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

const norm = (email: string) => email.trim().toLowerCase();
export const dbOf = (a: Account) => a.dbName ?? DB_NAME;

export async function accounts(): Promise<Account[]> {
  return registry().account.toArray();
}

export async function hasAccount(): Promise<boolean> {
  return (await registry().account.count()) > 0;
}

export type Signed = { dbName: string; reload: boolean };

/** cria uma conta nova (e-mail único neste aparelho); devolve o banco dela */
export async function createAccount(email: string, password: string): Promise<Signed> {
  const r = registry();
  const e = norm(email);
  if (await r.account.get(e)) throw new Error('Já existe uma conta com esse e-mail neste aparelho. Use “Entrar”.');
  const others = await r.account.count();
  // o banco histórico só fica para a primeira conta, e só se ninguém tiver dados nele
  const legacyFree = others === 0 && !(await r.settings.get('me'));
  const dbName = legacyFree ? DB_NAME : `${DB_NAME}-${toHex(crypto.getRandomValues(new Uint8Array(5)).buffer)}`;
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await r.account.put({ email: e, salt, passwordHash: await hash(password, salt), dbName });
  return enter(dbName);
}

/** confere e-mail e senha; null = não confere */
export async function login(email: string, password: string): Promise<Signed | null> {
  const acc = await registry().account.get(norm(email));
  if (!acc) return null;
  if ((await hash(password, acc.salt)) !== acc.passwordHash) return null;
  return enter(dbOf(acc));
}

/** nova senha para uma conta que já existe neste aparelho (os dados continuam) */
export async function resetPassword(email: string, password: string): Promise<Signed | null> {
  const r = registry();
  const acc = await r.account.get(norm(email));
  if (!acc) return null;
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await r.account.put({ ...acc, salt, passwordHash: await hash(password, salt) });
  return enter(dbOf(acc));
}

function enter(dbName: string): Signed {
  const reload = dbName !== activeDbName();
  try {
    localStorage.setItem(ACTIVE_DB_KEY, dbName);
    localStorage.setItem(SESSION_KEY, '1');
    // quem acabou de entrar vê as boas-vindas (se não tiver dispensado)
    sessionStorage.removeItem('cume.boasvindas.fechada');
  } catch { /* modo privado */ }
  return { dbName, reload };
}

export function hasSession(): boolean {
  try { return localStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

export function logout() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
