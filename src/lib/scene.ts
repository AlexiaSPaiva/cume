import { useEffect, useState } from 'react';
import type { SceneMode, SceneName, Settings } from './types';

/** faixas do guia (p. 7): 05–10 amanhecer · 10–16 dia · 16–19 entardecer · 19–05 noite */
export function sceneAt(d = new Date()): SceneName {
  const h = d.getHours();
  if (h >= 5 && h < 10) return 'amanhecer';
  if (h >= 10 && h < 16) return 'dia';
  if (h >= 16 && h < 19) return 'entardecer';
  return 'noite';
}

/** milissegundos até a próxima troca de faixa */
function msToNextBand(d = new Date()): number {
  const marks = [5, 10, 16, 19, 29];
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const next = marks.find((m) => m > h) ?? 29;
  return Math.max(1000, (next - h) * 3_600_000 + 500);
}

export const SCENE_LABEL: Record<SceneName, string> = { amanhecer: 'Amanhecer', dia: 'Dia', entardecer: 'Entardecer', noite: 'Noite' };
export const SCENE_HOURS: Record<SceneName, string> = { amanhecer: '05h–10h', dia: '10h–16h', entardecer: '16h–19h', noite: '19h–05h' };

/** chave nova em localStorage só para o index.html pré-carregar a cena certa antes do app abrir */
export const SCENE_PRELOAD_KEY = 'meuplano.scene';

/** modo efetivo: quem já usava foto própria continua com a foto até escolher outra coisa */
export function sceneMode(s?: Pick<Settings, 'sceneMode' | 'photoAttachmentId'>): SceneMode {
  if (s?.sceneMode) return s.sceneMode;
  return s?.photoAttachmentId ? 'foto' : 'auto';
}

/**
 * Cena do momento. No automático, troca sozinha quando o horário muda de faixa.
 * Com uma cena fixada, devolve sempre ela.
 */
export function useScene(mode: SceneMode = 'auto'): SceneName {
  const [auto, setAuto] = useState(sceneAt);
  useEffect(() => {
    if (mode !== 'auto' && mode !== 'foto') return;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { setAuto(sceneAt()); t = setTimeout(tick, msToNextBand()); };
    t = setTimeout(tick, msToNextBand());
    // ao voltar para o app (celular dormindo, aba em segundo plano), confere a hora de novo
    const vis = () => document.visibilityState === 'visible' && setAuto(sceneAt());
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', vis); };
  }, [mode]);
  useEffect(() => {
    try { localStorage.setItem(SCENE_PRELOAD_KEY, mode); } catch { /* modo privado: só perde o pré-carregamento */ }
  }, [mode]);
  return mode === 'auto' || mode === 'foto' ? auto : mode;
}
