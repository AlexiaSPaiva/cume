import { useState } from 'react';
import { Page } from '../components/Layout';
import { DocForm } from '../components/forms';
import { useUI } from '../components/Overlays';
import { Empty, Icon, Modal, Stat, Stats } from '../components/ui';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, relDays, today } from '../lib/dates';
import type { DocType, VaultDoc } from '../lib/types';

const TABS: { label: string; type?: DocType }[] = [
  { label: 'Todos' }, { label: 'Documentos', type: 'Documento' }, { label: 'Comprovantes', type: 'Comprovante' },
  { label: 'Contratos', type: 'Contrato' }, { label: 'Impostos', type: 'Imposto' },
];

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function openDoc(d: VaultDoc, toast: (m: string) => void) {
  if (d.storage === 'drive' && d.driveUrl) {
    window.open(d.driveUrl, '_blank', 'noopener');
  } else if (d.blob) {
    const url = URL.createObjectURL(d.blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    toast('Este item é um exemplo, sem arquivo anexado.');
  }
}

export function Cofre() {
  const { docs, events } = useData();
  const ui = useUI();
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState('');
  const [attach, setAttach] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const t0 = today();

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = docs
    .filter((d) => !TABS[tab].type || d.type === TABS[tab].type)
    .filter((d) => !q || norm(`${d.name} ${d.linkedTo ?? ''}`).includes(norm(q)))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const dues = events
    .filter((e) => e.kind === 'vencimento' && e.date >= t0 && e.date <= addDays(t0, 30))
    .sort((a, b) => a.date.localeCompare(b.date));
  const hasProof = (title: string) => docs.some((d) => d.type === 'Comprovante' && d.date && d.date >= addDays(t0, -10) && norm(title).includes(norm(d.linkedTo ?? '#')));

  return (
    <Page title="Cofre de documentos" sub="Tudo o que você precisa provar, pagar ou renovar, guardado em um só lugar."
      crumbs={[{ to: '/', label: 'Início' }, { to: '/area/adultices', label: 'Adultices' }, { label: 'Cofre' }]} docButton>
      <Stats n={4}>
        <Stat k="Arquivos no cofre" v={docs.length} s={`${docs.filter((d) => d.storage === 'drive').length} pelo Google Drive`} />
        <Stat k="Comprovantes" v={docs.filter((d) => d.type === 'Comprovante').length} s="ligados ao Financeiro" />
        <Stat k="Contratos" v={docs.filter((d) => d.type === 'Contrato').length} s={docs.find((d) => d.type === 'Contrato')?.linkedTo?.toLowerCase() ?? '—'} />
        <Stat k="Vencem em 30 dias" v={dues.length} s="contas e renovações" />
      </Stats>

      <div className="grid g3">
        <div className="list span2" style={{ gap: 16 }}>
          <section className="card">
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Meus arquivos</h2>
              <input className="input" style={{ marginLeft: 'auto', width: 220 }} placeholder="Buscar arquivo..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar arquivo" />
            </div>
            <div className="pill-tabs" style={{ marginBottom: 8 }}>
              {TABS.map((t, i) => <button key={t.label} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>{t.label}</button>)}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Arquivo</th><th>Tipo</th><th className="hide-m">Data</th><th className="hide-m">Vinculado a</th><th className="num">Valor</th><th /></tr></thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <button className="row" style={{ all: 'unset', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }} onClick={() => openDoc(d, ui.toast)}
                          title={d.storage === 'drive' ? 'Abrir no Google Drive' : 'Abrir arquivo'}>
                          <Icon name={d.storage === 'drive' ? 'drive' : 'file'} size={15} />{d.name}
                        </button>
                      </td>
                      <td className="muted">{d.type}</td>
                      <td className="muted hide-m">{d.date ? ddmm(d.date) : '—'}</td>
                      <td className="muted hide-m">{d.linkedTo ?? '—'}</td>
                      <td className="num">{d.value ? brl(d.value) : '—'}</td>
                      <td className="num">
                        <button className="icon-btn" aria-label={`Apagar ${d.name}`} onClick={async () => {
                          await db.docs.delete(d.id!);
                          ui.toast(`${d.name} removido do cofre.`, { label: 'Desfazer', run: () => db.docs.add(d) });
                        }}><Icon name="trash" size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.length === 0 && <Empty>Nenhum arquivo aqui.</Empty>}
            </div>
            <p className="faint small" style={{ margin: '10px 0 0' }}><Icon name="drive" size={11} /> = guardado no seu Google Drive (abre o link) · <Icon name="file" size={11} /> = arquivo salvo neste aparelho</p>
          </section>

          <section className="card">
            <h2>Vencimentos e renovações</h2>
            <div className="list">
              {dues.map((e) => (
                <div key={e.id} className="row small">
                  <span className="dotc" style={{ background: 'var(--imp)' }} /><b>{ddmm(e.date)}</b><span className="grow">{e.title}</span>
                  <span className="muted" style={{ width: 70 }}>{relDays(e.date)}</span>
                  {hasProof(e.title) ? <span className="tag ok">comprovante ok</span>
                    : <button className="btn sm ghost" style={{ color: '#8fb1d8' }} onClick={() => setAttach(e.title.replace(/ vence$/i, ''))}>anexar comprovante</button>}
                </div>
              ))}
              {dues.length === 0 && <Empty>Nada vence nos próximos 30 dias.</Empty>}
            </div>
          </section>
        </div>

        <section className="card">
          <h2>Adicionar documento</h2>
          <DocForm key={formKey} onDone={(m) => { setFormKey((k) => k + 1); if (m) ui.toast(m); }} />
        </section>
      </div>

      {attach && (
        <Modal title={`Comprovante · ${attach}`} onClose={() => setAttach(null)}>
          <DocForm initial={{ type: 'Comprovante', linkedTo: attach }} onDone={(m) => { setAttach(null); if (m) ui.toast(m); }} />
        </Modal>
      )}
    </Page>
  );
}
