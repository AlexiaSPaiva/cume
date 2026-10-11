import { Component, useEffect, useState, type ReactNode } from 'react';

/** carregando: esqueleto com o mesmo desenho da tela (menu, título, indicadores e cards) */
export function Skeleton({ shell = true }: { shell?: boolean }) {
  const body = (
    <div className="content" aria-busy="true" aria-label="Carregando">
      <div className="sk sk-line" style={{ width: '30%', height: 14 }} />
      <div className="sk sk-line" style={{ width: '45%', height: 40, marginTop: 18 }} />
      <div className="stats sk-stats">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk sk-box" style={{ height: 92 }} />)}</div>
      <div className="grid g3">{[0, 1, 2].map((i) => <div key={i} className="sk sk-box" style={{ height: 220 }} />)}</div>
      <span className="sr-only">Carregando seus dados…</span>
    </div>
  );
  if (!shell) return body;
  return (
    <div className="shell">
      <aside className="side" aria-hidden="true"><div className="sk sk-line" style={{ width: '70%', height: 36, margin: '0 10px 24px' }} />
        {Array.from({ length: 10 }, (_, i) => <div key={i} className="sk sk-line" style={{ width: '80%', height: 12, margin: '12px 12px' }} />)}
      </aside>
      <div className="main">{body}</div>
    </div>
  );
}

/** erro: mostra o que houve e "Tentar de novo" (remonta só a parte que quebrou; os dados ficam intactos no aparelho) */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[meuplano] tela', error); }
  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="card state-err" role="alert">
        <h2>Algo deu errado nesta tela</h2>
        <p className="muted">Seus dados continuam salvos no aparelho. Tente abrir de novo; se repetir, recarregue o app.</p>
        <p className="faint small">{this.state.error.message}</p>
        <div className="actions">
          <button className="btn gold" onClick={() => this.setState({ error: null })}>Tentar de novo</button>
          <button className="btn out" onClick={() => location.reload()}>Recarregar o app</button>
        </div>
      </section>
    );
  }
}

export function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

/** offline: os dados são locais, então tudo continua funcionando; o selo só deixa isso claro */
export function OfflineBadge() {
  const online = useOnline();
  if (online) return null;
  return <span className="offline" role="status" title="Sem internet. Tudo o que você fizer fica salvo neste aparelho.">● salvo no aparelho</span>;
}
