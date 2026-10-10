import type { ScenarioId } from '../lib/types';

export const SCENES: { id: ScenarioId; name: string; sky: [string, string, string]; hill: [string, string]; water: string; sun?: string; stars?: boolean }[] = [
  { id: 'por-do-sol', name: 'Pôr do sol na baía', sky: ['#3a3550', '#8a6a6a', '#d9a982'], hill: ['#2a2230', '#4a3a40'], water: '#2b2a3c', sun: '#f3c99a' },
  { id: 'manha', name: 'Manhã na orla', sky: ['#4f6a92', '#93a9c6', '#e6dcd2'], hill: ['#28354d', '#4b5c78'], water: '#3b4c6a' },
  { id: 'noite', name: 'Noite carioca', sky: ['#0d1124', '#1f2340', '#3b3a5c'], hill: ['#0b0e1d', '#1b1f36'], water: '#141830', stars: true },
  { id: 'lagoa', name: 'Lagoa rosa', sky: ['#c88aa0', '#eaa3a8', '#f6c2b0'], hill: ['#7d5a78', '#a07490'], water: '#b58a9e' },
];

/** paisagem do Rio desenhada em SVG (Pão de Açúcar, morros e baía) */
export function Scenery({ id, photo }: { id: ScenarioId; photo?: string }) {
  if (photo) return <img src={photo} alt="" />;
  const s = SCENES.find((x) => x.id === id) ?? SCENES[0];
  const g = `g-${s.id}`;
  return (
    <svg viewBox="0 0 1600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${g}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.sky[0]} />
          <stop offset=".6" stopColor={s.sky[1]} />
          <stop offset="1" stopColor={s.sky[2]} />
        </linearGradient>
        <linearGradient id={`${g}-hill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.hill[1]} />
          <stop offset="1" stopColor={s.hill[0]} />
        </linearGradient>
        <radialGradient id={`${g}-sun`} cx="0.62" cy="0.78" r="0.4">
          <stop offset="0" stopColor={s.sun ?? 'transparent'} stopOpacity=".85" />
          <stop offset="1" stopColor={s.sun ?? 'transparent'} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="400" fill={`url(#${g}-sky)`} />
      {s.sun && <rect width="1600" height="400" fill={`url(#${g}-sun)`} />}
      {s.stars &&
        Array.from({ length: 70 }, (_, i) => (
          <circle key={i} cx={(i * 397) % 1600} cy={(i * 131) % 220} r={i % 5 === 0 ? 1.6 : 0.9} fill="#fff" opacity={0.3 + ((i * 7) % 6) / 10} />
        ))}
      {/* morros ao fundo */}
      <path d="M0 300 C120 250 220 270 320 240 C420 210 520 260 640 250 C760 240 840 200 960 230 C1080 260 1180 210 1300 220 C1420 230 1520 260 1600 250 L1600 400 L0 400Z" fill={s.hill[1]} opacity=".55" />
      {/* Pão de Açúcar e Urca */}
      <path d="M-20 400 L-20 120 C40 60 120 40 190 90 C240 130 270 210 330 250 C380 280 430 290 480 300 L560 310 L560 400Z" fill={`url(#${g}-hill)`} />
      <path d="M1040 400 L1040 300 C1080 290 1110 270 1140 230 C1170 190 1200 150 1240 150 C1280 150 1300 190 1320 230 C1340 270 1380 280 1420 285 L1460 280 C1480 230 1505 170 1540 170 C1570 170 1590 210 1620 260 L1620 400Z" fill={`url(#${g}-hill)`} />
      <path d="M560 400 L560 320 C640 300 720 310 820 300 C900 292 960 300 1040 300 L1040 400Z" fill={s.hill[0]} opacity=".9" />
      {/* água */}
      <rect y="345" width="1600" height="55" fill={s.water} opacity=".85" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={120 + i * 150} y={355 + (i % 3) * 12} width={60 + (i % 4) * 20} height="1.5" fill="#fff" opacity=".12" />
      ))}
    </svg>
  );
}
