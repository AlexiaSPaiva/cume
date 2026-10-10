import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Page } from '../components/Layout';
import { ImprevistoForm } from '../components/forms';
import { useUI } from '../components/Overlays';
import { SuggestionBanner } from '../components/SuggestionBanner';
import { AreaTag, Bar, Donut, Empty, Icon, Stat, Stats } from '../components/ui';
import { AREAS, AREA, IMPREVISTO_COLOR } from '../lib/areas';
import { useData } from '../lib/data';
import { addDays, DOW_SHORT, dur, hours, parse, today, weekStart } from '../lib/dates';
import { clusterImprevistos, WINDOW_DAYS } from '../lib/recurrence';
import { impByArea, impsForWeek, occurrencesForWeek, plannedByArea, sum } from '../lib/week';
import type { ImprevistoType } from '../lib/types';

const TYPE_COLOR: Record<ImprevistoType, string> = {
  Trabalho: '#7ea3cc', Saúde: '#7fb8a0', Burocracia: '#d29b72', Infraestrutura: '#9b93c9', Família: '#d4a0b4', Transporte: '#c9b06a', Outro: '#8a90a8',
};

export function Imprevistos() {
  const { imprevistos, tasks, settings, suggestions } = useData();
  const ui = useUI();
  const loc = useLocation();
  const [range, setRange] = useState<'semana' | '30' | 'todos'>('semana');
  const ws = weekStart(today());

  useEffect(() => {
    if (loc.hash === '#sugestoes') document.getElementById('sugestoes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loc.hash, suggestions.length]);

  const week = impsForWeek(imprevistos, ws);
  const list = (range === 'semana' ? week : range === '30' ? imprevistos.filter((i) => i.date > addDays(today(), -30)) : imprevistos)
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  const totalMin = list.reduce((a, i) => a + i.durationMin, 0);

  const byType = new Map<ImprevistoType, number>();
  for (const i of list) byType.set(i.type, (byType.get(i.type) ?? 0) + i.durationMin);
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);

  const planned = plannedByArea(occurrencesForWeek(tasks, ws));
  const impA = impByArea(week);
  const maxA = Math.max(...AREAS.map((a) => planned[a.id] + impA[a.id]), 60);
  const weekMin = sum(impA);
  const postponedIds = new Set(week.flatMap((i) => i.postponedTaskIds ?? []));
  const postponed = tasks.filter((t) => postponedIds.has(t.id!));
  const topArea = [...AREAS].sort((a, b) => impA[b.id] - impA[a.id]);
  const weekByType = new Map<ImprevistoType, number>();
  for (const i of week) weekByType.set(i.type, (weekByType.get(i.type) ?? 0) + i.durationMin);
  const topType = [...weekByType.entries()].map(([t, m]) => ({ t, m })).sort((a, b) => b.m - a.m)[0];
  const capacity = sum(planned) + weekMin;

  // padrões: grupos que se repetem nos últimos 30 dias, mesmo abaixo do limite
  const patterns = clusterImprevistos(imprevistos.filter((i) => i.date > addDays(today(), -WINDOW_DAYS) && i.date <= today()))
    .filter((c) => c.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length);

  return (
    <Page title="Imprevistos" sub="Entenda o que tirou você do plano, quanto custou e onde costuma acontecer.">
      <Stats>
        <Stat k="Esta semana" v={week.length} s="imprevistos" />
        <Stat k="Tempo perdido" v={dur(weekMin)} s={capacity ? `${Math.round((weekMin / capacity) * 100)}% da semana` : ''} />
        <Stat k="Mais comum" v={topType?.t ?? '—'} s={topType ? `${dur(topType.m)}` : ''} />
        <Stat k="Tarefas adiadas" v={postponed.length} s="por causa deles" />
        <Stat k="Área mais afetada" v={impA[topArea[0].id] ? topArea[0].name : '—'} s={impA[topArea[1].id] ? `e ${topArea[1].name}` : ''} />
      </Stats>

      <SuggestionBanner />

      <div className="grid g3">
        <section className="card">
          <h2>Registrar imprevisto</h2>
          <ImprevistoForm compact onSaved={(_, b) => ui.afterImprevisto(b)} />
        </section>

        <div className="list" style={{ gap: 16 }}>
          <section className="card">
            <h2>Por tipo</h2>
            <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
              <Donut size={124} data={types.map(([t, m]) => ({ value: m, color: TYPE_COLOR[t] }))} center={<b style={{ fontSize: 17 }}>{dur(totalMin)}</b>} />
              <div className="list" style={{ flex: 1, minWidth: 140 }}>
                {types.map(([t, m]) => <div key={t} className="row small"><span className="dotc" style={{ background: TYPE_COLOR[t] }} /><span className="grow">{t}</span><b>{hours(m)}</b></div>)}
                {types.length === 0 && <Empty>Sem imprevistos no período.</Empty>}
              </div>
            </div>
          </section>
          <section className="card">
            <h2>Por área · planejado + imprevisto</h2>
            <div className="list" style={{ gap: 11 }}>
              {AREAS.map((a) => (
                <div key={a.id} className="row small">
                  <span style={{ width: 82 }}>{a.name}</span>
                  <div style={{ flex: 1 }}><Bar pct={(planned[a.id] / maxA) * 100} color={a.color} extra={(impA[a.id] / maxA) * 100} extraColor={IMPREVISTO_COLOR} /></div>
                  <b style={{ width: 44, textAlign: 'right', color: impA[a.id] ? 'var(--imp)' : 'var(--muted)' }}>{impA[a.id] ? `+${hours(impA[a.id])}` : '0h'}</b>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="list" style={{ gap: 16 }}>
          <section className="card">
            <h2>Histórico
              <span className="act seg">
                <button className={range === 'semana' ? 'on' : ''} onClick={() => setRange('semana')}>semana</button>
                <button className={range === '30' ? 'on' : ''} onClick={() => setRange('30')}>30 dias</button>
                <button className={range === 'todos' ? 'on' : ''} onClick={() => setRange('todos')}>todos</button>
              </span>
            </h2>
            <div className="list" style={{ maxHeight: 330, overflow: 'auto' }}>
              {list.map((i) => (
                <button key={i.id} className="tcard" style={{ cursor: 'pointer' }} onClick={() => ui.openImprevisto(i)}>
                  <div className="row"><b className="grow">{i.title}</b><span style={{ font: '400 1.35rem var(--serif)', color: 'var(--imp)' }}>{dur(i.durationMin)}</span></div>
                  <div className="row small"><AreaTag area={i.area} /><span className="muted">{DOW_SHORT[parse(i.date).getDay()].toLowerCase()} {i.date.slice(8)}/{i.date.slice(5, 7)} · {i.start}–{i.end}</span></div>
                </button>
              ))}
              {list.length === 0 && <Empty>Nada registrado.</Empty>}
            </div>
          </section>
          <section className="card">
            <h2>Efeito na semana</h2>
            <div className="list small" style={{ gap: 10 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--bad)', width: 78 }}>Adiou</b><span>{postponed.length ? postponed.map((t) => t.title).join(' e ') : 'nenhuma tarefa'}</span></div>
              <div className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--bad)', width: 78 }}>Consumiu</b><span>{dur(weekMin)} do tempo planejado</span></div>
              <div className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--bad)', width: 78 }}>Padrão</b>
                <span>{topType ? `imprevistos de ${topType.t.toLowerCase()} são os mais caros` : 'sem padrão ainda'}</span></div>
            </div>
          </section>
        </div>
      </div>

      <section className="card">
        <h2><Icon name="repeat" size={18} /> Imprevistos que se repetem · últimos {WINDOW_DAYS} dias</h2>
        <p className="muted small" style={{ margin: '-6px 0 14px' }}>
          Quando um imprevisto parecido acontece {settings.recurrenceThreshold}x ou mais, o app sugere incluí-lo no seu planejamento como um bloco reservado. Ajuste o limite em Personalizar.
        </p>
        <div className="grid g3">
          {patterns.map((c, n) => {
            const total = c.items.reduce((s, i) => s + i.durationMin, 0);
            const label = c.items[c.items.length - 1].title;
            const hit = c.items.length >= settings.recurrenceThreshold;
            const sug = suggestions.find((s) => s.area === c.area && s.occurrences.length === c.items.length && s.occurrences[0].id === c.items[0].id);
            const buffered = hit && !sug;
            return (
              <div key={n} className="tcard" style={{ cursor: 'default' }}>
                <div className="row"><b className="grow">{label}</b><AreaTag area={c.area} /></div>
                <div className="row small muted"><span>{c.items.length}x · {dur(total)}</span><span className="right">{[...new Set(c.items.map((i) => DOW_SHORT[parse(i.date).getDay()]))].join(', ')}</span></div>
                <Bar pct={Math.min(100, (c.items.length / settings.recurrenceThreshold) * 100)} color={hit ? IMPREVISTO_COLOR : AREA[c.area].color} />
                {sug ? <button className="btn sm gold" onClick={() => ui.openSuggestion(sug)}>Incluir no planejamento</button>
                  : buffered ? <span className="tag ok">reserva no planejamento ou dispensada</span>
                    : <span className="faint small">falta {settings.recurrenceThreshold - c.items.length} para virar sugestão</span>}
              </div>
            );
          })}
          {patterns.length === 0 && <Empty>Nenhum imprevisto se repetiu nos últimos {WINDOW_DAYS} dias.</Empty>}
        </div>
      </section>
    </Page>
  );
}
