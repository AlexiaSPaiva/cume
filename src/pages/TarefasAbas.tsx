import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '../components/Card';
import { TaskMenu } from '../components/ItemMenu';
import { useUI } from '../components/Overlays';
import { SwipeRow } from '../components/SwipeRow';
import { AreaTag, Empty, Stat, Stats } from '../components/ui';
import { AREAS, AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, today } from '../lib/dates';
import { lastReason, wasFor } from '../lib/tasks';
import { daysLeft, restore } from '../lib/trash';
import type { AreaId, Task, TaskStatus } from '../lib/types';

const STATUS: Record<TaskStatus, string> = {
  afazer: 'a fazer', hoje: 'hoje', andamento: 'em andamento', aguardando: 'aguardando', concluido: 'concluída', adiada: 'adiada',
};
const fmtTo = (to?: string) => !to ? '—' : to === 'backlog' ? 'backlog' : to === 'planejamento' ? 'Planejamento' : `${ddmm(to.slice(0, 10))}${to.length > 10 ? ` ${to.slice(11)}` : ''}`;
const reasonKey = (t: Task) => {
  const e = [...(t.postponeLog ?? [])].reverse().find((x) => x.kind === 'adiada');
  if (!e) return 'sem motivo';
  if (e.reasonId) return 'Imprevisto';
  return (e.reasonText ?? 'sem motivo').split(':')[0];
};

/* =============================== Adiadas =============================== */

export function TabAdiadas() {
  const d = useData();
  const ui = useUI();
  const [area, setArea] = useState<AreaId | ''>('');
  const [motivo, setMotivo] = useState('');
  const [periodo, setPeriodo] = useState<'7' | '30' | ''>('');
  const t0 = today();
  const month = t0.slice(0, 7);

  const postponed = d.tasks.filter((t) => t.status === 'adiada');
  const logs = d.tasks.flatMap((t) => (t.postponeLog ?? []).map((e) => ({ t, e })));
  const monthPost = logs.filter(({ e }) => e.kind === 'adiada' && e.at.slice(0, 7) === month);
  const monthTasks = new Set(monthPost.map(({ t }) => t.id));
  const realocadas = [...monthTasks].filter((id) => d.tasks.find((t) => t.id === id)?.status !== 'adiada').length;
  const worst = [...d.tasks].filter((t) => (t.postponedCount ?? 0) > 0 && t.status !== 'concluido').sort((a, b) => (b.postponedCount ?? 0) - (a.postponedCount ?? 0))[0];
  const reasons = new Map<string, number>();
  for (const { t } of monthPost) reasons.set(reasonKey(t), (reasons.get(reasonKey(t)) ?? 0) + 1);
  const topReason = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
  const ever = d.tasks.filter((t) => (t.postponedCount ?? 0) > 0);
  const retomada = ever.length ? Math.round((ever.filter((t) => t.status === 'concluido').length / ever.length) * 100) : null;

  const lastAt = (t: Task) => [...(t.postponeLog ?? [])].reverse().find((x) => x.kind === 'adiada')?.at.slice(0, 10) ?? t.date ?? '';
  const list = postponed
    .filter((t) => !area || t.area === area)
    .filter((t) => !motivo || reasonKey(t) === motivo)
    .filter((t) => !periodo || lastAt(t) >= addDays(t0, -Number(periodo)))
    .sort((a, b) => (b.postponedCount ?? 0) - (a.postponedCount ?? 0));
  const allReasons = [...new Set(postponed.map(reasonKey))];

  return (
    <>
      <Stats>
        <Stat k="Adiadas agora" v={postponed.length} s="pedem uma decisão" />
        <Stat k="Adiadas no mês" v={monthPost.length} s={`${realocadas} já ${realocadas === 1 ? 'realocada' : 'realocadas'}`} />
        <Stat k="Mais adiada" v={worst ? `${worst.title} · ${worst.postponedCount}x` : '—'} s={worst ? AREA[worst.area].name : 'nenhuma'} />
        <Stat k="Motivo mais comum" v={topReason?.[0] ?? '—'} s={topReason ? `${topReason[1]} de ${monthPost.length} no mês` : 'sem adiamentos no mês'} />
        <Stat k="Taxa de retomada" v={retomada != null ? `${retomada}%` : '—'} s="adiadas que foram concluídas" />
      </Stats>

      <div className="grid g3">
        <Card title="Adiadas" className="span2" wide act={
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <select className="input sm" value={area} onChange={(e) => setArea(e.target.value as AreaId | '')} aria-label="Filtrar por área">
              <option value="">área</option>{AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="input sm" value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Filtrar por motivo">
              <option value="">motivo</option>{allReasons.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="input sm" value={periodo} onChange={(e) => setPeriodo(e.target.value as '7' | '30' | '')} aria-label="Filtrar por período">
              <option value="">período</option><option value="7">7 dias</option><option value="30">30 dias</option>
            </select>
          </span>}>
          <div className="adi-head" aria-hidden="true"><span>Tarefa</span><span>Área</span><span>Era para</span><span>Adiada</span><span>Motivo</span><span>Ações</span></div>
          <div className="adi-list">
            {list.map((t) => {
              const reasonId = [...(t.postponeLog ?? [])].reverse().find((x) => x.kind === 'adiada')?.reasonId;
              const imp = reasonId ? d.imprevistos.find((i) => i.id === reasonId) : undefined;
              const was = wasFor(t);
              return (
                <SwipeRow key={t.id} label={t.title} actions={[
                  { label: 'Realocar', tone: 'gold', run: () => ui.openReschedule(t) },
                  { label: 'Excluir', tone: 'danger', run: () => void ui.remove('tasks', t.id!, `“${t.title}”`) },
                ]}>
                  <div className="adi-row">
                    <button type="button" className="plain adi-title" onClick={() => ui.openTask(t)}><b>{t.title}</b></button>
                    <span className="adi-area"><AreaTag area={t.area} /></span>
                    <span className="adi-was muted">{was ? ddmm(was) : 'sem dia'}</span>
                    <span><span className={`tag ${(t.postponedCount ?? 0) >= 3 ? 'bad' : (t.postponedCount ?? 0) >= 2 ? 'warn' : ''}`}>{t.postponedCount ?? 1}x</span></span>
                    <span className="adi-why muted">
                      {imp ? <button type="button" className="add-link" style={{ margin: 0, padding: 0 }} onClick={() => ui.openImprevisto(imp)}>{imp.title}</button> : lastReason(t)}
                    </span>
                    <span className="adi-act">
                      <button type="button" className="btn sm out" onClick={() => ui.openReschedule(t)}>Realocar</button>
                      <TaskMenu t={t} />
                    </span>
                  </div>
                </SwipeRow>
              );
            })}
            {list.length === 0 && <Empty>{postponed.length ? 'Nenhuma adiada com esses filtros.' : 'Nada adiado. Bom ritmo!'}</Empty>}
          </div>
          {list.length > 0 && <p className="hint only-touch" style={{ margin: '8px 0 0' }}>← deslize para agir</p>}
        </Card>
        <History />
      </div>
    </>
  );
}

/** últimos 30 dias: o que foi realocado (de → para, resultado) e o que foi excluído (restaurar) */
function History() {
  const d = useData();
  const ui = useUI();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const deleted = useLiveQuery(() => db.tasks.where('deletedAt').above(since).toArray(), [since]) ?? [];
  const moved = d.tasks.flatMap((t) => (t.postponeLog ?? []).filter((e) => e.kind === 'realocada' && e.at >= since).map((e) => ({ t, e })))
    .sort((a, b) => b.e.at.localeCompare(a.e.at));
  const items = [
    ...moved.map(({ t, e }) => ({ at: e.at, node: (
      <div key={`m${t.id}${e.at}`} className="hist-item">
        <span className="tag ok">realocada</span>
        <span className="grow">{t.title} · {e.from ? `de ${ddmm(e.from)} ` : ''}para {fmtTo(e.to)}</span>
        <span className={t.status === 'concluido' ? 'ok-t' : 'muted'}>{t.status === 'concluido' ? '✓ concluída' : t.status === 'adiada' ? 'adiada de novo' : 'agendada'}</span>
      </div>
    ) })),
    ...deleted.map((t) => ({ at: t.deletedAt!, node: (
      <div key={`d${t.id}`} className="hist-item">
        <span className="tag bad">excluída</span>
        <span className="grow">{t.title} · {ddmm(t.deletedAt!.slice(0, 10))}</span>
        <button type="button" className="add-link" style={{ margin: 0 }} onClick={async () => { await restore(db, 'tasks', t.id!); ui.toast(`“${t.title}” voltou.`); }}>
          restaurar · {daysLeft(t.deletedAt!)} dias
        </button>
      </div>
    ) })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card title="Histórico · últimos 30 dias">
      <div className="list">
        {items.slice(0, 20).map((x) => x.node)}
        {items.length === 0 && <Empty>Nada realocado ou excluído nos últimos 30 dias.</Empty>}
      </div>
    </Card>
  );
}

/* =============================== Lista =============================== */

export function TabLista() {
  const d = useData();
  const ui = useUI();
  const [st, setSt] = useState<TaskStatus | 'abertas' | ''>('abertas');
  const [area, setArea] = useState<AreaId | ''>('');
  const list = useMemo(() => d.tasks
    .filter((t) => !t.repeatDays?.length && !t.freelanceEntryId)
    .filter((t) => !area || t.area === area)
    .filter((t) => (st === 'abertas' ? t.status !== 'concluido' : !st || t.status === st))
    .sort((a, b) => (a.date ?? a.deadline ?? '9').localeCompare(b.date ?? b.deadline ?? '9')), [d.tasks, st, area]);
  return (
    <Card title="Todas as tarefas" wide act={
      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <select className="input sm" value={st} onChange={(e) => setSt(e.target.value as TaskStatus | 'abertas' | '')} aria-label="Filtrar por situação">
          <option value="abertas">abertas</option><option value="">todas</option>
          {(Object.keys(STATUS) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
        </select>
        <select className="input sm" value={area} onChange={(e) => setArea(e.target.value as AreaId | '')} aria-label="Filtrar por área">
          <option value="">todas as áreas</option>{AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </span>}>
      <div style={{ overflowX: 'auto' }}>
        <table className="table cards">
          <thead><tr><th>Tarefa</th><th>Área</th><th>Situação</th><th>Dia</th><th className="hide-m">Prazo</th><th /></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td className="primary"><button type="button" className="plain" onClick={() => ui.openTask(t)}><b>{t.title}</b></button></td>
                <td data-label="Área"><AreaTag area={t.area} /></td>
                <td data-label="Situação">{STATUS[t.status]}{(t.postponedCount ?? 0) > 0 && <span className="tag warn" style={{ marginLeft: 6 }}>adiada {t.postponedCount}x</span>}</td>
                <td data-label="Dia">{t.date ? `${ddmm(t.date)}${t.start ? ` ${t.start}` : ''}` : 'backlog'}</td>
                <td className="hide-m">{t.deadline ? ddmm(t.deadline) : '—'}</td>
                <td className="act"><TaskMenu t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty action={{ label: '+ Nova tarefa', run: () => ui.openTask() }}>Nenhuma tarefa aqui.</Empty>}
      </div>
    </Card>
  );
}

/* =============================== Lixeira =============================== */

export function TabLixeira() {
  const ui = useUI();
  const trash = useLiveQuery(() => db.tasks.where('deletedAt').above('').toArray(), []) ?? [];
  const list = trash.filter((t) => !t.freelanceEntryId).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  return (
    <Card title="Lixeira de tarefas" act={<span className="small muted">some de vez depois de 30 dias</span>}>
      <div className="list">
        {list.map((t) => (
          <div key={t.id} className="row small hist-item">
            <span className="grow"><b>{t.title}</b> <span className="muted">· {AREA[t.area].name} · excluída {ddmm(t.deletedAt!.slice(0, 10))}</span></span>
            <span className="muted">{daysLeft(t.deletedAt!)} dias</span>
            <button type="button" className="btn sm out" onClick={async () => { await restore(db, 'tasks', t.id!); ui.toast(`“${t.title}” voltou para as tarefas.`); }}>Restaurar</button>
          </div>
        ))}
        {list.length === 0 && <Empty>A lixeira está vazia.</Empty>}
      </div>
    </Card>
  );
}
