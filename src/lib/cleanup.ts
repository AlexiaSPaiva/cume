import { openDb, TRASHABLE_TABLES, type MeuPlanoDB } from './db';
import { seedExample } from './seed';
import { labelHash } from './labelHash';
import { LEGACY_EXAMPLE_HASHES } from './seedLegacy';

/**
 * Remove os DADOS DE EXEMPLO que entraram quando a conta foi criada com "Começar com dados de exemplo".
 * Não toca na conta, nas configurações nem em nada que a pessoa criou.
 *
 * Como reconhece o exemplo (as duas coisas juntas):
 * 1) os títulos/nomes são exatamente os do pacote de exemplo (gerado na hora num banco descartável)
 *    ou os do pacote antigo, guardados só como hash em seedLegacy.ts;
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

/** reconhece um título do exemplo: o pacote atual (texto) ou o antigo (hash) */
interface Signature { has: (table: string, title: string) => boolean }

/** títulos do pacote de exemplo, por tabela */
async function exampleSignature(): Promise<Signature> {
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
    const legacy = new Map(Object.entries(LEGACY_EXAMPLE_HASHES).map(([t, hs]) => [t, new Set(hs)]));
    return { has: (t, title) => !!title && (!!sig.get(t)?.has(title) || !!legacy.get(t)?.has(labelHash(title))) };
  } finally {
    probe.close();
    await probe.delete();
  }
}

/** editado pela pessoa depois de criado (passou da janela do exemplo): é dela, não sai */
const edited = (r: Row) => !!r.createdAt && !!r.updatedAt && Date.parse(r.updatedAt as string) - Date.parse(r.createdAt) > WINDOW_AFTER;

/** tira dos candidatos o que algo que FICA referencia (laço até estabilizar) */
function keepReferenced(cand: Map<string, Row[]>, tasks: Row[], goals: Row[], docs: Row[]) {
  const ids = (t: string) => new Set((cand.get(t) ?? []).map((r) => r.id));
  for (let i = 0; i < 3; i++) {
    const goneTasks = ids('tasks'), goneGoals = ids('goals'), goneDocs = ids('docs');
    const keptTasks = tasks.filter((x) => !goneTasks.has(x.id));
    const keptGoals = goals.filter((x) => !goneGoals.has(x.id));
    const keptDocs = docs.filter((x) => !goneDocs.has(x.id));
    const needGoals = new Set(keptTasks.map((x) => x.goalId));
    const needObjs = new Set(keptGoals.map((x) => x.objectiveId));
    const needAtts = new Set(keptDocs.map((x) => x.attachmentId));
    cand.set('goals', (cand.get('goals') ?? []).filter((r) => !needGoals.has(r.id)));
    cand.set('objectives', (cand.get('objectives') ?? []).filter((r) => !needObjs.has(r.id)));
    cand.set('attachments', (cand.get('attachments') ?? []).filter((r) => !needAtts.has(r.id)));
  }
}

/**
 * Devolve, uma vez, o que a primeira versão da limpeza tirou mas era da pessoa:
 * itens de exemplo que ela tinha editado, e metas/objetivos/anexos que algo dela usa.
 * Vem da cópia de segurança guardada na limpeza; nada que já existe é sobrescrito.
 */
export async function restoreEditedExamples(d: MeuPlanoDB): Promise<number> {
  const KEY = 'exemplos-restaurados-v1';
  if (await d.meta.get(KEY)) return 0;
  const copy = (await d.meta.get('exemplos-removidos-copia'))?.value as { removed?: Record<string, Row[]> } | undefined;
  let n = 0;
  if (copy?.removed) {
    const removed = copy.removed;
    await d.transaction('rw', [...TRASHABLE_TABLES, 'plans', 'blobs', 'meta'], async () => {
      const back = new Map<string, Row[]>();
      for (const [t, rows] of Object.entries(removed)) back.set(t, rows.filter(edited));
      // referências: tarefas/metas/documentos que existem hoje (ou que voltam agora)
      const live = async (t: string) => [...((await d.table(t).toArray()) as Row[]), ...(back.get(t) ?? [])];
      const tasks = await live('tasks'), goals = await live('goals'), docs = await live('docs');
      const needGoals = new Set(tasks.map((x) => x.goalId));
      back.set('goals', [...(back.get('goals') ?? []), ...(removed.goals ?? []).filter((r) => needGoals.has(r.id))]);
      const needObjs = new Set([...goals, ...(back.get('goals') ?? [])].map((x) => x.objectiveId));
      back.set('objectives', [...(back.get('objectives') ?? []), ...(removed.objectives ?? []).filter((r) => needObjs.has(r.id))]);
      const needAtts = new Set(docs.map((x) => x.attachmentId));
      back.set('attachments', [...(back.get('attachments') ?? []), ...(removed.attachments ?? []).filter((r) => needAtts.has(r.id))]);
      for (const [t, rows] of back) {
        const table = t === 'plans' ? d.plans : d.table(t);
        for (const r of rows) {
          const pk = t === 'plans' ? r.weekStart : r.id;
          if (pk == null || (await table.get(pk as never))) continue;
          // anexo cujo arquivo já não existe não volta (ficaria quebrado); link volta
          if (t === 'attachments' && r.blobKey && !(await d.blobs.get(r.blobKey as string))) continue;
          await table.put(r as never);
          n++;
        }
      }
    });
  }
  await d.meta.put({ key: KEY, value: `${n} itens devolvidos` });
  return n;
}

export async function removeExampleData(d: MeuPlanoDB): Promise<number> {
  if (await d.meta.get(DONE_KEY)) return 0;
  if (await d.meta.get(SEEDED_KEY)) { await d.meta.put({ key: DONE_KEY, value: 'exemplo pedido de propósito' }); return 0; }

  const sig = await exampleSignature();
  const tasks = (await d.tasks.toArray()) as unknown as Row[];
  // instante do exemplo: o createdAt mais comum entre as tarefas com títulos do exemplo
  const counts = new Map<string, number>();
  for (const t of tasks) if (t.createdAt && sig.has('tasks', label(t))) counts.set(t.createdAt, (counts.get(t.createdAt) ?? 0) + 1);
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
    // candidatos: criados no instante do exemplo (ou, na v6, com o nome exato do exemplo) e NUNCA editados depois
    const cand = new Map<string, Row[]>();
    for (const t of TRASHABLE_TABLES) {
      // na v6 metas, objetivos e eventos de exemplo não tinham data de criação: aí vale o nome exato do exemplo
      const byName = (r: Row) => NAMED.has(t) && sig.has(t, label(r));
      cand.set(t, ((await d.table(t).toArray()) as Row[]).filter((r) => (inWindow(r) || byName(r)) && !edited(r)));
    }
    // o que a pessoa usa fica: meta ligada a uma tarefa dela, objetivo de uma meta que fica, anexo de um documento que fica
    keepReferenced(cand, (await d.tasks.toArray()) as unknown as Row[], (await d.goals.toArray()) as unknown as Row[], (await d.docs.toArray()) as unknown as Row[]);
    for (const t of TRASHABLE_TABLES) {
      const rows = cand.get(t)!;
      if (!rows.length) continue;
      removed[t] = rows;
      // os arquivos (blobs) ficam guardados: a cópia de segurança pode ser restaurada inteira
      await d.table(t).bulkDelete(rows.map((r) => r.id!));
      total += rows.length;
    }
    const plans = ((await d.plans.toArray()) as unknown as Row[]).filter((r) => inWindow(r) && !edited(r));
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
