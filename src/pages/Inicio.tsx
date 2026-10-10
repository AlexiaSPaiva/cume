import { Link, useNavigate } from 'react-router-dom';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { SuggestionBanner } from '../components/SuggestionBanner';
import { FocusCard } from '../components/FocusCard';
import { AreaDot, Bar, Empty, Stat, Stats } from '../components/ui';
import { AREAS, AREA, IMPREVISTO_COLOR } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { ddmm, dur, greeting, hours, relDays, today, weekStart } from '../lib/dates';
import { areaSummary, isTodayTask, upcomingDeadlines, weekNumbers } from '../lib/derive';
import { goalPct, impsForWeek, occurrencesForWeek } from '../lib/week';
import type { Task } from '../lib/types';

const PRIO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export function Inicio() {
  const d = useData();
  const ui = useUI();
  const nav = useNavigate();
  const { settings, tasks, goals } = d;
  const w = (id: (typeof settings.widgets)[number]) => settings.widgets.includes(id);

  const todayTasks = tasks.filter((t) => isTodayTask(t));
  const pending = todayTasks.filter((t) => t.status !== 'concluido');
  const top3 = todayTasks.filter((t) => t.top3Today).slice(0, 3);
  const deadlines = upcomingDeadlines(d, 7);
  const wn = weekNumbers(d);
  const weekImps = impsForWeek(d.imprevistos, weekStart(today())).sort((a, b) => b.durationMin - a.durationMin);
  const activeGoals = goals.filter((g) => goalPct(g) < 100).length;
  const healthCount = occurrencesForWeek(tasks, weekStart(today())).filter((o) => o.task.area === 'saude' && o.task.status !== 'adiada').length;

  async function toggleTop(t: Task) {
    if (!t.top3Today && top3.length >= 3) return ui.toast('O Top 3 já tem três tarefas. Desmarque uma antes.');
    await db.tasks.update(t.id!, { top3Today: !t.top3Today });
  }

  const maxH = Math.max(...AREAS.map((a) => wn.total[a.id]), ...AREAS.map((a) => (settings.desiredFocus[a.id] / 100) * wn.totalMin), 60);

  return (
    <Page title={`Olá, ${settings.name}`} sub={`${greeting()}! Que hoje seja um passo a mais na direção dos seus sonhos.`}>
      <Stats>
        <Stat k="Próximos prazos" v={deadlines.length} s="nos próximos 7 dias" onClick={() => nav('/calendario')} />
        <Stat k="Tarefas de hoje" v={pending.length} s={`pendentes · ${pending.filter((t) => t.priority === 'alta').length} prioritárias`} onClick={() => nav('/tarefas')} />
        <Stat k="Metas" v={`${activeGoals}/${goals.length}`} s="em progresso" onClick={() => nav('/metas')} />
        <Stat k="Imprevistos" v={wn.impCount} s={`${dur(wn.impMin)} nesta semana`} onClick={() => nav('/imprevistos')} />
        <Stat k="Saúde" v={healthCount} s="atividades esta semana" onClick={() => nav('/area/saude')} />
      </Stats>

      {w('sugestoes') && <SuggestionBanner limit={2} />}

      <div className="grid g3">
        <div className="list" style={{ gap: 16 }}>
          {w('top3') && (
            <section className="card">
              <h2>Top 3 de hoje</h2>
              <div className="list">
                {top3.map((t) => (
                  <div key={t.id} className="row">
                    <AreaDot area={t.area} />
                    <button className="grow" style={{ all: 'unset', cursor: 'pointer', flex: 1 }} onClick={() => ui.openTask(t)}>{t.title}</button>
                    <span className={`tag ${t.priority}`}>{PRIO[t.priority]}</span>
                  </div>
                ))}
                {top3.length === 0 && <Empty>Marque até 3 tarefas de hoje com ☆.</Empty>}
              </div>
              {todayTasks.filter((t) => !t.top3Today).length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary className="muted small" style={{ cursor: 'pointer' }}>Escolher o Top 3</summary>
                  <div className="list" style={{ marginTop: 8 }}>
                    {todayTasks.map((t) => (
                      <label key={t.id} className="check small">
                        <input type="checkbox" checked={!!t.top3Today} onChange={() => toggleTop(t)} /> {t.title}
                      </label>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}
          {w('prazos') && (
            <section className="card">
              <h2>Próximos prazos</h2>
              <div className="list">
                {deadlines.slice(0, 5).map((x, i) => (
                  <div key={i} className="row small"><AreaDot area={x.area} /><b>{ddmm(x.date)}</b><span className="grow">{x.title}</span><span className="muted">{relDays(x.date)}</span></div>
                ))}
                {deadlines.length === 0 && <Empty>Nada nos próximos 7 dias.</Empty>}
              </div>
            </section>
          )}
          {w('imprevistos') && (
            <section className="card">
              <h2>Imprevistos da semana</h2>
              <div className="list">
                {weekImps.slice(0, 5).map((i) => (
                  <button key={i.id} className="row small" style={{ all: 'unset', display: 'flex', gap: 9, cursor: 'pointer' }} onClick={() => ui.openImprevisto(i)}>
                    <span className="dotc" style={{ background: IMPREVISTO_COLOR }} /><span className="grow" style={{ flex: 1 }}>{i.title}</span><span className="muted">{dur(i.durationMin)}</span>
                  </button>
                ))}
                {weekImps.length === 0 && <Empty>Nenhum imprevisto nesta semana.</Empty>}
                {weekImps.length > 0 && <b className="small" style={{ color: 'var(--imp)' }}>total: {dur(wn.impMin)} fora do plano</b>}
              </div>
            </section>
          )}
        </div>

        <div className="list" style={{ gap: 16 }}>
          {w('foco') && <FocusCard />}
          {w('tempo') && (
            <section className="card">
              <h2>Tempo por área · h/semana</h2>
              <div className="list" style={{ gap: 11 }}>
                {AREAS.map((a) => (
                  <div key={a.id} className="row small">
                    <span style={{ width: 82 }}>{a.name}</span>
                    <div style={{ flex: 1 }}>
                      <Bar pct={(wn.planned[a.id] / maxH) * 100} color={a.color} extra={(wn.imp[a.id] / maxH) * 100} extraColor={IMPREVISTO_COLOR}
                        tick={((settings.desiredFocus[a.id] / 100) * wn.totalMin / maxH) * 100} />
                    </div>
                    <b style={{ width: 44, textAlign: 'right' }}>{hours(wn.total[a.id])}</b>
                  </div>
                ))}
                <span className="faint" style={{ fontSize: 10.5 }}>laranja = imprevisto | traço branco = tempo que o foco desejado pede</span>
              </div>
            </section>
          )}
        </div>

        {w('vida') && (
          <section className="card">
            <h2 style={{ marginBottom: 2 }}>Minha vida agora</h2>
            <p className="muted small" style={{ margin: '0 0 8px' }}>toque numa área para abrir o painel</p>
            <div className="list" style={{ gap: 0 }}>
              {AREAS.map((a) => {
                const s = areaSummary(d, a.id, wn);
                const kpis = goals.filter((g) => g.area === a.id && g.kpi).slice(0, 2);
                return (
                  <Link key={a.id} to={`/area/${a.id}`} style={{ textDecoration: 'none', padding: '10px 0', borderBottom: '1px solid #1a2140', display: 'block' }}>
                    <div className="row"><AreaDot area={a.id} size={9} /><b>{a.name}</b>
                      <span className="right small" style={{ color: s.health === 'atenção' ? 'var(--bad)' : 'var(--muted)', fontWeight: s.health === 'atenção' ? 700 : 400 }}>{s.health}</span>
                    </div>
                    <div className="muted small" style={{ margin: '2px 0 6px 17px' }}>
                      {kpis.length ? kpis.map((g) => `${g.title} ${fmtGoal(g.current)}/${fmtGoal(g.target)}`).join(' · ') : AREA[a.id].tagline}
                    </div>
                    <div style={{ marginLeft: 17, marginRight: 50 }}><Bar pct={s.progress} color={a.color} /></div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Page>
  );
}

export function fmtGoal(n: number): string {
  if (Number.isInteger(n)) return n >= 1000 ? n.toLocaleString('pt-BR') : String(n);
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
