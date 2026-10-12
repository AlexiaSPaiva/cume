import { useState, type FormEvent } from 'react';
import { Page } from '../components/Layout';
import { Card } from '../components/Card';
import { useUI } from '../components/Overlays';
import { AreaDot, Empty, Icon, Stat, Stats } from '../components/ui';
import { AREAS, AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, DOW_SHORT, iso, MONTHS, monthYear, parse, today } from '../lib/dates';
import { connectGoogle, isConnected, listCalendars, syncCalendars, type GCal } from '../lib/google';
import { ItemMenu } from '../components/ItemMenu';
import type { AreaId, CalendarEvent, CalendarKind } from '../lib/types';
import { trackEvents } from '../lib/study';

export function Calendario() {
  const data = useData();
  const { tasks, settings } = data;
  // datas das trilhas (edital, provas, entregas) entram junto, se a trilha pedir
  const events = [...data.events, ...trackEvents(data)];
  const ui = useUI();
  const t0 = today();
  const [month, setMonth] = useState(t0.slice(0, 7) + '-01');
  const [sel, setSel] = useState(t0);

  const first = parse(month);
  const y = first.getFullYear(), m = first.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => iso(new Date(y, m, i + 1)))];
  const inMonth = events.filter((e) => e.date.startsWith(month.slice(0, 7)));
  const deadlinesFromTasks = tasks.filter((t) => t.deadline?.startsWith(month.slice(0, 7)) && t.status !== 'concluido');
  const byDay = (d: string) => [
    ...events.filter((e) => e.date === d),
    ...tasks.filter((t) => t.deadline === d && t.status !== 'concluido' && !events.some((e) => e.date === d && e.title === t.title))
      .map((t) => ({ title: t.title, date: d, area: t.area, kind: 'prazo' as CalendarKind, source: 'local' as const })),
  ];
  const next7 = Array.from({ length: 8 }, (_, i) => addDays(t0, i)).flatMap((d) => byDay(d));

  return (
    <Page title="Calendário" sub="Prazos, eventos e vencimentos de todas as áreas, sincronizados com o Google.">
      <Stats>
        <Stat k="Este mês" v={MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1)} s={String(y)} />
        <Stat k="Eventos" v={inMonth.filter((e) => e.kind === 'evento').length} s="no mês" />
        <Stat k="Prazos" v={inMonth.filter((e) => e.kind === 'prazo').length + deadlinesFromTasks.length} s="de todas as áreas" />
        <Stat k="Vencimentos" v={inMonth.filter((e) => e.kind === 'vencimento').length} s="contas e documentos" />
        <Stat k="Google" v={settings.googleClientId ? (isConnected() ? 'ok' : 'pronto') : '—'} s={settings.googleClientId ? 'clique em conectar' : 'não configurado'} />
      </Stats>

      <div className="grid g3">
        <Card wide className="span2" title={<span className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setMonth(iso(new Date(y, m - 1, 1)))} aria-label="Mês anterior">‹</button>
            {monthYear(month)}
            <button className="btn sm" onClick={() => setMonth(iso(new Date(y, m + 1, 1)))} aria-label="Próximo mês">›</button>
          </span>}>
          <div className="month">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i} className="dh">{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const evs = byDay(d);
              return (
                <button key={d} className={`mcell ${evs.length ? 'has' : ''} ${d === sel ? 'sel' : ''} ${d === t0 ? 'today' : ''}`} onClick={() => setSel(d)}>
                  {Number(d.slice(8))}
                  <span className="dots">{evs.slice(0, 5).map((e, j) => <i key={j} style={{ background: AREA[e.area].color }} />)}</span>
                </button>
              );
            })}
          </div>
          <DayDetail day={sel} items={byDay(sel)} onAdded={() => ui.toast('Evento criado.')} />
        </Card>

        <div className="list" style={{ gap: 16 }}>
          <GoogleCard />
          <Card title="Próximos 7 dias">
            <div className="list">
              {next7.map((e, i) => (
                <div key={i} className="row small"><AreaDot area={e.area} /><b>{ddmm(e.date)}</b><span className="grow">{e.title}</span><span className="muted">{DOW_SHORT[parse(e.date).getDay()]}</span></div>
              ))}
              {next7.length === 0 && <Empty>Semana tranquila.</Empty>}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function DayDetail({ day, items, onAdded }: { day: string; items: CalendarEvent[]; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<AreaId>('pessoal');
  const [kind, setKind] = useState<CalendarKind>('evento');
  const [start, setStart] = useState('');
  const [monthly, setMonthly] = useState(true);
  const ui = useUI();

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await db.events.add({ title: title.trim(), date: day, area, kind, start: start || undefined, source: 'local', repeat: kind === 'vencimento' && monthly ? 'mensal' : undefined });
    setTitle('');
    onAdded();
  }

  return (
    <div style={{ marginTop: 18 }}>
      <b>{ddmm(day)}</b>
      <div className="list" style={{ margin: '8px 0 12px' }}>
        {items.map((e, i) => (
          <div key={i} className="row small">
            <AreaDot area={e.area} /><span className="grow">{e.start && <b>{e.start} </b>}{e.title}</span>
            <span className={`tag ${e.kind === 'vencimento' ? 'warn' : e.kind === 'prazo' ? 'bad' : 'info'}`}>{e.kind}</span>
            {e.source === 'google' && <Icon name="drive" size={12} />}
            {e.repeat === 'mensal' && <span className="faint" title="vence todo mês">↻</span>}
            {e.id && e.source === 'local' && <ItemMenu label={e.title} actions={{ delete: () => void ui.remove('events', e.id!, e.repeat === 'mensal' ? `Conta mensal “${e.title}” (todos os meses)` : `Evento “${e.title}”`) }} />}
          </div>
        ))}
        {items.length === 0 && <Empty>Nada neste dia.</Empty>}
      </div>
      <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={add}>
        <input className="input" style={{ flex: 2, minWidth: 160 }} placeholder="Novo evento, prazo ou vencimento…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" type="time" style={{ width: 110 }} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Horário" />
        <select className="input" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as CalendarKind)} aria-label="Tipo">
          <option value="evento">evento</option><option value="prazo">prazo</option><option value="vencimento">vencimento</option>
        </select>
        <select className="input" style={{ width: 'auto' }} value={area} onChange={(e) => setArea(e.target.value as AreaId)} aria-label="Área">
          {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {kind === 'vencimento' && <label className="check small"><input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} /> todo mês</label>}
        <button className="btn gold">Criar</button>
      </form>
    </div>
  );
}

function GoogleCard() {
  const { settings, events } = useData();
  const ui = useUI();
  const [clientId, setClientId] = useState(settings.googleClientId ?? '');
  const [cals, setCals] = useState<GCal[] | null>(null);
  const [pick, setPick] = useState<Record<string, AreaId | ''>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const step = !settings.googleClientId ? 0 : !cals ? 1 : Object.values(pick).some(Boolean) ? 3 : 2;

  async function connect() {
    setErr('');
    setBusy(true);
    try {
      await connectGoogle(settings.googleClientId!);
      const list = await listCalendars();
      setCals(list);
      setPick(Object.fromEntries(list.map((c) => [c.id, c.primary ? 'pessoal' : ''])));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setErr('');
    try {
      const chosen = (cals ?? []).filter((c) => pick[c.id]).map((c) => ({ id: c.id, name: c.summary, area: pick[c.id] as AreaId }));
      const n = await syncCalendars(chosen);
      ui.toast(`${n} eventos sincronizados do Google.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const synced = [...new Set(events.filter((e) => e.source === 'google').map((e) => e.calendarName))];

  return (
    <Card title="Conexão com o Google">
      <div className="steps">
        {['Conectar conta', 'Autorizar', 'Escolher calendários', 'Sincronizar'].map((s, i) => (
          <div key={s} className={`step ${i <= step ? '' : 'off'}`}><b>{i + 1}</b>{s}</div>
        ))}
      </div>
      <div className="form" style={{ marginTop: 14 }}>
        {!settings.googleClientId ? (
          <>
            <label className="field"><span>OAuth Client ID do Google</span>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" />
            </label>
            <span className="hint">Crie em console.cloud.google.com → APIs → Credenciais → ID do cliente OAuth (Aplicativo da Web), ative a Google Calendar API e autorize a origem deste app.</span>
            <button className="btn gold" disabled={!clientId.trim()} onClick={() => db.settings.update('me', { googleClientId: clientId.trim() })}>Salvar</button>
          </>
        ) : !cals ? (
          <button className="btn gold" disabled={busy} onClick={connect}>{busy ? 'Conectando…' : 'Conectar conta Google'}</button>
        ) : (
          <>
            <b className="small">Calendários</b>
            {cals.map((c) => (
              <div key={c.id} className="row small">
                <span className="dotc" style={{ background: c.backgroundColor ?? '#888' }} /><span className="grow">{c.summary}</span>
                <select className="input" style={{ width: 'auto', padding: '4px 8px' }} value={pick[c.id] ?? ''} onChange={(e) => setPick({ ...pick, [c.id]: e.target.value as AreaId | '' })}>
                  <option value="">não sincronizar</option>
                  {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ))}
            <button className="btn gold" disabled={busy || step < 3} onClick={sync}>{busy ? 'Sincronizando…' : 'Sincronizar'}</button>
          </>
        )}
        {synced.length > 0 && <div className="row small" style={{ flexWrap: 'wrap' }}>{synced.map((n) => <span key={n} className="tag ok">{n} · sincronizado</span>)}</div>}
        {err && <div className="err">{err}</div>}
      </div>
    </Card>
  );
}
