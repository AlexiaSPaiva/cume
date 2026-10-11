import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** o app acabou de abrir (ninguém começou a digitar ainda) */
const JUST_OPENED_MS = 8000;

/**
 * Versão nova do app. Para as correções chegarem sem a pessoa precisar fazer nada:
 * - se a versão nova aparece logo ao abrir o app, ela entra na hora;
 * - se aparece com o app em uso, mostra a faixa "Nova versão · Atualizar" e entra sozinha
 *   quando a pessoa sai do app (troca de aplicativo, bloqueia a tela).
 * Nada se perde: os dados ficam no IndexedDB e os rascunhos são salvos a cada mudança.
 */
export function UpdateBanner() {
  // "Depois" só esconde a faixa: a versão nova ainda entra quando a pessoa sair do app
  const [hidden, setHidden] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // procura versão nova a cada hora e quando o app volta ao primeiro plano
      setInterval(() => void reg.update(), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update());
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    document.documentElement.dataset.update = 'available';
    if (performance.now() < JUST_OPENED_MS) { void updateServiceWorker(true); return; }
    const away = () => { if (document.visibilityState === 'hidden') void updateServiceWorker(true); };
    document.addEventListener('visibilitychange', away);
    return () => document.removeEventListener('visibilitychange', away);
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh || hidden) return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      Nova versão disponível
      <button className="btn sm gold" onClick={() => updateServiceWorker(true)}>Atualizar</button>
      <button className="btn sm ghost" onClick={() => setHidden(true)} aria-label="Depois">Depois</button>
    </div>
  );
}
