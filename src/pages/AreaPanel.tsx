import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { Bar, Empty, Modal, RhythmLine, Stat, Stats } from '../components/ui';
import { AREA, AREAS } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { ddmm, DOW_LONG, DOW_SHORT, dur, iso, parse, relDays, today, weekDays, weekStart } from '../lib/dates';
import { areaSummary, isTodayTask, upcomingDeadlines, weekNumbers } from '../lib/derive';
import { goalPct, impsForWeek, occurrencesForWeek } from '../lib/week';
import type { AreaId, Goal, Task } from '../lib/types';
import { GoalRow, RecordForm } from './Metas';
import { fmtGoal } from './Inicio';

export function AreaPanel() {
  const { id } = useParams();
  const d = useData();
  const ui = useUI();
  const [record, setRecord] = useState<Goal | null>(null);
  if (!AREAS.some((a) => a.id === id)) return <Navigate to="/" replace />;
  const area = id as AreaId;
  const A = AREA[area];
  const t0 = today();
  const ws = weekStart(t0);

  const goals = d.goals.filter((g) => g.area === area);
  const kpis = goals.filter((g) => g.kpi).slice(0, area === 'adultices' ? 2 : 4);
  const deadlines = upcomingDeadlines(d, 60, area);
  const wn = weekNumbers(d);
  const sum = areaSummary(d, area, wn);
  const occ = occurrencesForWeek(d.tasks, ws).filter((o) => o.task.area === area);
  const imps = impsForWeek(d.imprevistos, ws).filter((i) => i.area === area);

  // ritmo: horas planejadas + registros do dia, menos o peso dos imprevistos
  const days = weekDays(ws);
  const rhythm = days.map((day) => {
    const p = occ.filter((o) => o.date === day && o.task.status !== 'adiada').reduce((s, o) => s + o.durationMin, 0) / 60;
    const im = imps.filter((i) => i.date === day).reduce((s, i) => s + i.durationMin, 0) / 60;
    const done = d.tasks.filter((t) => t.area === area && t.doneAt === day).length;
    return Math.round((5 + p * 0.6 + done - im * 1.5) * 10) / 10;
  });
  let dropIdx = -1, drop = 0;
  rhythm.forEach((v, i) => { if (i && rhythm[i - 1] - v > drop) { drop = rhythm[i - 1] - v; dropIdx = i; } });
  const dropImp = dropIdx >= 0 ? imps.find((i) => i.date === days[dropIdx]) : undefined;

  const failures: { tag: string; cls: string; text: string }[] = [
    ...d.tasks.filter((t) => t.area === area && t.status === 'adiada').map((t) => ({
      tag: 'regresso', cls: 'warn', text: `${t.title} adiada${(t.postponedCount ?? 0) > 1 ? ` ${t.postponedCount} vezes` : ''}`,
    })),
    ...goals.filter((g) => g.deadline && goalPct(g) < 50 && g.deadline < addMonths(t0, 9)).map((g) => ({
      tag: 'falha', cls: 'bad', text: `${g.title} em ${goalPct(g)}%: abaixo do ritmo p/ ${ddmm(g.deadline!)}`,
    })),
    ...(sum.realPct < sum.desiredPct * 0.75 ? [{ tag: 'falha', cls: 'bad', text: `Tempo real (${sum.realPct}%) abaixo do foco desejado (${sum.desiredPct}%)` }] : []),
    ...imps.map((i) => ({ tag: 'imprevisto', cls: 'imp', text: `${i.title} · ${dur(i.durationMin)}` })),
  ];

  const plans: Task[] = d.tasks
    .filter((t) => t.area === area && !t.repeatDays?.length && (t.status !== 'concluido' || (t.doneAt ?? '') >= ws))
    .sort((a, b) => order(a) - order(b))
    .slice(0, 7);
  function order(t: Task): number {
    return isTodayTask(t) ? 0 : t.status === 'andamento' ? 1 : t.status === 'afazer' ? 2 : t.status === 'aguardando' ? 3 : t.status === 'adiada' ? 4 : 5;
  }
  function planTag(t: Task): [string, string] {
    if (t.status === 'concluido') return ['ok', 'ok'];
    if (isTodayTask(t)) return ['hoje', 'bad'];
    if (t.status === 'aguardando') return ['espera', 'warn'];
    if (t.status === 'adiada') return ['pausa', ''];
    if (t.date) return [`${DOW_SHORT[parse(t.date).getDay()].toLowerCase()} ${t.date.slice(8)}`, 'info'];
    return ['em andamento', 'info'];
  }

  const isAdult = area === 'adultices';
  const imm = wn.imp[area];

  return (
    <Page title={A.name} sub={A.tagline} crumbs={[{ to: '/', label: 'Início' }, { label: A.name }]} docButton={isAdult}>
      <Stats n={Math.min(5, kpis.length + 1 + (isAdult ? 2 : 0))}>
        {kpis.map((g) => (
          <Stat key={g.id} k={g.title} onClick={() => setRecord(g)}
            v={g.metric === 'nota' ? `${fmtGoal(g.current)}` : g.unit === 'R$' ? `${goalPct(g)}%` : `${fmtGoal(g.current)} / ${fmtGoal(g.target)}${g.unit === 'h' ? 'h' : ''}`}
            s={g.metric === 'nota' ? `meta >= ${fmtGoal(g.target)}` : g.unit === 'R$' ? `R$ ${fmtGoal(g.current)} / ${fmtGoal(g.target)}` : g.unit ?? g.metric} />
        ))}
        {isAdult && <Stat k="Cofre" v={d.docs.length} s="arquivos guardados" />}
        {isAdult && <Stat k="Imprevistos" v={imps.length} s={imps[0]?.title.toLowerCase() ?? 'nenhum'} />}
        <Stat k="Prazos" v={deadlines.length} s={deadlines.length ? `próximos ${Math.max(1, Math.round((parse(deadlines.at(-1)!.date).getTime() - parse(t0).getTime()) / 86400000))} dias` : 'nenhum'} />
      </Stats>

      {isAdult && (
        <Link to="/area/adultices/cofre" className="card row" style={{ textDecoration: 'none', padding: '14px 20px' }}>
          <b>Cofre de documentos</b><span className="muted small">{d.docs.length} arquivos e links do Drive · vencimentos e comprovantes</span><span className="right" style={{ color: 'var(--accent)' }}>abrir →</span>
        </Link>
      )}

      <div className="grid g3">
        <section className="card">
          <h2>Progresso</h2>
          <div className="list" style={{ gap: 14 }}>
            {goals.map((g) => <GoalRow key={g.id} g={g} onEdit={() => setRecord(g)} onRecord={() => setRecord(g)} />)}
            {goals.length === 0 && <Empty>Sem metas nesta área. Crie em <Link to="/metas">Objetivos e Metas</Link>.</Empty>}
          </div>
        </section>
        <section className="card">
          <h2>Ritmo da semana · <span className="muted" style={{ fontSize: 17 }}>progresso e regresso</span></h2>
          <RhythmLine values={rhythm} color={A.color} labels={days.map((x) => DOW_SHORT[parse(x).getDay()][0])} />
          <div className="row small" style={{ gap: 14, marginTop: 6 }}>
            <span style={{ color: 'var(--bad)' }}>queda —</span><span style={{ color: A.color }}>subida —</span>
          </div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            {dropImp ? `Queda na ${DOW_LONG[parse(days[dropIdx]).getDay()]}: ${dropImp.title.toLowerCase()} (${dur(dropImp.durationMin)}).`
              : 'Calculado pelas horas planejadas, tarefas concluídas e imprevistos de cada dia.'}
          </p>
        </section>
        <section className="card">
          <h2>Tempo e foco</h2>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <b style={{ fontSize: 30 }}>{Math.round(wn.total[area] / 6) / 10}h</b>
            <span className="muted small">na semana ({Math.round(wn.planned[area] / 6) / 10}h plano + {Math.round(imm / 6) / 10}h imprevisto)</span>
          </div>
          <div className="list" style={{ marginTop: 14, gap: 12 }}>
            <div><div className="row small"><span>Foco desejado</span><b className="right">{sum.desiredPct}%</b></div><div style={{ marginTop: 6 }}><Bar pct={sum.desiredPct * 2} color="#9ea3b8" /></div></div>
            <div><div className="row small"><span>Tempo real</span><b className="right" style={{ color: A.color }}>{sum.realPct}%</b></div><div style={{ marginTop: 6 }}><Bar pct={sum.realPct * 2} color={A.color} /></div></div>
          </div>
          <span className={`tag ${sum.focusLabel.startsWith('abaixo') ? 'bad' : sum.focusLabel.startsWith('acima') ? 'warn' : 'ok'}`} style={{ marginTop: 14 }}>{sum.focusLabel}</span>
        </section>
        <section className="card">
          <h2>Prazos</h2>
          <div className="list">
            {deadlines.slice(0, 6).map((x, i) => (
              <div key={i} className="row small"><span className="dotc" style={{ background: A.color }} /><b>{ddmm(x.date)}</b><span className="grow">{x.title}</span><span className="muted">{relDays(x.date)}</span></div>
            ))}
            {deadlines.length === 0 && <Empty>Nenhum prazo à vista.</Empty>}
          </div>
        </section>
        <section className="card">
          <h2>Falhas, regressos e imprevistos</h2>
          <div className="list">
            {failures.slice(0, 4).map((f, i) => (
              <div key={i} className="tcard" style={{ cursor: 'default', background: f.cls === 'bad' ? '#221a26' : f.cls === 'imp' ? '#221c1e' : undefined }}>
                <span><span className={`tag ${f.cls}`}>{f.tag}</span></span>{f.text}
              </div>
            ))}
            {failures.length === 0 && <Empty>Nada preocupante por aqui.</Empty>}
          </div>
        </section>
        <section className="card">
          <h2>Planos e projetos em andamento</h2>
          <div className="list">
            {plans.map((t) => {
              const [label, cls] = planTag(t);
              return (
                <button key={t.id} className="row small" style={{ all: 'unset', display: 'flex', gap: 9, cursor: 'pointer', alignItems: 'center' }} onClick={() => ui.openTask(t)}>
                  <span className="dotc" style={{ background: cls === 'bad' ? 'var(--bad)' : cls === 'ok' ? 'var(--ok)' : cls === 'warn' ? 'var(--warn)' : '#7ea3cc' }} />
                  <span className="grow" style={{ flex: 1 }}>{t.title}{t.start && isTodayTask(t) ? ` ${t.start}` : ''}</span>
                  <span className={`tag ${cls}`}>{label}</span>
                </button>
              );
            })}
            {plans.length === 0 && <Empty>Nenhum plano em andamento.</Empty>}
            <button className="add-link" onClick={() => ui.openTask({ area })}>+ tarefa em {A.name}</button>
          </div>
        </section>
      </div>

      {record && (
        <Modal title={`Registrar · ${record.title}`} onClose={() => setRecord(null)}>
          <RecordForm g={record} onDone={() => setRecord(null)} />
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={async () => { await db.goals.update(record.id!, { kpi: !record.kpi }); setRecord(null); }}>
            {record.kpi ? 'Tirar do topo do painel' : 'Mostrar no topo do painel'}
          </button>
        </Modal>
      )}
    </Page>
  );
}

function addMonths(s: string, n: number): string {
  const x = parse(s);
  x.setMonth(x.getMonth() + n);
  return iso(x);
}
