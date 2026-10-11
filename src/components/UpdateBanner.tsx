import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Aviso de versão nova. O service worker novo fica esperando até a usuária clicar em "Atualizar";
 * os dados não dependem disso (estão no IndexedDB e os rascunhos são salvos a cada mudança).
 */
export function UpdateBanner() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // procura versão nova a cada hora e quando o app volta ao primeiro plano
      setInterval(() => void reg.update(), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update());
    },
  });

  useEffect(() => {
    if (needRefresh) document.documentElement.dataset.update = 'available';
  }, [needRefresh]);

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      Nova versão disponível
      <button className="btn sm gold" onClick={() => updateServiceWorker(true)}>Atualizar</button>
      <button className="btn sm ghost" onClick={() => setNeedRefresh(false)} aria-label="Depois">Depois</button>
    </div>
  );
}
