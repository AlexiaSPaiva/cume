import { useEffect, useState } from 'react';
import { Card } from './Card';
import { useUI } from './Overlays';
import { cloud, cloudUserId } from '../lib/cloud';

const FEED = 'cume.feed.token';
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Lembretes no celular: um link secreto de calendário (webcal) que o app Calendário do celular assina.
 * O próprio celular toca os alarmes (funciona no iPhone antigo, sem notificação de site e com o Cume fechado).
 */
export function PhoneCalendar() {
  const ui = useUI();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!cloud) return;
    void cloud.from('feeds').select('token').maybeSingle().then(({ data }) => setToken((data?.token as string | undefined) ?? null));
  }, []);

  async function create(renew = false) {
    if (!cloud) return;
    setBusy(true); setErr('');
    const uid = await cloudUserId();
    if (!uid) { setErr('Entre na sua conta (com internet) para criar o link.'); setBusy(false); return; }
    const t = randomToken();
    const { error } = await cloud.from('feeds').upsert({ user_id: uid, token: t });
    setBusy(false);
    if (error) { setErr('Não deu para criar o link agora. Tente de novo com internet.'); return; }
    try { localStorage.setItem(FEED, t); } catch { /* sem armazenamento: só não lembra neste aparelho */ }
    setToken(t);
    if (renew) ui.toast('Link novo criado. O antigo parou de funcionar.');
  }

  const https = token ? `${location.origin}/api/agenda?t=${token}` : '';
  const webcal = https.replace(/^https?:/, 'webcal:');
  if (!cloud) return null;
  return (
    <Card title="Lembretes no celular" wide>
      <p className="small" style={{ margin: 0 }}>O Calendário do seu celular assina a agenda do Cume e <b>toca os lembretes sozinho</b>, mesmo com o Cume fechado: blocos 10 min antes, prazos na véspera e no dia, contas no dia.</p>
      {!token ? (
        <button className="btn gold" style={{ alignSelf: 'flex-start', marginTop: 10 }} disabled={busy} onClick={() => create()}>Criar link para o celular</button>
      ) : (
        <div className="list" style={{ gap: 10, marginTop: 10 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <a className="btn gold" href={webcal}>Assinar neste celular</a>
            <button className="btn" onClick={() => { void navigator.clipboard?.writeText(https); ui.toast('Link copiado.'); }}>Copiar link</button>
            <button className="btn ghost right" disabled={busy} onClick={() => create(true)}>gerar outro link</button>
          </div>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li><b>iPhone:</b> abra o Cume no Safari do iPhone e toque em <b>Assinar neste celular</b> → <b>Assinar</b>. Ou: Ajustes › Calendário › Contas › Adicionar Conta › Outra › <b>Adicionar Calendário Assinado</b> e cole o link.</li>
            <li>Na tela da assinatura, <b>desligue “Remover Alertas”</b> (senão os avisos não tocam) e salve.</li>
            <li><b>Android:</b> no Google Agenda pelo computador, Outras agendas › <b>+</b> › Do URL, cole o link.</li>
            <li>O celular atualiza a agenda sozinho (de hora em hora, a critério dele). Mudou algo urgente? Abra o app Calendário e puxe a tela para atualizar.</li>
          </ol>
          <span className="faint small">O link é secreto: quem tiver ele vê só a sua agenda (tarefas com horário e eventos). “Gerar outro link” desliga o antigo.</span>
        </div>
      )}
      {err && <span className="small" style={{ color: 'var(--bad)' }}>{err}</span>}
    </Card>
  );
}
