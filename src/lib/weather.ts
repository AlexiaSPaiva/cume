import { useEffect, useState } from 'react';

const CACHE = 'meuplano.weather';

/** temperatura atual via Open-Meteo (sem chave); guarda 30 min em cache */
export function useTemperature(lat: number, lon: number): number | null {
  const [temp, setTemp] = useState<number | null>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) ?? 'null');
      return c && c.lat === lat && c.lon === lon ? c.t : null;
    } catch { return null; }
  });

  useEffect(() => {
    let cached: { at: number; lat: number; lon: number } | null = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE) ?? 'null'); } catch { /* ignore */ }
    if (cached && cached.lat === lat && cached.lon === lon && Date.now() - cached.at < 30 * 60_000) return;
    const ctl = new AbortController();
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => {
        const t = Math.round(j?.current?.temperature_2m);
        if (Number.isFinite(t)) {
          setTemp(t);
          try { localStorage.setItem(CACHE, JSON.stringify({ t, lat, lon, at: Date.now() })); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* offline: mantém o último valor */ });
    return () => ctl.abort();
  }, [lat, lon]);

  return temp;
}

export async function geocode(name: string): Promise<{ name: string; lat: number; lon: number } | null> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt`);
  const j = await r.json();
  const g = j?.results?.[0];
  if (!g) return null;
  return { name: [g.name, g.admin1].filter(Boolean).join(', '), lat: g.latitude, lon: g.longitude };
}
