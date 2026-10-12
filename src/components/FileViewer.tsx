import { useEffect, useState } from 'react';
import { fmtSize, loadFile } from '../lib/attachments';
import { cloudFileUrl } from '../lib/cloud';
import type { Attachment } from '../lib/types';
import { Icon } from './ui';

/**
 * Visualizador de arquivo dentro do app. Mostra a prévia (PDF ou imagem) e dá três caminhos
 * que funcionam em qualquer aparelho: abrir em tela cheia, baixar e compartilhar (no iPhone:
 * "Salvar em Arquivos", "Abrir no Livros"…). Todos são toques diretos, que o Safari não bloqueia.
 */
export function FileViewer({ a }: { a: Attachment }) {
  const [blob, setBlob] = useState<Blob | null | undefined>(undefined);
  const [local, setLocal] = useState<string>();
  const [remote, setRemote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadFile(a).then((b) => alive && setBlob(b ?? null)).catch(() => alive && setBlob(null));
    if (a.blobKey) void cloudFileUrl(a.blobKey).then((u) => alive && setRemote(u));
    return () => { alive = false; };
  }, [a]);

  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setLocal(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const type = blob?.type || a.mime || '';
  const isPdf = /pdf/i.test(type) || /\.pdf$/i.test(a.name);
  const isImg = /^image\//i.test(type);
  const file = blob ? new File([blob], a.name, { type: type || 'application/octet-stream' }) : null;
  const canShare = !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  // o endereço da nuvem abre no leitor do próprio aparelho, mesmo no app instalado na Tela de Início
  const full = remote ?? local;

  if (blob === undefined && !remote) return <p className="muted small" role="status">Carregando o arquivo…</p>;
  if (blob === null && !remote) {
    return <p className="small">Não encontrei este arquivo neste aparelho nem na nuvem. Se ele foi anexado em outro aparelho, abra o app lá uma vez com internet para ele subir.</p>;
  }

  return (
    <div className="file-viewer">
      <p className="muted small" style={{ margin: 0 }}>{a.name}{a.size ? ` · ${fmtSize(a.size)}` : ''}</p>
      {local && isImg && <img className="file-preview" src={local} alt={a.name} />}
      {local && isPdf && <iframe className="file-preview pdf" src={local} title={a.name} />}
      <div className="file-actions">
        {full && <a className="btn gold" href={full} target="_blank" rel="noopener"><Icon name="file" size={14} /> Abrir em tela cheia</a>}
        {canShare && (
          <button type="button" className="btn out" onClick={() => { void navigator.share({ files: [file!], title: a.name }).catch(() => {}); }}>
            <Icon name="up" size={14} /> Compartilhar / salvar
          </button>
        )}
        {local && <a className="btn out" href={local} download={a.name}>Baixar</a>}
      </div>
      <p className="hint" style={{ margin: 0 }}>No iPhone, “Compartilhar” deixa salvar em Arquivos ou abrir no Livros.</p>
    </div>
  );
}
