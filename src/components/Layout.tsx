import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { AREAS, AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { addDays, ddmm, DOW_LONG, dur, longDate, relDays, today } from '../lib/dates';
import { useTemperature } from '../lib/weather';
import { useAttachmentUrl } from '../lib/attachments';
import type { RecurringSuggestion } from '../lib/recurrence';
import { Scenery } from './Scenery';
import { Icon } from './ui';
import { useUI } from './Overlays';

const SYSTEM = [
  ['/', 'Início'],
  ['/semana', 'Minha semana'],
  ['/agenda', 'Agenda'],
  ['/tarefas', 'Tarefas'],
  ['/planejamento', 'Planejamento'],
  ['/calendario', 'Calendário'],
  ['/metas', 'Objetivos e Metas'],
  ['/imprevistos', 'Imprevistos'],
] as const;

export function Layout() {
  const { settings, suggestions } = useData();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const temp = useTemperature(settings.city.lat, settings.city.lon);
  const photo = useAttachmentUrl(settings.photoAttachmentId);
  useEffect(() => setMenu(false), [loc.pathname]);

  return (
    <div className="shell" style={{ '--accent': settings.accent } as React.CSSProperties}>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <aside className={`side ${menu ? 'open' : ''}`}>
        <div className="brand">
          <Link to="/" className="name">{settings.name}</Link>
          <div className="sub">Personal Life OS</div>
          <div className="sub2">Foco · Clareza · Ação</div>
        </div>
        <nav className="nav" aria-label="Sistema">
          <div className="nav-h">Sistema</div>
          {SYSTEM.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
              {to === '/imprevistos' && suggestions.length > 0 && <span className="count" title="sugestões de imprevistos recorrentes">{suggestions.length}</span>}
            </NavLink>
          ))}
          <div className="nav-h">Vida · abrir painel</div>
          {AREAS.map((a) => (
            <NavLink key={a.id} to={`/area/${a.id}`} className="dot"><span className="d" style={{ background: a.color }} />{a.name}</NavLink>
          ))}
        </nav>
        <Link to="/personalizar" className="me">
          <span className="avatar">{photo ? <img src={photo} alt="" /> : settings.name[0]}</span>
          <span><b>{settings.fullName}</b><small>personalizar</small></span>
        </Link>
      </aside>
      <div className="main">
        <div className="hero-bg"><Scenery id={settings.scenario} photo={photo} /></div>
        <div className="content">
          <Outlet context={{ openMenu: () => setMenu(true) }} />
          <footer className="footer">
            <span>{settings.phrase}</span>
            <span>{settings.city.name}{temp != null && ` · ${temp}°C`}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Page({ title, sub, crumbs, children, docButton }: {
  title: ReactNode; sub?: ReactNode; crumbs?: { to?: string; label: string }[]; children: ReactNode; docButton?: boolean;
}) {
  const now = useClock();
  const ui = useUI();
  return (
    <>
      <TopBar crumbs={crumbs ?? [{ label: 'Início' }]} onDoc={docButton ? ui.openDoc : undefined} />
      <header className="head">
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        <div className="clock">
          <small>{longDate(now)}</small>
          <b>{now.toTimeString().slice(0, 5)}</b>
        </div>
      </header>
      {children}
    </>
  );
}

function TopBar({ crumbs, onDoc }: { crumbs: { to?: string; label: string }[]; onDoc?: () => void }) {
  const ui = useUI();
  const { settings } = useData();
  const nav = useNavigate();
  const [bell, setBell] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { openMenu } = useOutletCtx();
  const photo = useAttachmentUrl(settings.photoAttachmentId);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setBell(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const notes = useNotifications();

  return (
    <div className="top">
      <button className="icon-btn menu-btn" onClick={openMenu} aria-label="Abrir menu"><Icon name="menu" size={20} /></button>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ margin: 0, color: 'inherit' }}>
            {i > 0 && <span>/</span>}
            {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
          </span>
        ))}
      </div>
      <Search />
      {onDoc && <button className="btn out doc" onClick={onDoc} aria-label="Adicionar documento">+ <span className="lbl">Documento</span></button>}
      <button className="btn out" onClick={() => ui.openImprevisto()}>+ <span className="lbl">Imprevisto</span></button>
      <button className="btn gold" onClick={() => ui.openTask()}>+ <span className="lbl">Tarefa</span></button>
      <div ref={ref} style={{ position: 'relative' }}>
        <button className="icon-btn" onClick={() => setBell((b) => !b)} aria-label="Notificações">
          <Icon name="bell" size={19} />{notes.length > 0 && <span className="badge" />}
        </button>
        {bell && (
          <div className="drop">
            <b style={{ fontSize: 13 }}>Notificações</b>
            {notes.length === 0 && <div className="empty">Tudo em dia.</div>}
            {notes.map((n, i) => (
              <button key={i} className="item btn" style={{ textAlign: 'left', fontWeight: 400, whiteSpace: 'normal', display: 'block' }}
                onClick={() => { setBell(false); n.suggestion ? ui.openSuggestion(n.suggestion) : n.to && nav(n.to); }}>
                {n.text}
              </button>
            ))}
          </div>
        )}
      </div>
      <Link to="/personalizar" className="avatar" aria-label="Configurações">
        {photo ? <img src={photo} alt="" /> : settings.name[0]}
      </Link>
    </div>
  );
}

function useOutletCtx() {
  return useOutletContext<{ openMenu: () => void }>() ?? { openMenu: () => {} };
}

function useNotifications(): { text: ReactNode; to?: string; suggestion?: RecurringSuggestion }[] {
  const { suggestions, events, tasks } = useData();
  return useMemo(() => {
    const out: { text: ReactNode; to?: string; suggestion?: RecurringSuggestion }[] = [];
    for (const s of suggestions) {
      out.push({
        suggestion: s,
        text: <><b style={{ color: 'var(--imp)' }}>Imprevisto recorrente:</b> “{s.label}” aconteceu {s.count}x em 30 dias ({dur(s.totalMin)}). Incluir {s.weekdayStrong ? `às ${DOW_LONG[s.weekday]}s ` : ''}no planejamento?</>,
      });
    }
    const t = today(), lim = addDays(t, 3);
    for (const e of events.filter((e) => e.date >= t && e.date <= lim && e.kind !== 'evento')) {
      out.push({ to: '/calendario', text: <><b>{ddmm(e.date)}</b> {e.title} · {relDays(e.date)} <span className="muted">({AREA[e.area].name})</span></> });
    }
    const late = tasks.filter((x) => (x.postponedCount ?? 0) >= 2 && x.status === 'adiada');
    for (const x of late) out.push({ to: '/tarefas', text: <><b style={{ color: 'var(--bad)' }}>Adiada {x.postponedCount}x:</b> {x.title}</> });
    return out;
  }, [suggestions, events, tasks]);
}

function Search() {
  const { tasks, goals, objectives, docs } = useData();
  const ui = useUI();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const results = useMemo(() => {
    const n = norm(q.trim());
    if (n.length < 2) return [];
    return [
      ...tasks.filter((t) => norm(t.title).includes(n)).map((t) => ({ label: t.title, kind: 'tarefa', run: () => ui.openTask(t) })),
      ...goals.filter((g) => norm(g.title).includes(n)).map((g) => ({ label: g.title, kind: 'meta', run: () => nav('/metas') })),
      ...objectives.filter((o) => norm(o.title).includes(n)).map((o) => ({ label: o.title, kind: 'objetivo', run: () => nav('/metas') })),
      ...docs.filter((d) => norm(d.name).includes(n)).map((d) => ({ label: d.name, kind: 'documento', run: () => nav('/area/adultices/cofre') })),
    ].slice(0, 12);
  }, [q, tasks, goals, objectives, docs, ui, nav]);

  return (
    <div className="search">
      <Icon name="search" size={13} />
      <input value={q} placeholder="Buscar tarefa, projeto ou meta..." onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} aria-label="Buscar" />
      {focus && results.length > 0 && (
        <div className="search-res">
          {results.map((r, i) => (
            <button key={i} onMouseDown={(e) => e.preventDefault()} onClick={() => { r.run(); setQ(''); setFocus(false); }}>
              {r.label}<small>{r.kind}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
