import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { SCENES, Scenery } from '../components/Scenery';
import { AreaDot, Icon } from '../components/ui';
import { logout } from '../lib/auth';
import { AREAS } from '../lib/areas';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addFileAttachment, fmtSize } from '../lib/attachments';
import { exportBackup, importBackup } from '../lib/backup';
import { storageInfo, type StorageInfo } from '../lib/storage';
import { listTrash, restore } from '../lib/trash';
import { geocode } from '../lib/weather';
import type { AreaId, Settings, WidgetId } from '../lib/types';

const ACCENTS = ['#c9a77c', '#d9915a', '#d4a0b4', '#9b93c9', '#7ea3cc', '#7fb8a0'];
const WIDGETS: [WidgetId, string][] = [
  ['sugestoes', 'Sugestões de imprevistos recorrentes'], ['top3', 'Top 3 de hoje'], ['prazos', 'Próximos prazos'],
  ['imprevistos', 'Imprevistos da semana'], ['foco', 'Foco por área'], ['tempo', 'Tempo por área'], ['vida', 'Minha vida agora'],
];

/** reduz a foto para no máximo 1800px de largura antes de guardar (vira Blob no IndexedDB) */
function resize(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1800 / img.width);
      const c = document.createElement('canvas');
      c.width = img.width * scale;
      c.height = img.height * scale;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('imagem inválida'))), 'image/jpeg', 0.82);
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
  const [info, setInfo] = useState<StorageInfo>();
  const [busy, setBusy] = useState('');
  const trash = useLiveQuery(() => listTrash(db), []);

  useEffect(() => { storageInfo().then(setInfo); }, [busy]);

  async function exportData() {
    setBusy('Exportando…');
    try {
      const zip = await exportBackup(db);
      const url = URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `meuplano-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy('');
    }
  }

  async function importData(f: File) {
    setBusy('Importando…');
    try {
      const r = await importBackup(db, new Uint8Array(await f.arrayBuffer()));
      ui.toast(`Backup importado: ${r.added} novos, ${r.updated} atualizados, ${r.files} arquivos. Nada foi apagado.`);
    } catch (e) {
      ui.toast(`Não consegui importar: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function setPhoto(f: File) {
    const blob = await resize(f);
    const old = settings.photoAttachmentId;
    const id = await addFileAttachment({ type: 'settings', id: 'me' }, 'photo', Object.assign(blob, { name: f.name }));
    await set({ photoAttachmentId: id });
    if (old) await ui.remove('attachments', old, 'Foto anterior');
    else ui.toast('Foto aplicada.');
  }

  async function removePhoto() {
    const old = settings.photoAttachmentId;
    await set({ photoAttachmentId: undefined });
    if (old) await ui.remove('attachments', old, 'Foto do cenário');
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
              <button key={s.id} className={`scene ${!settings.photoAttachmentId && settings.scenario === s.id ? 'on' : ''}`} style={{ height: 84 }}
                onClick={() => set({ scenario: s.id })}>
                <Scenery id={s.id} /><span>{s.name}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn" onClick={() => photo.current?.click()}><Icon name="up" size={14} /> Usar foto própria</button>
            {settings.photoAttachmentId && <button className="btn ghost" onClick={removePhoto}>remover foto</button>}
            <input ref={photo} type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await setPhoto(f);
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
          <h2>Seus dados</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Tudo fica guardado neste aparelho (IndexedDB), inclusive PDFs e fotos, e continua aqui depois de recarregar, atualizar o app ou fechar o PWA.
          </p>
          <div className="row small" style={{ flexWrap: 'wrap', gap: '6px 18px' }}>
            <span>Armazenamento: <b>{info?.persisted ? 'persistente' : 'padrão do navegador'}</b></span>
            {info?.usage != null && <span>Em uso: <b>{fmtSize(info.usage)}</b>{info.quota ? ` de ${fmtSize(info.quota)} disponíveis` : ''}</span>}
            <span className="faint">versão {__APP_VERSION__}</span>
          </div>
          {info && !info.persisted && (
            <span className="hint">O navegador ainda não marcou o armazenamento como persistente. Instalar o app (ícone na barra de endereço) costuma liberar isso.</span>
          )}
          <div className="actions">
            <button className="btn" onClick={exportData} disabled={!!busy}>Exportar meus dados (.zip)</button>
            <button className="btn" onClick={() => importer.current?.click()} disabled={!!busy}>Importar backup</button>
            <input ref={importer} type="file" accept=".zip,application/zip" hidden data-testid="backup-file"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importData(f); }} />
            {busy && <span className="hint">{busy}</span>}
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => { logout(); onLogout(); }}><Icon name="logout" size={14} /> Sair</button>
          </div>
          <span className="hint">O backup leva tudo, inclusive os arquivos. Importar soma ao que já existe: nada é apagado e, no mesmo item, vale a versão mais recente.</span>
          {settings.googleClientId && (
            <div className="row small"><span className="muted">Google Client ID configurado.</span><button className="btn sm ghost" onClick={() => set({ googleClientId: undefined })}>remover</button></div>
          )}
        </section>

        <section className="card form span2" id="lixeira">
          <h2>Lixeira <span className="muted small" style={{ fontFamily: 'var(--sans)' }}>itens excluídos ficam 30 dias e podem voltar</span></h2>
          <div className="list">
            {(trash ?? []).map((t) => (
              <div key={`${t.table}-${t.id}`} className="row small">
                <Icon name="trash" size={13} /><span className="grow">{t.label}</span>
                <span className="muted">apaga em {t.daysLeft} {t.daysLeft === 1 ? 'dia' : 'dias'}</span>
                <button className="btn sm" onClick={async () => { await restore(db, t.table, t.id); ui.toast('Restaurado.'); }}>Restaurar</button>
              </div>
            ))}
            {trash?.length === 0 && <span className="empty">A Lixeira está vazia.</span>}
          </div>
        </section>
      </div>
    </Page>
  );
}
