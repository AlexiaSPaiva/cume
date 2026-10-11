import { useEffect, useState } from 'react';
import { logout } from '../lib/auth';
import { runSync, useSyncStatus, type SyncStatus } from '../lib/syncApp';
import { AVISO_KEY } from '../pages/Login';

const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

export function syncText(s: SyncStatus): string {
  switch (s.kind) {
    case 'desligada': return 'Seus dados ficam só neste aparelho.';
    case 'entrar': return 'Esta conta ainda não está guardada na nuvem neste aparelho.';
    case 'sincronizando': return 'Sincronizando…';
    case 'ok': return `Guardado na nuvem · sincronizado às ${hhmm(s.at)}`;
    case 'offline': return `Sem internet: tudo fica salvo aqui e sobe quando a conexão voltar${s.at ? ` (última vez às ${hhmm(s.at)})` : ''}.`;
    case 'erro': return `Não foi possível sincronizar agora. Tentaremos de novo em instantes.${s.at ? ` Última vez às ${hhmm(s.at)}.` : ''}`;
  }
}

/**
 * Faixa no topo:
 * - conta de antes da nuvem (ou que entrou sem internet): pede para entrar de novo uma vez, e aí os dados sobem;
 * - aviso do login (ex.: senha da nuvem diferente), uma vez.
 */
export function SyncBanner({ onRelogin }: { onRelogin: () => void }) {
  const s = useSyncStatus();
  const [aviso, setAviso] = useState<string | null>(() => { try { return sessionStorage.getItem(AVISO_KEY); } catch { return null; } });
  const close = () => { try { sessionStorage.removeItem(AVISO_KEY); } catch { /* ignore */ } setAviso(null); };
  if (aviso) {
    return (
      <div className="update-banner sync-banner" role="status">
        <span>{aviso}</span>
        <button className="btn sm ghost" onClick={close}>Ok</button>
      </div>
    );
  }
  if (s.kind !== 'entrar') return null;
  return (
    <div className="update-banner sync-banner" role="status" data-testid="sync-banner">
      <span>Seus dados estão só neste aparelho. Entre de novo uma vez para guardá-los na nuvem e usar o Cume° em qualquer lugar.</span>
      <button className="btn sm gold" onClick={() => { logout(); onRelogin(); }}>Entrar de novo</button>
    </div>
  );
}

/** linha de estado em Personalizar › Seus dados */
export function SyncLine({ onRelogin }: { onRelogin: () => void }) {
  const s = useSyncStatus();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  if (s.kind === 'desligada') return null;
  return (
    <div className="row small" style={{ flexWrap: 'wrap', gap: '6px 12px' }} data-testid="sync-line">
      <span><b>Nuvem:</b> {syncText(s)}</span>
      {s.kind === 'entrar'
        ? <button className="btn sm gold" onClick={() => { logout(); onRelogin(); }}>Entrar de novo</button>
        : <button className="btn sm ghost" disabled={s.kind === 'sincronizando'} onClick={() => void runSync()}>Sincronizar agora</button>}
    </div>
  );
}
