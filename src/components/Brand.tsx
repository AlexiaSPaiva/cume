import { useEffect, useState } from 'react';
import { useScene } from '../lib/scene';
import type { SceneMode, SceneName } from '../lib/types';

/** o "°" do Cume°: um alvo dourado (degree-target.svg do guia) */
export function DegreeTarget() {
  return (
    <svg className="bm-target" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeOpacity=".55" />
      <circle cx="11" cy="11" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".85" />
      <circle cx="11" cy="11" r="1.7" fill="var(--color-gold-light)" />
    </svg>
  );
}

/**
 * Logo escrito do Cume°: "Cume" em Source Serif 4 Italic + o alvo no lugar do grau.
 * O tamanho vem só do font-size (`size`), nunca de transform/scale.
 */
export function BrandMark({ size, subtitle = false, className = '' }: { size?: string; subtitle?: boolean; className?: string }) {
  return (
    <span className={`brandmark ${className}`} style={size ? { fontSize: size } : undefined}>
      <span className="bm-logo" role="img" aria-label="Cume°">
        <span className="bm-word" aria-hidden="true">Cume</span>
        <DegreeTarget />
      </span>
      {subtitle && <span className="bm-sub">Personal Life OS</span>}
    </span>
  );
}

/**
 * Cenário de montanha (decorativo). Troca de cena com fade de 1,2s (sem fade se a pessoa pede menos movimento).
 * `kind`: topo das telas (hero) ou tela cheia do login. Com `photo`, mostra a foto própria.
 */
export function SceneBg({ kind, mode = 'auto', photo }: { kind: 'hero' | 'login'; mode?: SceneMode; photo?: string }) {
  const scene = useScene(mode);
  const [layers, setLayers] = useState<SceneName[]>([scene]);
  useEffect(() => {
    setLayers((l) => (l[l.length - 1] === scene ? l : [...l.slice(-1), scene]));
    const t = setTimeout(() => setLayers([scene]), 1300);
    return () => clearTimeout(t);
  }, [scene]);

  if (mode === 'foto' && photo) {
    return <div className={`scene scene--${kind}`} aria-hidden="true"><img className="scene-photo" src={photo} alt="" /></div>;
  }
  return (
    <div className={`scene scene--${kind}`} aria-hidden="true" data-scene={scene}>
      {layers.map((s, i) => <div key={s} className={`scene-layer scene-${s} ${i > 0 ? 'fade-in' : ''}`} />)}
    </div>
  );
}
