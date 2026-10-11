import { openDb, TRASHABLE_TABLES, type MeuPlanoDB } from './db';
import { seedExample } from './seed';

/**
 * Remove os DADOS DE EXEMPLO que entraram quando a conta foi criada com "Começar com dados de exemplo".
 * Não toca na conta, nas configurações nem em nada que a pessoa criou.
 *
 * Como reconhece o exemplo (as duas coisas juntas):
 * 1) os títulos/nomes são exatamente os do pacote de exemplo (gerado na hora num banco descartável);
 * 2) foram criados no mesmo instante em que o exemplo entrou (o exemplo grava tudo em poucos segundos).
 * Tudo o que foi criado nessa janela sai junto (registros de metas, anexos, lançamentos…).
 * Uma cópia do que saiu fica guardada em meta['exemplos-removidos-copia'], por segurança.
 * Roda uma única vez por banco.
 */

const DONE_KEY = 'exemplos-removidos-v1';
/** marca de exemplo pedido de propósito (demonstração/testes): esses não são removidos */
export const SEEDED_KEY = 'exemplos';
const WINDOW_BEFORE = 5_000;
const WINDOW_AFTER = 180_000;
const NAMED = new Set<string>(['objectives', 'goals', 'events']);

type Row = Record<string, unknown> & { id?: number; createdAt?: string; title?: string; name?: string };
const label = (r: Row) => (r.title ?? r.name ?? '') as string;

/** títulos do pacote de exemplo, por tabela */
async function exampleSignature(): Promise<Map<string, Set<string>>> {
  const name = `cume-exemplo-${Date.now()}`;
  const probe = openDb(name);
  try {
    await probe.settings.put({ id: 'me' } as never);
    await seedExample(probe);
    const sig = new Map<string, Set<string>>();
    for (const t of TRASHABLE_TABLES) {
      const rows = (await probe.table(t).toArray()) as Row[];
      sig.set(t, new Set(rows.map(label).filter(Boolean)));
    }
    return sig;
  } finally {
    probe.close();
    await probe.delete();
  }
}

export async function removeExampleData(d: MeuPlanoDB): Promise<number> {
  if (await d.meta.get(DONE_KEY)) return 0;
  if (await d.meta.get(SEEDED_KEY)) { await d.meta.put({ key: DONE_KEY, value: 'exemplo pedido de propósito' }); return 0; }

  const sig = await exampleSignature();
  const seedTitles = sig.get('tasks')!;
  const tasks = (await d.tasks.toArray()) as unknown as Row[];
  // instante do exemplo: o createdAt mais comum entre as tarefas com títulos do exemplo
  const counts = new Map<string, number>();
  for (const t of tasks) if (t.createdAt && seedTitles.has(label(t))) counts.set(t.createdAt, (counts.get(t.createdAt) ?? 0) + 1);
  const [seedAt, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  // precisa de muitas coincidências: uma tarefa real chamada "Academia" não basta
  if (!seedAt || n < 10) { await d.meta.put({ key: DONE_KEY, value: 'sem exemplo' }); return 0; }

  const t0 = Date.parse(seedAt);
  const inWindow = (r: Row) => !!r.createdAt && Date.parse(r.createdAt) >= t0 - WINDOW_BEFORE && Date.parse(r.createdAt) <= t0 + WINDOW_AFTER;
  const removed: Record<string, Row[]> = {};
  let total = 0;
  await d.transaction('rw', [...TRASHABLE_TABLES, 'plans', 'blobs', 'meta', 'settings'], async () => {
    // confere de novo dentro da transação: um exemplo pedido de propósito pode ter começado a entrar agora
    if (await d.meta.get(SEEDED_KEY)) { total = -1; return; }
    for (const t of TRASHABLE_TABLES) {
      // na v6 metas, objetivos e eventos de exemplo não tinham data de criação: aí vale o nome exato do exemplo
      const byName = NAMED.has(t) ? sig.get(t)! : new Set<string>();
      const rows = ((await d.table(t).toArray()) as Row[]).filter((r) => inWindow(r) || byName.has(label(r)));
      if (!rows.length) continue;
      removed[t] = rows;
      await d.table(t).bulkDelete(rows.map((r) => r.id!));
      total += rows.length;
      if (t === 'attachments') for (const a of rows) if (a.blobKey) await d.blobs.delete(a.blobKey as string);
    }
    const plans = ((await d.plans.toArray()) as unknown as Row[]).filter(inWindow);
    if (plans.length) { removed.plans = plans; await d.plans.bulkDelete(plans.map((p) => p.weekStart as string)); }
    // a meta de renda extra de exemplo (R$ 1.500) também era do pacote
    const s = await d.settings.get('me');
    if (s?.freelanceGoal === 1500) await d.settings.update('me', { freelanceGoal: undefined });
    await d.meta.put({ key: 'exemplos-removidos-copia', value: { at: new Date().toISOString(), seedAt, removed } });
    await d.meta.put({ key: DONE_KEY, value: `${total} itens de exemplo removidos` });
  });
  if (total < 0) { await d.meta.put({ key: DONE_KEY, value: 'exemplo pedido de propósito' }); return 0; }
  return total;
}
