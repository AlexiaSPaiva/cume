import { useRef, useState } from 'react';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { SCENES, Scenery } from '../components/Scenery';
import { AreaDot, Icon } from '../components/ui';
import { logout } from '../lib/auth';
import { AREAS } from '../lib/areas';
import { useData } from '../lib/data';
import { clearAllData, db } from '../lib/db';
import { seedExample } from '../lib/seed';
import { geocode } from '../lib/weather';
import type { AreaId, Settings, WidgetId } from '../lib/types';

const ACCENTS = ['#c9a77c', '#d9915a', '#d4a0b4', '#9b93c9', '#7ea3cc', '#7fb8a0'];
const WIDGETS: [WidgetId, string][] = [
  ['sugestoes', 'Sugestões de imprevistos recorrentes'], ['top3', 'Top 3 de hoje'], ['prazos', 'Próximos prazos'],
  ['imprevistos', 'Imprevistos da semana'], ['foco', 'Foco por área'], ['tempo', 'Tempo por área'], ['vida', 'Minha vida agora'],
];

/** reduz a foto para no máximo 1800px de largura antes de guardar */
function resize(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1800 / img.width);
      const c = document.createElement('canvas');
      c.width = img.width * scale;
      c.height = img.height * scale;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function Personalizar({ onLogout }: { onLogout: () => void }) {
  const { settings } = useData();
  const ui = useUI();
  const [city, setCity] = useState(settings.city.name);
  const photo = useRef<HTMLInputElement>(null);
  const importer = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Settings>) => db.settings.update('me', p);
  const focusTotal = Object.values(settings.desiredFocus).reduce((a, b) => a + b, 0);

  async function exportData() {
    const dump: Record<string, unknown[]> = {};
    for (const t of ['tasks', 'imprevistos', 'objectives', 'goals', 'records', 'events', 'plans', 'settings', 'suggestions'] as const) {
      dump[t] = await db.table(t).toArray();
    }
    dump.docs = (await db.docs.toArray()).map(({ blob: _b, ...rest }) => rest);
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `meuplano-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(f: File) {
    try {
      const dump = JSON.parse(await f.text()) as Record<string, unknown[]>;
      await clearAllData();
      for (const [t, rows] of Object.entries(dump)) if (Array.isArray(rows)) await db.table(t).bulkPut(rows);
      ui.toast('Backup restaurado.');
    } catch {
      ui.toast('Não consegui ler esse arquivo de backup.');
    }
  }

  return (
    <Page title="Personalizar" sub="Seu nome, seu cenário, seu jeito." crumbs={[{ to: '/', label: 'Início' }, { label: 'Personalizar' }]}>
      <div className="grid g2">
        <section className="card form">
          <h2>Você</h2>
          <div className="cols">
            <label className="field"><span>Nome no app</span><input value={settings.name} onChange={(e) => set({ name: e.target.value || 'Você' })} /></label>
            <label className="field"><span>Nome completo</span><input value={settings.fullName} onChange={(e) => set({ fullName: e.target.value })} /></label>
          </div>
          <label className="field"><span>Frase do rodapé</span><input value={settings.phrase} onChange={(e) => set({ phrase: e.target.value })} /></label>
          <div className="field"><span>Cor de destaque</span>
            <div className="row">
              {ACCENTS.map((c) => (
                <button key={c} aria-label={`cor ${c}`} onClick={() => set({ accent: c })}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: settings.accent === c ? '3px solid #fff' : '1px solid var(--line-2)', cursor: 'pointer' }} />
              ))}
              <input type="color" value={settings.accent} onChange={(e) => set({ accent: e.target.value })} aria-label="Outra cor" style={{ width: 36, height: 30, background: 'none', border: 0 }} />
            </div>
          </div>
          <div className="field"><span>Cidade (clima no rodapé)</span>
            <div className="row">
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
              <button className="btn" onClick={async () => {
                const g = await geocode(city).catch(() => null);
                if (g) { await set({ city: g }); setCity(g.name); ui.toast(`Cidade: ${g.name}`); } else ui.toast('Cidade não encontrada.');
              }}>Salvar</button>
            </div>
          </div>
        </section>

        <section className="card form">
          <h2>Cenário</h2>
          <div className="grid g2" style={{ gap: 10 }}>
            {SCENES.map((s) => (
              <button key={s.id} className={`scene ${!settings.customPhoto && settings.scenario === s.id ? 'on' : ''}`} style={{ height: 84 }}
                onClick={() => set({ scenario: s.id, customPhoto: undefined })}>
                <Scenery id={s.id} /><span>{s.name}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn" onClick={() => photo.current?.click()}><Icon name="up" size={14} /> Usar foto própria</button>
            {settings.customPhoto && <button className="btn ghost" onClick={() => set({ customPhoto: undefined })}>remover foto</button>}
            <input ref={photo} type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) { await set({ customPhoto: await resize(f) }); ui.toast('Foto aplicada.'); }
            }} />
          </div>
        </section>

        <section className="card form">
          <h2>Foco desejado por área</h2>
          {AREAS.map((a) => (
            <label key={a.id} className="row small">
              <AreaDot area={a.id} /><span style={{ width: 90 }}>{a.name}</span>
              <input type="range" min={0} max={60} value={settings.desiredFocus[a.id]} style={{ flex: 1, accentColor: a.color }}
                onChange={(e) => set({ desiredFocus: { ...settings.desiredFocus, [a.id as AreaId]: Number(e.target.value) } })} />
              <b style={{ width: 38, textAlign: 'right' }}>{settings.desiredFocus[a.id]}%</b>
            </label>
          ))}
          <span className={focusTotal === 100 ? 'hint' : 'err'}>Total: {focusTotal}%{focusTotal !== 100 && ' (o ideal é somar 100%)'}</span>
        </section>

        <section className="card form">
          <h2>Blocos da Início</h2>
          {WIDGETS.map(([id, label]) => (
            <label key={id} className="check">
              <input type="checkbox" checked={settings.widgets.includes(id)}
                onChange={(e) => set({ widgets: e.target.checked ? [...settings.widgets, id] : settings.widgets.filter((w) => w !== id) })} /> {label}
            </label>
          ))}
          <h2 style={{ marginTop: 12 }}>Imprevistos recorrentes</h2>
          <label className="field"><span>Sugerir incluir no planejamento quando um imprevisto parecido acontecer</span>
            <select value={settings.recurrenceThreshold} onChange={(e) => set({ recurrenceThreshold: Number(e.target.value) })}>
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} vezes em 30 dias</option>)}
            </select>
          </label>
          <label className="field"><span>Horas por semana disponíveis para planejar</span>
            <input type="number" min={10} max={120} value={settings.weekCapacityH ?? 80} onChange={(e) => set({ weekCapacityH: Number(e.target.value) || 80 })} />
          </label>
        </section>

        <section className="card form span2">
          <h2>Dados e conta</h2>
          <p className="muted small" style={{ margin: 0 }}>Seus dados ficam guardados só neste aparelho. Faça backup de vez em quando.</p>
          <div className="actions">
            <button className="btn" onClick={exportData}>Exportar backup (.json)</button>
            <button className="btn" onClick={() => importer.current?.click()}>Restaurar backup</button>
            <input ref={importer} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
            <button className="btn" onClick={async () => { await clearAllData(); await seedExample(); ui.toast('Dados de exemplo recarregados.'); }}>Recarregar exemplo</button>
            <button className="btn danger" onClick={async () => {
              if (!window.confirm('Apagar todas as tarefas, metas, imprevistos e documentos deste aparelho?')) return;
              await clearAllData();
              ui.toast('Tudo apagado. Comece do zero!');
            }}>Apagar todos os dados</button>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => { logout(); onLogout(); }}><Icon name="logout" size={14} /> Sair</button>
          </div>
          {settings.googleClientId && (
            <div className="row small"><span className="muted">Google Client ID configurado.</span><button className="btn sm ghost" onClick={() => set({ googleClientId: undefined })}>remover</button></div>
          )}
        </section>
      </div>
    </Page>
  );
}
