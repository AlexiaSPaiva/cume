import { ACTIVE_DB_KEY, activeDbName, DB_NAME, openDb, type MeuPlanoDB } from './db';
import type { Account } from './types';
import { cloudOn, cloudSetPassword, cloudSignIn, cloudSignOut, cloudSignUp } from './cloud';

/**
 * Contas: os dados ficam neste aparelho (IndexedDB) e a senha protege o acesso aqui.
 * Com a nuvem ligada (cloud.ts), a mesma conta existe no Supabase e os dados são copiados para lá
 * (sync.ts), então dá para entrar em qualquer aparelho. Sem internet, a conta do aparelho continua entrando.
 * Cada conta tem o próprio banco (`dbName`):
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
export async function createAccount(email: string, password: string, cloudId?: string): Promise<Signed> {
  const r = registry();
  const e = norm(email);
  if (await r.account.get(e)) throw new Error('Já existe uma conta com esse e-mail neste aparelho. Use “Entrar”.');
  const others = await r.account.count();
  // o banco histórico só fica para a primeira conta, e só se ninguém tiver dados nele
  const legacyFree = others === 0 && !(await r.settings.get('me'));
  const dbName = legacyFree ? DB_NAME : `${DB_NAME}-${toHex(crypto.getRandomValues(new Uint8Array(5)).buffer)}`;
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await r.account.put({ email: e, salt, passwordHash: await hash(password, salt), dbName, cloudId });
  return enter(dbName);
}

export type Entered = Signed & {
  /** conta da nuvem ligada a este banco */
  cloudId?: string;
  /** conta nova neste aparelho: os dados ainda vão descer da nuvem */
  fresh?: boolean;
  /** entrou só no aparelho (sem nuvem); o motivo, para mostrar */
  warn?: string;
};

/** criar conta: na nuvem (se ligada) e neste aparelho */
export async function signUp(email: string, password: string): Promise<Entered> {
  if (await registry().account.get(norm(email))) throw new Error('Já existe uma conta com esse e-mail neste aparelho. Use “Entrar”.');
  if (!cloudOn()) return createAccount(email, password);
  const c = await cloudSignUp(norm(email), password);
  if (!c.ok && c.reason === 'existe') throw new Error('Já existe uma conta com esse e-mail. Use “Entrar”, logo acima.');
  if (!c.ok && c.reason !== 'rede') throw new Error(`Não foi possível criar a conta agora (${c.message ?? 'erro na nuvem'}). Tente de novo.`);
  const s = await createAccount(email, password, c.ok ? c.userId : undefined);
  return c.ok ? { ...s, cloudId: c.userId } : { ...s, warn: 'Sem internet: a conta foi criada neste aparelho e vai para a nuvem quando você entrar com internet.' };
}

async function linkCloud(acc: Account, cloudId: string, password?: string) {
  const patch: Partial<Account> = { cloudId };
  // a senha mudou em outro aparelho: este passa a aceitar a nova
  if (password) { patch.salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer); patch.passwordHash = await hash(password, patch.salt); }
  await registry().account.update(acc.email, patch);
}

/**
 * Entrar: confere na nuvem e no aparelho.
 * - nuvem ok + conta aqui: liga as duas (os dados daqui sobem);
 * - nuvem ok + sem conta aqui: cria a conta neste aparelho e os dados descem (aparelho novo);
 * - conta só aqui (de antes da nuvem): cria a mesma conta na nuvem, com a mesma senha, e sobe os dados;
 * - sem internet: entra só no aparelho.
 */
export async function signIn(email: string, password: string): Promise<Entered | 'sem-conta' | 'senha'> {
  const e = norm(email);
  const acc = await registry().account.get(e);
  const localOk = !!acc && (await hash(password, acc.salt)) === acc.passwordHash;
  const fail = !acc ? 'sem-conta' as const : !localOk ? 'senha' as const : null;
  if (!cloudOn()) return fail ?? enter(dbOf(acc!));

  const c = await cloudSignIn(e, password);
  if (c.ok) {
    if (acc) { await linkCloud(acc, c.userId, localOk ? undefined : password); return { ...enter(dbOf(acc)), cloudId: c.userId }; }
    const s = await createAccount(e, password, c.userId);
    return { ...s, cloudId: c.userId, fresh: true };
  }
  if (c.reason === 'credenciais') {
    if (fail) return fail;
    const u = await cloudSignUp(e, password);
    if (u.ok) { await linkCloud(acc!, u.userId); return { ...enter(dbOf(acc!)), cloudId: u.userId }; }
    return { ...enter(dbOf(acc!)), warn: 'Na nuvem, este e-mail usa outra senha. Você entrou neste aparelho; para sincronizar, saia e entre com a senha da nuvem (ou use “Esqueci a senha”).' };
  }
  if (fail) return fail;
  return { ...enter(dbOf(acc!)), warn: 'Sem conexão com a nuvem agora: você entrou neste aparelho e a sincronização volta sozinha.' };
}

/** senha nova vinda do link do e-mail: grava na nuvem e neste aparelho */
export async function finishRecovery(password: string): Promise<Entered> {
  const c = await cloudSetPassword(password);
  if (!c.ok || !c.email || !c.userId) throw new Error(c.message ?? 'O link expirou. Peça outro em “Esqueci a senha”.');
  const acc = await registry().account.get(norm(c.email));
  if (acc) { await linkCloud(acc, c.userId, password); return { ...enter(dbOf(acc)), cloudId: c.userId }; }
  const s = await createAccount(c.email, password, c.userId);
  return { ...s, cloudId: c.userId, fresh: true };
}

/** a conta do banco aberto agora */
export async function currentAccount(): Promise<Account | undefined> {
  const name = activeDbName();
  return (await accounts()).find((a) => dbOf(a) === name);
}

/** confere e-mail e senha; diz se a conta não existe NESTE navegador ou se a senha não confere */
export async function login(email: string, password: string): Promise<Signed | 'sem-conta' | 'senha'> {
  const acc = await registry().account.get(norm(email));
  if (!acc) return 'sem-conta';
  if ((await hash(password, acc.salt)) !== acc.passwordHash) return 'senha';
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
  void cloudSignOut();
}
