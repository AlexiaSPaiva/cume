import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AREAS, AREA } from '../lib/areas';
import { useData } from '../lib/data';
import { addDays, ddmm, DOW_LONG, dur, longDate, MONTHS, parse, relDays, today } from '../lib/dates';
import { closingData, fmtH, monthToClose, periodRange } from '../lib/history';
import type { Data } from '../lib/data';
import { useTemperature } from '../lib/weather';
import { useAttachmentUrl } from '../lib/attachments';
import { db } from '../lib/db';
import type { RecurringSuggestion } from '../lib/recurrence';
import { DragClose, useFocusMode } from './Card';
import { sceneMode, useScene } from '../lib/scene';
import { BrandMark, SceneBg } from './Brand';
import { Welcome, WELCOME_SESSION_KEY } from './Welcome';
import { useReminders } from '../lib/reminders';
import { ErrorBoundary, OfflineBadge } from './States';
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
  ['/historico', 'Histórico', 'history'],
];

/** itens novos da v7 ganham o selo "novo" no menu */
const NEW = new Set(['/historico']);

/** modo foco da página inteira (⛶ no topo): esconde menu, cenário e rodapé */
const PageFocus = createContext<ReturnType<typeof useFocusMode> | null>(null);

/**
 * Casca do app em três tamanhos:
 * - ≥ 1200px: menu lateral completo, recolhível com « (a escolha fica salva no perfil);
 * - 768–1199px: o menu vira um trilho de ícones (os nomes ficam como dica e para leitores de tela);
 * - < 768px: sem menu lateral; barra inferior com Início, Semana, + (ação rápida), Tarefas e Mais.
 */
export function Layout() {
  const data = useData();
  const { settings } = data;
  const ui = useUI();
  const loc = useLocation();
  useReminders(data.tasks, ui.toast);
  // fechamento automático do mês (dia 1º às 08:00): roda ao abrir o app
  useEffect(() => { void closeMonth(data).catch((e) => console.error('[meuplano] fechamento', e)); }, [data]);
  const temp = useTemperature(settings.city.lat, settings.city.lon);
  const photo = useAttachmentUrl(settings.photoAttachmentId);
  const [sheet, setSheet] = useState<null | 'add' | 'more'>(null);
  useEffect(() => setSheet(null), [loc.pathname]);
  const main = useRef<HTMLDivElement>(null);
  const focus = useFocusMode(main);
  const collapsed = !!settings.sideCollapsed;
  const mode = sceneMode(settings);
  // a cena também vai para a casca: o modo foco a usa ao fundo, escurecida
  const scene = useScene(mode);

  const quick = (fn: () => void) => () => { setSheet(null); fn(); };
  const [welcome, setWelcome] = useState(() => {
    try { return !settings.welcomeDismissed && sessionStorage.getItem(WELCOME_SESSION_KEY) !== '1'; } catch { return !settings.welcomeDismissed; }
  });
  const closeWelcome = () => { try { sessionStorage.setItem(WELCOME_SESSION_KEY, '1'); } catch { /* ok */ } setWelcome(false); };
  // "Ver as boas-vindas de novo" (Personalizar)
  useEffect(() => {
    const h = () => setWelcome(true);
    window.addEventListener('cume:boas-vindas', h);
    return () => window.removeEventListener('cume:boas-vindas', h);
  }, []);

  return (
    <div className={`shell scene-${scene} ${collapsed ? 'collapsed' : ''} ${focus.on ? 'page-focus' : ''}`} style={{ '--accent': settings.accent } as React.CSSProperties}>
      <aside className="side" aria-label="Menu">
        <button type="button" className="icon-btn side-toggle" onClick={() => db.settings.update('me', { sideCollapsed: !collapsed })}
          aria-label={collapsed ? 'Abrir menu' : 'Recolher menu'} aria-expanded={!collapsed} title={collapsed ? 'Abrir menu' : 'Recolher menu'}>
          <Icon name={collapsed ? 'uncollapse' : 'collapse'} size={16} />
        </button>
        <div className="brand">
          <Link to="/" className="name" title="Cume° · Início" aria-label="Cume° · Início">
            <span className="full"><BrandMark subtitle /></span>
            <span className="initial" aria-hidden="true"><img src="/icons/cume-192.png" alt="" /></span>
          </Link>
        </div>
        <NavLinks />
        <Link to="/personalizar" className="me" title="Personalizar">
          <span className="avatar">{photo ? <img src={photo} alt="" /> : settings.name[0]}</span>
          <span className="lbl"><b>{settings.fullName}</b><small>personalizar</small></span>
        </Link>
      </aside>
      <div className="main" ref={main} tabIndex={focus.on ? -1 : undefined}
        role={focus.on ? 'dialog' : undefined} aria-modal={focus.on || undefined} aria-label={focus.on ? 'Modo foco' : undefined}>
        {focus.on && <DragClose onClose={focus.close} target={main} />}
        <div className="hero-bg"><SceneBg kind="hero" mode={mode} photo={photo} /></div>
        <div className="content">
          <PageFocus.Provider value={focus}>
            <ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary>
          </PageFocus.Provider>
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

      {welcome && <Welcome name={settings.name} onClose={closeWelcome} />}
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
          {NEW.has(to) && <span className="novo" aria-label="novo">novo</span>}
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
  const focus = useContext(PageFocus);
  const { pathname } = useLocation();
  // aba do navegador: "Cume° · <nome da tela>"
  const screen = pathname === '/' ? 'Início' : crumbs?.length ? crumbs[crumbs.length - 1].label : typeof title === 'string' ? title : '';
  useEffect(() => { document.title = screen ? `Cume° · ${screen}` : 'Cume°'; }, [screen]);
  return (
    <>
      {focus?.on
        ? (
          <div className="top focus-top">
            <span className="focus-chip">Modo foco</span>
            <div className="crumbs">{typeof title === 'string' ? title : (crumbs ?? [{ label: 'Início' }]).map((c) => c.label).join(' / ')}</div>
            <OfflineBadge />
            <button className="icon-btn" onClick={focus.close} aria-label="Fechar modo foco" title="Fechar (Esc)"><Icon name="x" size={20} /></button>
          </div>
        )
        : <TopBar crumbs={crumbs ?? [{ label: 'Início' }]} onDoc={docButton ? ui.openDoc : undefined} onFocus={focus?.open} />}
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

function TopBar({ crumbs, onDoc, onFocus }: { crumbs: { to?: string; label: string }[]; onDoc?: () => void; onFocus?: () => void }) {
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
      <Link to="/" className="top-brand" aria-label="Cume° · Início"><BrandMark /></Link>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ margin: 0, color: 'inherit' }}>
            {i > 0 && <span>/</span>}
            {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
          </span>
        ))}
      </div>
      <OfflineBadge />
      <Search />
      {onDoc && <button className="btn out doc top-act" onClick={onDoc}>+ Documento</button>}
      <button className="btn out top-act" onClick={() => ui.openImprevisto()}>+ Imprevisto</button>
      <button className="btn gold top-act" onClick={() => ui.openTask()}>+ Tarefa</button>
      {onFocus && <button className="icon-btn top-focus" onClick={onFocus} aria-label="Abrir a tela em modo foco" title="Modo foco"><Icon name="expand" size={18} /></button>}
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
  const { suggestions, events, tasks, snapshots } = useData();
  return useMemo(() => {
    const out: { text: ReactNode; to?: string; suggestion?: RecurringSuggestion }[] = [];
    // fechamento do mês: fica no sino por 7 dias
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
    for (const s of snapshots.filter((x) => x.period === 'mes' && (x.createdAt ?? '') >= week)) {
      const k = s.data as { minutes?: number; done?: number };
      out.push({
        to: `/historico?periodo=mes&data=${s.start}`,
        text: <><b style={{ color: 'var(--accent)' }}>Fechamento de {MONTHS[parse(s.start).getMonth()]}:</b> {fmtH(k.minutes ?? 0)} produtivas, {k.done ?? 0} tarefas concluídas. Ver o histórico ›</>,
      });
    }
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
  }, [suggestions, events, tasks, snapshots]);
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

/** grava o retrato do mês que terminou, uma única vez (só se a conta já existia naquele mês) */
async function closeMonth(d: Data) {
  const m = monthToClose();
  if (!m || d.snapshots.some((x) => x.period === 'mes' && x.start === m)) return;
  const since = (d.settings.createdAt ?? '').slice(0, 10);
  if (since && since > periodRange('mes', m).end) return;
  await db.transaction('rw', db.snapshots, async () => {
    if (await db.snapshots.where('[period+start]').equals(['mes', m]).count()) return;
    await db.snapshots.add({ period: 'mes', start: m, data: closingData(d, m) });
  });
}
