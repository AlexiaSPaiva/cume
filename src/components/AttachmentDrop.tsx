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
      <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
        {kinds.length > 1 && (
          <select className="input sm" value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)} aria-label="Tipo do anexo">
            {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
          </select>
        )}
        <button type="button" className="btn sm out" onClick={() => input.current?.click()}><Icon name="up" size={13} /> Escolher arquivo</button>
      </div>
      <div className="row" style={{ width: '100%', gap: 6 }}>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ou cole um link (Drive, Zotero…)" aria-label="Link"
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
          <button type="button" className="btn sm out" onClick={async () => { if (!(await openAttachment(a))) ui.toast('Não encontrei o arquivo.'); }}>{a.url ? 'abrir' : 'ver'}</button>
          <ItemMenu label={a.name} actions={{ delete: () => void ui.remove('attachments', a.id!, a.name) }} />
        </div>
      ))}
      {list.length === 0 && <Empty>Nada anexado ainda.</Empty>}
    </div>
  );
}
