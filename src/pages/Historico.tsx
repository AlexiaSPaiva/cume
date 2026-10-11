import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { ItemMenu } from '../components/ItemMenu';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { Empty, Modal } from '../components/ui';
import { AREA, AREAS } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { ddmm, dow, MONTHS, parse, today } from '../lib/dates';
import {
  COMPARE_LABEL, compareKpis, daysOf, delta, elapsed, fmtH, kpis, metricDefs, metricRef, minutesByDay, periodLabel, periodRange,
  prevLabel, series, shiftAnchor, summary, type Compare, type Delta, type MetricDef,
} from '../lib/history';
import type { AreaId, HistPeriod, Metric, MetricAggregation } from '../lib/types';

const PERIODS: [HistPeriod, string][] = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']];
const isPeriod = (x: string | null): x is HistPeriod => !!x && PERIODS.some(([k]) => k === x);
const isCompare = (x: string | null): x is Compare => x === 'anterior' || x === 'media' || x === 'meta';

/** /historico?periodo=dia|semana|mes|ano&comparar=anterior|media|meta&data=AAAA-MM-DD&area=… */
export function Historico() {
  const d = useData();
  const ui = useUI();
  const nav = useNavigate();
  const [q, setQ] = useSearchParams();
  const p: HistPeriod = isPeriod(q.get('periodo')) ? (q.get('periodo') as HistPeriod) : 'mes';
  const cmp: Compare = isCompare(q.get('comparar')) ? (q.get('comparar') as Compare) : 'anterior';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(q.get('data') ?? '') ? q.get('data')! : today();
  const areaQ = q.get('area');
  const area = AREAS.some((a) => a.id === areaQ) ? (areaQ as AreaId) : undefined;
  const [metricOpen, setMetricOpen] = useState<Metric | 'nova' | null>(null);

  const set = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(q);
    for (const [k, v] of Object.entries(patch)) if (v == null) n.delete(k); else n.set(k, v);
    setQ(n, { replace: true });
  };

  const range = periodRange(p, anchor);
  const cur = useMemo(() => kpis(d, range, area), [d, range.start, range.end, area]);
  const ref = useMemo(() => compareKpis(d, p, anchor, cmp, area), [d, p, anchor, cmp, area]);
  const ongoing = (elapsed(range)?.end ?? '') < range.end && range.start <= today();
  const future = range.start > today();
  const refName = cmp === 'anterior' ? prevLabel(p, anchor) : cmp === 'media' ? COMPARE_LABEL[p].media.toLowerCase() : 'meta';
  const nowAnchor = shiftAnchor(p, today(), 0);

  return (
    <Page title="Histórico e desempenho" sub="Compare você com você mesma: por dia, semana, mês e ano."
      crumbs={[{ to: '/', label: 'Início' }, { label: 'Histórico' }]}>
      <div className="hist-bar">
        <div className="seg" role="radiogroup" aria-label="Período">
          {PERIODS.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={p === k} className={p === k ? 'on' : ''} onClick={() => set({ periodo: k })}>{label}</button>
          ))}
        </div>
        <div className="hist-nav">
          <button className="btn sm" onClick={() => set({ data: shiftAnchor(p, anchor, -1) })} aria-label="Período anterior">‹</button>
          <b aria-live="polite">{periodLabel(p, anchor)}</b>
          <button className="btn sm" onClick={() => set({ data: shiftAnchor(p, anchor, 1) })} aria-label="Próximo período">›</button>
          {shiftAnchor(p, anchor, 0) !== nowAnchor && <button className="btn ghost sm" onClick={() => set({ data: undefined })}>hoje</button>}
        </div>
        <span className="muted small">comparar com</span>
        <div className="seg" role="radiogroup" aria-label="Comparar com">
          {(['anterior', 'media', 'meta'] as const).map((k) => (
            <button key={k} role="radio" aria-checked={cmp === k} className={cmp === k ? 'on' : ''} onClick={() => set({ comparar: k })}>{COMPARE_LABEL[p][k]}</button>
          ))}
        </div>
        <span className="hist-right">
          <select className="input sm" value={area ?? ''} onChange={(e) => set({ area: e.target.value || undefined })} aria-label="Filtrar por área">
            <option value="">Todas as áreas</option>
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button className="btn out" onClick={() => window.print()} title="Abre a impressão: escolha “Salvar como PDF”">Exportar PDF</button>
        </span>
      </div>
      <p className="print-only">Cume° · Histórico · {periodLabel(p, anchor)} · comparado com {COMPARE_LABEL[p][cmp].toLowerCase()}{area ? ` · ${AREA[area].name}` : ''}</p>
      {ongoing && <p className="hint" style={{ margin: '-6px 0 0' }}>Período em andamento: conta até hoje.</p>}

      <div className="stats">
        <Kpi k="Horas produtivas" v={fmtH(cur.minutes)} d={delta(cur.minutes, ref.minutes, 'pct')}
          s={ref.minutes != null ? `${refName}: ${fmtH(ref.minutes)}` : ''} />
        <Kpi k="Tarefas concluídas" v={String(cur.done)} d={delta(cur.done, ref.done, 'n')}
          s={cur.onTime != null ? `${cur.onTime}% no prazo` : 'sem prazos no período'} />
        <Kpi k="Adiamentos" v={String(cur.postponed)} d={delta(cur.postponed, ref.postponed, 'n', false)} s="menos é melhor" />
        <Kpi k="Imprevistos" v={fmtH(cur.impMin)} d={delta(cur.impMin, ref.impMin, 'h', false)}
          s={cur.impTopType ? `${cur.impTopType.toLowerCase()} é o mais caro` : cur.impCount ? `${cur.impCount} no período` : 'nenhum no período'} />
        <Kpi k="Metas que avançaram" v={`${cur.goalsAdvanced}/${cur.goalsTotal}`} d={delta(cur.goalsAdvanced, ref.goalsAdvanced, 'n')}
          s={`${cur.goalsTotal - cur.goalsAdvanced} ${cur.goalsTotal - cur.goalsAdvanced === 1 ? 'meta parada' : 'metas paradas'}`} />
      </div>

      {future && <Empty>Este período ainda não começou.</Empty>}

      <div className="grid g3">
        <Card title="Tempo por área" act={<span className="small muted legend"><i className="lg cur" />{periodLabel(p, anchor).toLowerCase()} <i className="lg ref" />{refName}</span>}>
          <AreaBars cur={cur.byArea} ref_={ref.byArea ?? undefined} only={area} />
        </Card>
        <Card title={p === 'ano' ? 'Mapa do ano' : 'Mapa do mês'} act={<span className="small muted">horas por dia</span>}>
          {p === 'ano'
            ? <YearMap anchor={anchor} area={area} onPick={(m) => set({ periodo: 'mes', data: m })} />
            : <MonthMap anchor={anchor} area={area} sel={p === 'dia' ? anchor : undefined} onPick={(x) => set({ periodo: 'dia', data: x })} />}
        </Card>
        <Resumo p={p} anchor={anchor} area={area} />
        <Card title="Métricas" className="span2" wide act={
          <button className="add-link" style={{ margin: 0 }} onClick={() => setMetricOpen('nova')}>+ criar métrica própria</button>}>
          <Metrics p={p} anchor={anchor} cmp={cmp} area={area} onOpen={(def) => def.metric ? setMetricOpen(def.metric) : def.link && nav(def.link)} />
        </Card>
      </div>

      {metricOpen && (
        <Modal title={metricOpen === 'nova' ? 'Nova métrica' : metricOpen.name} onClose={() => setMetricOpen(null)}>
          {metricOpen === 'nova'
            ? <MetricForm onDone={(m) => { setMetricOpen(m ?? null); if (m) ui.toast('Métrica criada. Lance o primeiro valor.'); }} />
            : <MetricDetail m={d.metrics.find((x) => x.id === metricOpen.id) ?? metricOpen} onClose={() => setMetricOpen(null)} />}
        </Modal>
      )}
    </Page>
  );
}

function Kpi({ k, v, d, s }: { k: string; v: string; d: Delta | null; s?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}{d && <small className={`delta ${d.good == null ? '' : d.good ? 'up' : 'down'}`}>{d.text}</small>}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

function AreaBars({ cur, ref_, only }: { cur: Record<AreaId, number>; ref_?: Record<AreaId, number>; only?: AreaId }) {
  const list = AREAS.filter((a) => !only || a.id === only);
  const max = Math.max(1, ...list.map((a) => Math.max(cur[a.id], ref_?.[a.id] ?? 0)));
  return (
    <div className="area-bars" style={{ '--n': list.length } as React.CSSProperties} role="img" aria-label={list.map((a) => `${a.name}: ${fmtH(cur[a.id])}${ref_ ? ` (antes ${fmtH(ref_[a.id])})` : ''}`).join('; ')}>
      {list.map((a) => (
        <div key={a.id} className="ab-col">
          <b className="ab-v">{fmtH(cur[a.id])}</b>
          <div className="ab-pair">
            {ref_ && <i className="ref" style={{ height: `${(ref_[a.id] / max) * 100}%`, background: `color-mix(in srgb, ${a.color} 38%, #1a2140)` }} />}
            <i style={{ height: `${(cur[a.id] / max) * 100}%`, background: a.color }} />
          </div>
          <small>{a.name}</small>
        </div>
      ))}
    </div>
  );
}

function heat(min: number, max: number): string {
  if (!min) return 'var(--panel-2)';
  const t = Math.min(1, min / max);
  return `color-mix(in srgb, var(--accent) ${Math.round(18 + t * 72)}%, #1a2140)`;
}

function MonthMap({ anchor, area, sel, onPick }: { anchor: string; area?: AreaId; sel?: string; onPick: (day: string) => void }) {
  const d = useData();
  const r = periodRange('mes', anchor);
  const by = minutesByDay(d.tasks, r, area);
  const t0 = today();
  const vals = daysOf(r).map((x) => ({ x, m: x <= t0 ? Object.values(by.get(x)!).reduce((a, b) => a + b, 0) : 0 }));
  const max = Math.max(60, ...vals.map((v) => v.m));
  const lead = (dow(r.start) + 6) % 7; // segunda primeiro
  return (
    <>
      <div className="heat">
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x, i) => <span key={i} className="hd">{x}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {vals.map(({ x, m }) => (
          <button key={x} className={`hc ${x === sel ? 'sel' : ''} ${x > t0 ? 'fut' : ''}`} style={{ background: heat(m, max) }}
            onClick={() => onPick(x)} title={`${ddmm(x)}: ${fmtH(m)}`} aria-label={`${ddmm(x)}: ${fmtH(m)} produtivas`}>
            {Number(x.slice(8))}
          </button>
        ))}
      </div>
      <div className="row small muted" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        menos <i className="hl" style={{ background: heat(max * 0.15, max) }} /><i className="hl" style={{ background: heat(max * 0.5, max) }} /><i className="hl" style={{ background: heat(max, max) }} /> mais
        <span className="right">toque num dia para ver o detalhe</span>
      </div>
    </>
  );
}

function YearMap({ anchor, area, onPick }: { anchor: string; area?: AreaId; onPick: (month: string) => void }) {
  const d = useData();
  const y = parse(anchor).getFullYear();
  const months = MONTHS.map((name, i) => {
    const a = `${y}-${String(i + 1).padStart(2, '0')}-01`;
    return { a, name, m: kpis(d, periodRange('mes', a), area).minutes };
  });
  const max = Math.max(60, ...months.map((x) => x.m));
  return (
    <div className="heat year">
      {months.map((x) => (
        <button key={x.a} className="hc" style={{ background: heat(x.m, max) }} onClick={() => onPick(x.a)} aria-label={`${x.name}: ${fmtH(x.m)}`}>
          <b>{x.name.slice(0, 3)}</b><small>{x.m ? fmtH(x.m) : '—'}</small>
        </button>
      ))}
    </div>
  );
}

function Spark({ values, good = true }: { values: (number | null)[]; good?: boolean }) {
  const xs = values.map((v) => v ?? 0);
  const max = Math.max(...xs), min = Math.min(...xs);
  const W = 110, H = 26;
  const pts = xs.map((v, i) => `${(i * W) / (xs.length - 1)},${H - 3 - ((v - min) / (max - min || 1)) * (H - 6)}`).join(' ');
  const rising = xs[xs.length - 1] >= xs[0];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts} fill="none" strokeWidth="1.8" strokeLinejoin="round" stroke={rising === good ? 'var(--ok)' : 'var(--bad)'} />
    </svg>
  );
}

function Metrics({ p, anchor, cmp, area, onOpen }: { p: HistPeriod; anchor: string; cmp: Compare; area?: AreaId; onOpen: (def: MetricDef) => void }) {
  const d = useData();
  const defs = useMemo(() => metricDefs(d, area), [d, area]);
  const r = periodRange(p, anchor);
  const curName = p === 'mes' ? MONTHS[parse(anchor).getMonth()].slice(0, 3) : 'atual';
  const refName = cmp === 'anterior' ? (p === 'mes' ? MONTHS[parse(shiftAnchor(p, anchor, -1)).getMonth()].slice(0, 3) : 'anterior') : cmp === 'media' ? 'média' : 'meta';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table cards metrics">
        <thead><tr><th>Métrica</th><th className="hide-m">Origem</th><th>{curName}</th><th>{refName}</th><th>Δ</th><th className="hide-m">Tendência 6 períodos</th><th /></tr></thead>
        <tbody>
          {defs.map((def) => {
            const v = def.value(r);
            const rv = metricRef(def, p, anchor, cmp);
            const dl = v != null ? delta(v, rv, def.kind, def.higherIsBetter) : null;
            return (
              <tr key={def.key}>
                <td className="primary"><b>{def.name}</b></td>
                <td className="hide-m"><span className={`tag ${def.source === 'você' ? 'imp' : ''}`}>{def.source}</span></td>
                <td data-label={curName}><b>{v != null ? def.fmt(v) : '—'}</b></td>
                <td data-label={refName} className="muted">{rv != null ? def.fmt(rv) : '—'}</td>
                <td data-label="Δ">{dl ? <span className={`delta ${dl.good == null ? '' : dl.good ? 'up' : 'down'}`}>{dl.text}</span> : '—'}</td>
                <td className="hide-m"><Spark values={series(def, p, anchor)} good={def.higherIsBetter} /></td>
                <td className="act"><button className="add-link" style={{ margin: 0 }} onClick={() => onOpen(def)}>abrir ›</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Resumo({ p, anchor, area }: { p: HistPeriod; anchor: string; area?: AreaId }) {
  const d = useData();
  const s = useMemo(() => summary(d, p, anchor, area), [d, p, anchor, area]);
  const name = p === 'mes' ? MONTHS[parse(anchor).getMonth()] : p === 'ano' ? anchor.slice(0, 4) : p === 'semana' ? 'da semana' : 'do dia';
  const ys = s.year.values;
  const ymax = Math.max(1, ...ys);
  const W = 260, H = 60;
  const pts = ys.map((v, i) => `${ys.length > 1 ? (i * W) / (ys.length - 1) : W / 2},${H - 6 - (v / ymax) * (H - 14)}`).join(' ');
  const closes = d.snapshots.filter((x) => x.period === 'mes').sort((a, b) => b.start.localeCompare(a.start)).slice(0, 3);
  return (
    <Card className="rspan2" title={`Resumo ${p === 'mes' || p === 'ano' ? `de ${name}` : name}`}>
      <div className="list resumo">
        {s.best && <div><span className="lab ok">{s.best.label}</span>{s.best.text}</div>}
        {s.hardest && <div><span className="lab bad">{s.hardest.label}</span>{s.hardest.text}</div>}
        {!s.best && !s.hardest && <Empty>Nada registrado neste período ainda.</Empty>}
        <div><span className="lab">Padrão</span>{s.pattern}</div>
        <div>
          <span className="lab">Evolução no ano</span>
          {ys.length > 0 ? (
            <>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.year.months.map((m, i) => `${m}: ${fmtH(ys[i])}`).join('; ')}>
                <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
                {ys.length > 0 && <circle cx={ys.length > 1 ? W : W / 2} cy={H - 6 - (ys[ys.length - 1] / ymax) * (H - 14)} r="3.5" fill="var(--accent)" />}
              </svg>
              <span className="muted small">horas produtivas por mês{s.year.growth != null ? ` · ${s.year.growth >= 0 ? '+' : ''}${s.year.growth}% desde ${s.year.months[ys.findIndex((v) => v > 0)]}` : ''}</span>
            </>
          ) : <span className="muted small">o ano ainda não começou</span>}
        </div>
        <p className="note">
          Fechamento automático todo dia 1º às 08:00; chega no sino e fica salvo aqui.
          {closes.length > 0 && <> Fechados: {closes.map((c, i) => (
            <span key={c.id}>{i > 0 && ', '}<Link to={`/historico?periodo=mes&data=${c.start}`}>{MONTHS[parse(c.start).getMonth()]}</Link></span>
          ))}.</>}
        </p>
      </div>
    </Card>
  );
}

/* ---------- métricas próprias ---------- */

function MetricForm({ m, onDone }: { m?: Metric; onDone: (m?: Metric) => void }) {
  const [f, setF] = useState({
    name: m?.name ?? '', unit: m?.unit ?? '', area: m?.area ?? '', aggregation: m?.aggregation ?? 'sum' as MetricAggregation,
    higherIsBetter: m?.higherIsBetter !== false, target: m?.target != null ? String(m.target) : '',
  });
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Dê um nome à métrica.');
    const row: Metric = {
      name: f.name.trim(), unit: f.unit.trim(), area: (f.area || undefined) as AreaId | undefined, aggregation: f.aggregation,
      higherIsBetter: f.higherIsBetter, target: f.target ? Number(f.target.replace(',', '.')) : undefined,
    };
    if (m?.id) { await db.metrics.update(m.id, row); onDone({ ...m, ...row }); }
    else { const id = (await db.metrics.add(row)) as number; onDone({ ...row, id }); }
  }
  return (
    <form className="form" onSubmit={save}>
      <div className="cols">
        <label className="field"><span>Nome</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Páginas lidas" /></label>
        <label className="field"><span>Unidade</span><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="págs, h, km…" /></label>
      </div>
      <div className="cols">
        <label className="field"><span>Área</span>
          <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
            <option value="">Nenhuma</option>{AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="field"><span>No período, usar</span>
          <select value={f.aggregation} onChange={(e) => setF({ ...f, aggregation: e.target.value as MetricAggregation })}>
            <option value="sum">a soma (ex.: páginas)</option>
            <option value="avg">a média (ex.: sono)</option>
            <option value="last">o último valor (ex.: peso)</option>
          </select>
        </label>
      </div>
      <div className="cols">
        <label className="field"><span>Meta por período (opcional)</span><input inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></label>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={!f.higherIsBetter} onChange={(e) => setF({ ...f, higherIsBetter: !e.target.checked })} /> menos é melhor
        </label>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn gold">{m ? 'Salvar' : 'Criar métrica'}</button><button type="button" className="btn out" onClick={() => onDone(m)}>Cancelar</button></div>
    </form>
  );
}

function MetricDetail({ m, onClose }: { m: Metric; onClose: () => void }) {
  const d = useData();
  const ui = useUI();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  const [date, setDate] = useState(today());
  const list = d.metricEntries.filter((e) => e.metricId === m.id).sort((a, b) => b.date.localeCompare(a.date));
  if (edit) return <MetricForm m={m} onDone={() => setEdit(false)} />;
  async function add(e: FormEvent) {
    e.preventDefault();
    const n = Number(v.replace(',', '.'));
    if (!v.trim() || Number.isNaN(n)) return;
    await db.metricEntries.add({ metricId: m.id!, date, value: n });
    setV('');
  }
  return (
    <div className="form">
      <p className="muted small" style={{ margin: 0 }}>
        {m.area ? `${AREA[m.area].name} · ` : ''}{m.aggregation === 'sum' ? 'soma' : m.aggregation === 'avg' ? 'média' : 'último valor'} no período
        {m.target != null ? ` · meta ${m.target}${m.unit ? ` ${m.unit}` : ''}` : ''}{m.higherIsBetter === false ? ' · menos é melhor' : ''}
      </p>
      <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={add}>
        <input className="input" style={{ width: '8rem' }} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder={`valor${m.unit ? ` (${m.unit})` : ''}`} aria-label="Valor" />
        <input className="input" style={{ width: 'auto' }} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data" />
        <button className="btn gold">Lançar</button>
      </form>
      <div className="list" style={{ maxHeight: 260, overflow: 'auto' }}>
        {list.map((e) => (
          <div key={e.id} className="row small">
            <b style={{ width: '3.5rem' }}>{ddmm(e.date)}</b><span className="grow">{String(e.value).replace('.', ',')} {m.unit}</span>
            <ItemMenu label={`${m.name} ${ddmm(e.date)}`} actions={{ delete: () => void ui.remove('metricEntries', e.id!, `Valor de ${m.name}`) }} />
          </div>
        ))}
        {list.length === 0 && <Empty>Nenhum valor lançado ainda.</Empty>}
      </div>
      <div className="actions">
        <button className="btn out" onClick={() => setEdit(true)}>Editar métrica</button>
        <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={async () => { onClose(); await ui.remove('metrics', m.id!, `Métrica “${m.name}”`); }}>Excluir</button>
      </div>
    </div>
  );
}
