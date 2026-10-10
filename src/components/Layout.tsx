import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AREAS, AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { addDays, ddmm, DOW_LONG, dur, longDate, relDays, today } from '../lib/dates';
import { useTemperature } from '../lib/weather';
import { useAttachmentUrl } from '../lib/attachments';
import type { RecurringSuggestion } from '../lib/recurrence';
import { Scenery } from './Scenery';
import { Icon, Modal } from './ui';
import { useUI } from './Overlays';

const SYSTEM: [to: string, label: string, icon: string][] = [
  ['/', 'Início', 'home'],
  ['/semana', 'Minha semana', 'week'],
  ['/agenda', 'Agenda', 'agenda'],
  ['/tarefas', 'Tarefas', 'tasks'],
  ['/planejamento', 'Planejamento', 'plan'],
  ['/calendario', 'Calendário', 'calendar'],
  ['/metas', 'Objetivos e Metas', 'target'],
  ['/imprevistos', 'Imprevistos', 'zap'],
];

/**
 * Casca do app em três tamanhos:
 * - ≥ 1200px: menu lateral completo;
 * - 768–1199px: o menu vira um trilho de ícones (os nomes ficam como dica e para leitores de tela);
 * - < 768px: sem menu lateral; barra inferior com Início, Semana, + (ação rápida), Tarefas e Mais.
 */
export function Layout() {
  const { settings } = useData();
  const ui = useUI();
  const loc = useLocation();
  const temp = useTemperature(settings.city.lat, settings.city.lon);
  const photo = useAttachmentUrl(settings.photoAttachmentId);
  const [sheet, setSheet] = useState<null | 'add' | 'more'>(null);
  useEffect(() => setSheet(null), [loc.pathname]);

  const quick = (fn: () => void) => () => { setSheet(null); fn(); };

  return (
    <div className="shell" style={{ '--accent': settings.accent } as React.CSSProperties}>
      <aside className="side" aria-label="Menu">
        <div className="brand">
          <Link to="/" className="name" title={`${settings.name} · Início`}>
            <span className="full">{settings.name}</span>
            <span className="initial" aria-hidden="true">{settings.name[0]}</span>
          </Link>
          <div className="sub">Personal Life OS</div>
          <div className="sub2">Foco · Clareza · Ação</div>
        </div>
        <NavLinks />
        <Link to="/personalizar" className="me" title="Personalizar">
          <span className="avatar">{photo ? <img src={photo} alt="" /> : settings.name[0]}</span>
          <span className="lbl"><b>{settings.fullName}</b><small>personalizar</small></span>
        </Link>
      </aside>
      <div className="main">
        <div className="hero-bg"><Scenery id={settings.scenario} photo={photo} /></div>
        <div className="content">
          <Outlet />
          <footer className="footer">
            <span>{settings.phrase}</span>
            <span>{settings.city.name}{temp != null && ` · ${temp}°C`}</span>
          </footer>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Atalhos">
        <NavLink to="/" end><Icon name="home" size={20} /><span>Início</span></NavLink>
        <NavLink to="/semana"><Icon name="week" size={20} /><span>Semana</span></NavLink>
        <button type="button" className="fab" onClick={() => setSheet('add')} aria-label="Adicionar"><Icon name="plus" size={24} /></button>
        <NavLink to="/tarefas"><Icon name="tasks" size={20} /><span>Tarefas</span></NavLink>
        <button type="button" onClick={() => setSheet('more')} aria-expanded={sheet === 'more'}><Icon name="menu" size={20} /><span>Mais</span></button>
      </nav>

      {sheet === 'add' && (
        <Modal title="Adicionar" onClose={() => setSheet(null)}>
          <div className="list quick">
            <button className="btn gold" onClick={quick(() => ui.openTask())}><Icon name="tasks" /> Tarefa</button>
            <button className="btn out" onClick={quick(() => ui.openImprevisto())}><Icon name="zap" /> Imprevisto</button>
            <button className="btn out" onClick={quick(() => ui.openDoc())}><Icon name="file" /> Documento no Cofre</button>
          </div>
        </Modal>
      )}
      {sheet === 'more' && (
        <Modal title="Mais" onClose={() => setSheet(null)}>
          <Search />
          <NavLinks />
          <Link to="/personalizar" className="me" style={{ marginTop: 12 }}>
            <span className="avatar">{photo ? <img src={photo} alt="" /> : settings.name[0]}</span>
            <span><b>{settings.fullName}</b><small>personalizar · dados · backup · lixeira</small></span>
          </Link>
        </Modal>
      )}
    </div>
  );
}

function NavLinks() {
  const { suggestions } = useData();
  return (
    <nav className="nav" aria-label="Navegação principal">
      <div className="nav-h">Sistema</div>
      {SYSTEM.map(([to, label, icon]) => (
        <NavLink key={to} to={to} end={to === '/'} title={label}>
          <Icon name={icon} size={18} />
          <span className="lbl">{label}</span>
          {to === '/imprevistos' && suggestions.length > 0 && <span className="count" title="sugestões de imprevistos recorrentes">{suggestions.length}</span>}
        </NavLink>
      ))}
      <div className="nav-h">Vida · abrir painel</div>
      {AREAS.map((a) => (
        <NavLink key={a.id} to={`/area/${a.id}`} className="dot" title={a.name}>
          <span className="d" style={{ background: a.color }} />
          <span className="lbl">{a.name}</span>
        </NavLink>
      ))}
    </nav>
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
  const photo = useAttachmentUrl(settings.photoAttachmentId);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setBell(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const notes = useNotifications();

  return (
    <div className="top">
      <Link to="/" className="top-brand">{settings.name}</Link>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ margin: 0, color: 'inherit' }}>
            {i > 0 && <span>/</span>}
            {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
          </span>
        ))}
      </div>
      <Search />
      {onDoc && <button className="btn out doc top-act" onClick={onDoc}>+ Documento</button>}
      <button className="btn out top-act" onClick={() => ui.openImprevisto()}>+ Imprevisto</button>
      <button className="btn gold top-act" onClick={() => ui.openTask()}>+ Tarefa</button>
      <div ref={ref} style={{ position: 'relative' }}>
        <button className="icon-btn" onClick={() => setBell((b) => !b)} aria-label="Notificações" aria-expanded={bell}>
          <Icon name="bell" size={19} />{notes.length > 0 && <span className="badge" />}
        </button>
        {bell && (
          <div className="drop">
            <b style={{ fontSize: '0.8125rem' }}>Notificações</b>
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
