import { useRef, useState } from 'react';
import { addFileAttachment, addLinkAttachment, fmtSize, openAttachment } from '../lib/attachments';
import { useData } from '../lib/data';
import { ddmm } from '../lib/dates';
import type { Attachment, AttachmentKind } from '../lib/types';
import { ItemMenu } from './ItemMenu';
import { useUI } from './Overlays';
import { Empty, Icon } from './ui';

export const KIND_LABEL: Partial<Record<AttachmentKind, string>> = {
  notice: 'Edital', boleto: 'Boleto', receipt: 'Comprovante', material: 'Material', article: 'Artigo', file: 'Arquivo', link: 'Link de pasta',
};

/**
 * Anexar arquivo OU colar um link (Drive, Zotero, planilha…), com o tipo (§6 e §8).
 * O arquivo vai para o banco do aparelho (IndexedDB); o link fica guardado como link.
 */
export function AttachmentDrop({ owner, kinds, defaultKind, onAdded, compact }: {
  owner: { type: string; id: number };
  kinds: AttachmentKind[];
  defaultKind?: AttachmentKind;
  onAdded?: (id: number, kind: AttachmentKind) => void;
  compact?: boolean;
}) {
  const ui = useUI();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AttachmentKind>(defaultKind ?? kinds[0]);
  const [url, setUrl] = useState('');
  const [over, setOver] = useState(false);

  async function addFile(f?: File) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return ui.toast('O arquivo passa de 25 MB.');
    const id = await addFileAttachment(owner, kind === 'link' ? 'file' : kind, f, { name: f.name });
    ui.toast(`${f.name} anexado.`);
    onAdded?.(id, kind);
  }
  async function addLink() {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return ui.toast('Cole um link que comece com http:// ou https://');
    const name = u.replace(/^https?:\/\//, '').slice(0, 60);
    const id = await addLinkAttachment(owner, kind, u, name);
    setUrl('');
    ui.toast('Link guardado.');
    onAdded?.(id, kind);
  }

  return (
    <div className={`dropzone att-drop ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void addFile(e.dataTransfer.files?.[0]); }}>
      <b className="small">Arraste PDF, imagem ou cole um link</b>
      <div className="att-drop-row">
        {kinds.length > 1 && (
          <select className="input sm" value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)} aria-label="Tipo do anexo">
            {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
          </select>
        )}
        <button type="button" className="btn sm out" onClick={() => input.current?.click()}><Icon name="up" size={13} /> Escolher arquivo</button>
      </div>
      <div className="att-drop-link">
        <input className="input" inputMode="url" autoCapitalize="off" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ou cole um link (Drive, Zotero…)" aria-label="Link"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addLink(); } }} />
        <button type="button" className="btn sm out" onClick={() => void addLink()}>Guardar link</button>
      </div>
      <input ref={input} type="file" hidden accept="application/pdf,image/*,.xlsx,.xls,.csv,.ipynb,.doc,.docx" onChange={(e) => void addFile(e.target.files?.[0])} data-testid="att-file" />
    </div>
  );
}

/** lista de anexos de um dono (ver/abrir, ⋯ excluir) */
export function AttachmentList({ owner, kinds, extra }: { owner: { type: string; id: number }; kinds?: AttachmentKind[]; extra?: (a: Attachment) => React.ReactNode }) {
  const d = useData();
  const ui = useUI();
  const list = d.attachments.filter((a) => a.ownerType === owner.type && a.ownerId === owner.id && (!kinds || kinds.includes(a.kind)))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return (
    <div className="list">
      {list.map((a) => (
        <div key={a.id} className="att-row">
          <Icon name={a.url ? 'link' : 'file'} size={18} />
          <span className="grow">
            <b>{a.name}</b>
            <small className="muted">{KIND_LABEL[a.kind] ?? a.kind}{a.size ? ` · ${fmtSize(a.size)}` : ''}{a.createdAt ? ` · anexado ${ddmm(a.createdAt.slice(0, 10))}` : ''}</small>
          </span>
          {extra?.(a)}
          {a.url
            ? <a className="btn sm out" href={a.url} target="_blank" rel="noopener noreferrer">abrir</a>
            : <button type="button" className="btn sm out" onClick={async () => { if (!(await openAttachment(a))) ui.toast('Não encontrei o arquivo.'); }}>ver</button>}
          <ItemMenu label={a.name} actions={{ delete: () => void ui.remove('attachments', a.id!, a.name) }} />
        </div>
      ))}
      {list.length === 0 && <Empty>Nada anexado ainda.</Empty>}
    </div>
  );
}

/** nome curto para um link sem nome: site + começo do caminho */
export function linkName(u: string): string {
  try {
    const x = new URL(u);
    const path = decodeURIComponent(x.pathname).replace(/\/+$/, '');
    return (x.hostname.replace(/^www\./, '') + (path ? path.slice(0, 30) + (path.length > 30 ? '…' : '') : '')).slice(0, 60);
  } catch { return u.replace(/^https?:\/\//, '').slice(0, 60); }
}

/**
 * Links (e arquivos) de uma matéria, tópico, módulo ou trilha, em chips que abrem com um toque.
 * O link é um <a> de verdade: abre no navegador do aparelho, inclusive no app instalado no iPhone.
 * `adding`/`onAdding` deixam quem usa abrir o formulário por fora (ex.: menu ⋯ do tópico).
 */
export function QuickLinks({ owner, kinds, adding: addingProp, onAdding, showAdd = true, empty }: {
  owner: { type: string; id: number };
  kinds?: AttachmentKind[];
  adding?: boolean;
  onAdding?: (v: boolean) => void;
  showAdd?: boolean;
  empty?: string;
}) {
  const d = useData();
  const ui = useUI();
  const [own, setOwn] = useState(false);
  const adding = addingProp ?? own;
  const setAdding = (v: boolean) => { setOwn(v); onAdding?.(v); };
  const [f, setF] = useState({ url: '', name: '' });
  const list = d.attachments.filter((a) => a.ownerType === owner.type && a.ownerId === owner.id && (!kinds || kinds.includes(a.kind)))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let u = f.url.trim();
    if (u && !/^[a-z]+:\/\//i.test(u) && /^[\w-]+(\.[\w-]+)+/.test(u)) u = `https://${u}`;
    if (!/^https?:\/\//i.test(u)) return ui.toast('Cole um link que comece com http:// ou https://');
    await addLinkAttachment(owner, 'link', u, f.name.trim() || linkName(u));
    setF({ url: '', name: '' });
    setAdding(false);
    ui.toast('Link guardado.');
  }

  if (!list.length && !adding && !showAdd && !empty) return null;
  return (
    <div className="qlinks">
      {list.length > 0 && (
        <div className="qlinks-row">
          {list.map((a) => (
            <span key={a.id} className="qlink">
              {a.url
                ? <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}><Icon name="link" size={12} /> {a.name}</a>
                : <button type="button" onClick={() => void openAttachment(a)}><Icon name="file" size={12} /> {a.name}</button>}
              <button type="button" className="qlink-x" aria-label={`Remover ${a.name}`} onClick={() => void ui.remove('attachments', a.id!, a.name)}><Icon name="x" size={11} /></button>
            </span>
          ))}
        </div>
      )}
      {!list.length && !adding && empty && <span className="muted small">{empty}</span>}
      {adding ? (
        <form className="qlinks-form" onSubmit={save}>
          <input className="input" autoFocus inputMode="url" autoCapitalize="off" autoCorrect="off" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="Cole o link (aula, vídeo, PDF, questões…)" aria-label="Link" />
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nome (opcional)" aria-label="Nome do link" />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm gold">Guardar</button>
            <button type="button" className="btn sm ghost" onClick={() => { setAdding(false); setF({ url: '', name: '' }); }}>Cancelar</button>
          </div>
        </form>
      ) : showAdd && <button type="button" className="qlink-add" onClick={() => setAdding(true)}>+ link</button>}
    </div>
  );
}
