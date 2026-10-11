import { describe, expect, it } from 'vitest';
import { addFileAttachment, getBlob } from '../../src/lib/attachments';
import { onLocalChange } from '../../src/lib/db';
import { memKV, Pending, SyncEngine, type PushRow, type Remote, type RemoteRow } from '../../src/lib/sync';
import { softDelete } from '../../src/lib/trash';
import { bytes, open, pdfBlob, PDF_BYTES, uniqueName } from './helpers';

/** a nuvem de mentira: guarda as linhas e os arquivos na memória, com o mesmo critério do Supabase */
class MemoryCloud {
  rows = new Map<string, RemoteRow>();
  files = new Map<string, Blob>();
  private clock = Date.parse('2026-10-11T12:00:00.000Z');
  as(userId: string): Remote {
    const c = this;
    return {
      userId,
      async pull(since) {
        return [...c.rows.values()].filter((r) => !since || r.at > since).sort((a, b) => a.at.localeCompare(b.at));
      },
      async push(rows: PushRow[]) {
        for (const r of rows) {
          const k = `${r.tbl}|${r.pk}`;
          const cur = c.rows.get(k);
          if (cur && r.cu < cur.cu) continue;
          c.rows.set(k, { ...r, data: r.data ? structuredClone(r.data) : null, at: new Date(++c.clock).toISOString() });
        }
      },
      async hasData() { return c.rows.size > 0; },
      async upload(key, blob) { c.files.set(`${userId}/${key}`, blob); },
      async download(key) { return c.files.get(`${userId}/${key}`) ?? null; },
    };
  }
}

const kv = memKV();
const pending = new Pending(kv);
onLocalChange((name, t, pk) => pending.add(name, t, pk));
const tick = () => new Promise((r) => setTimeout(r, 5));

function device(cloud: MemoryCloud, user = 'u1') {
  const name = uniqueName('sync');
  const d = open(name);
  return { d, name, engine: new SyncEngine(d, name, cloud.as(user), pending, kv) };
}

describe('sincronização com a nuvem', () => {
  it('o que um aparelho cria aparece no outro, inclusive o PDF', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    const goalId = (await a.d.goals.add({ title: 'Reserva', metric: 'valor', initial: 0, current: 0, target: 1000, area: 'financeiro' })) as number;
    const taskId = (await a.d.tasks.add({ title: 'Guardar R$ 100', area: 'financeiro', status: 'afazer', priority: 'alta', goalId })) as number;
    const docId = (await a.d.docs.add({ name: 'Edital.pdf', type: 'Documento', storage: 'arquivo' })) as number;
    const attId = await addFileAttachment({ type: 'doc', id: docId }, 'notice', Object.assign(pdfBlob(), { name: 'Edital.pdf' }), {}, a.d);
    await a.d.docs.update(docId, { attachmentId: attId });
    await tick();
    const up = await a.engine.sync();
    expect(up.up).toBeGreaterThanOrEqual(4);

    const b = device(cloud);
    await b.engine.sync();
    expect((await b.d.tasks.get(taskId))?.goalId).toBe(goalId);
    const att = await b.d.attachments.get(attId);
    expect(await bytes(await getBlob(att!, b.d))).toEqual([...PDF_BYTES]);
    // o que veio da nuvem não volta como pendente
    await tick();
    expect(pending.of(b.name).size).toBe(0);
  });

  it('editar, mandar para a Lixeira e excluir de vez chegam ao outro aparelho', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    const b = device(cloud);
    const t1 = (await a.d.tasks.add({ title: 'Ler capítulo 1', area: 'academica', status: 'afazer', priority: 'media' })) as number;
    const t2 = (await a.d.tasks.add({ title: 'Ligar para o banco', area: 'adultices', status: 'afazer', priority: 'baixa' })) as number;
    await tick();
    await a.engine.sync();
    await b.engine.sync();

    await tick();
    await b.d.tasks.update(t1, { status: 'concluido' });
    await softDelete(b.d, 'tasks', t2);
    await tick();
    await b.engine.sync();
    await a.engine.sync();
    expect((await a.d.tasks.get(t1))?.status).toBe('concluido');
    expect((await a.d.tasks.get(t2))?.deletedAt).toBeTruthy();

    await a.d.tasks.delete(t2);
    await tick();
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.d.tasks.get(t2)).toBeUndefined();
    expect(await b.d.tasks.get(t1)).toBeTruthy();
  });

  it('no mesmo registro vence a mudança mais recente', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    const b = device(cloud);
    const id = (await a.d.tasks.add({ title: 'Original', area: 'pessoal', status: 'afazer', priority: 'media' })) as number;
    await tick();
    await a.engine.sync();
    await b.engine.sync();

    await a.d.tasks.update(id, { title: 'Editada no A (antes)' });
    await tick();
    await b.d.tasks.update(id, { title: 'Editada no B (depois)' });
    await tick();
    // o A sobe primeiro, mas a mudança do B é mais nova
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();
    expect((await a.d.tasks.get(id))?.title).toBe('Editada no B (depois)');
    expect((await b.d.tasks.get(id))?.title).toBe('Editada no B (depois)');
  });

  it('aparelho com dados antigos (ids 1, 2…) entra numa conta que já tem dados: nada colide nem se perde', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    await a.d.goals.add({ id: 1, title: 'Meta do A', metric: 'tarefas', initial: 0, current: 0, target: 1, area: 'saude', createdAt: '2026-01-01T00:00:00.000Z' });
    await a.d.tasks.add({ id: 1, title: 'Tarefa do A', area: 'saude', status: 'afazer', priority: 'media', goalId: 1, createdAt: '2026-01-01T00:00:00.000Z' });
    await tick();
    await a.engine.sync();

    const b = device(cloud);
    await b.d.goals.add({ id: 1, title: 'Meta do B', metric: 'tarefas', initial: 0, current: 0, target: 1, area: 'academica', createdAt: '2026-02-02T00:00:00.000Z' });
    await b.d.tasks.add({ id: 1, title: 'Tarefa do B', area: 'academica', status: 'afazer', priority: 'media', goalId: 1, createdAt: '2026-02-02T00:00:00.000Z' });
    await tick();
    await b.engine.sync();
    await a.engine.sync();

    for (const d of [a.d, b.d]) {
      const tasks = await d.tasks.toArray();
      const goals = await d.goals.toArray();
      expect(tasks.map((t) => t.title).sort()).toEqual(['Tarefa do A', 'Tarefa do B']);
      // cada tarefa continua ligada à própria meta
      for (const t of tasks) expect(goals.find((g) => g.id === t.goalId)?.title).toBe(t.title === 'Tarefa do A' ? 'Meta do A' : 'Meta do B');
    }
    expect((await a.d.tasks.get(1))?.title).toBe('Tarefa do A');
  });

  it('religar o mesmo aparelho (estado perdido) não duplica nada', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    await a.d.tasks.add({ id: 7, title: 'Única', area: 'pessoal', status: 'afazer', priority: 'media', createdAt: '2026-03-03T00:00:00.000Z' });
    await tick();
    await a.engine.sync();
    kv.del(`cume.sync.estado.${a.name}`);
    const again = new SyncEngine(a.d, a.name, cloud.as('u1'), pending, kv);
    await again.sync();
    expect(await a.d.tasks.count()).toBe(1);
    expect([...cloud.rows.keys()].filter((k) => k.startsWith('tasks|'))).toEqual(['tasks|7']);
  });

  it('a lista do que falta subir sobrevive a fechar o app', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    await a.engine.sync();
    const id = (await a.d.tasks.add({ title: 'Feita sem internet', area: 'pessoal', status: 'afazer', priority: 'media' })) as number;
    await tick();
    // "reabre o app": uma lista nova lida do armazenamento
    const reopened = new Pending(kv);
    expect(reopened.of(a.name).has(`tasks|${id}`)).toBe(true);
    await new SyncEngine(a.d, a.name, cloud.as('u1'), reopened, kv).sync();
    expect(cloud.rows.get(`tasks|${id}`)?.data?.title).toBe('Feita sem internet');
  });
});
