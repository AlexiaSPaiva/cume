import { useEffect, useState, type FormEvent } from 'react';
import { accountEmail, createAccount, hasAccount, login } from '../lib/auth';
import { db } from '../lib/db';
import { defaultSettings, seedExample } from '../lib/seed';
import type { Settings } from '../lib/types';
import { BrandMark, SceneBg } from '../components/Brand';
import { useAttachmentUrl } from '../lib/attachments';
import { sceneMode } from '../lib/scene';

export function Login({ settings, onIn }: { settings?: Settings; onIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | null>(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [example, setExample] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const photo = useAttachmentUrl(settings?.photoAttachmentId);

  useEffect(() => {
    hasAccount().then((h) => setMode(h ? 'login' : 'signup'));
    accountEmail().then((e) => e && setEmail(e));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') {
        if (await login(email, pw)) onIn();
        else setErr('E-mail ou senha não conferem.');
      } else if (mode === 'signup' || mode === 'reset') {
        if (pw.length < 6) return setErr('Use pelo menos 6 caracteres na senha.');
        if (pw !== pw2) return setErr('As senhas não são iguais.');
        if (mode === 'reset') {
          if (email.trim().toLowerCase() !== (await accountEmail())) return setErr('Esse não é o e-mail da conta neste aparelho.');
          await createAccount(email, pw);
          return onIn();
        }
        if (!name.trim()) return setErr('Como você quer ser chamada?');
        await createAccount(email, pw);
        if (!(await db.settings.get('me'))) await db.settings.put(defaultSettings(name.trim(), fullName.trim() || name.trim()));
        if (example) await seedExample();
        onIn();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <SceneBg kind="login" mode={sceneMode(settings)} photo={photo} />
      {mode && (
        <form className="box form" onSubmit={submit}>
          <BrandMark subtitle />
          <div>
            <h1>{mode === 'login' ? `Bem-vinda de volta${settings ? `, ${settings.name}` : ''}` : mode === 'reset' ? 'Nova senha' : 'Vamos começar'}</h1>
            <p className="lead">{mode === 'login' ? 'Cada passo conta. Hoje é o seu.' : mode === 'reset' ? 'Seus dados continuam aqui, só a senha muda.' : 'Crie seu acesso neste aparelho.'}</p>
          </div>
          {mode === 'signup' && (
            <div className="form cols">
              <label className="field"><span>Como quer ser chamada</span><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Alexia" /></label>
              <label className="field"><span>Nome completo</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alexia Silva Paiva" /></label>
            </div>
          )}
          <label className="field"><span>E-mail</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></label>
          <label className="field"><span>{mode === 'reset' ? 'Nova senha' : 'Senha'}</span>
            <input type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
          </label>
          {mode !== 'login' && (
            <label className="field"><span>Confirmar senha</span><input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
          )}
          {mode === 'signup' && (
            <label className="check"><input type="checkbox" checked={example} onChange={(e) => setExample(e.target.checked)} /> Começar com dados de exemplo (dá para apagar depois)</label>
          )}
          {mode === 'login' && (
            <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setMode('reset'); setErr(''); setPw(''); }}>Esqueci a senha</button>
          )}
          {err && <div className="err">{err}</div>}
          <button className="btn gold" style={{ justifyContent: 'center', padding: 13, fontSize: '0.9375rem' }} disabled={busy}>
            {mode === 'login' ? 'Entrar' : mode === 'reset' ? 'Salvar nova senha' : 'Criar e entrar'}
          </button>
          {mode === 'reset' && <button type="button" className="btn ghost sm" onClick={() => setMode('login')}>Voltar</button>}
          <p className="motto">Foco · Clareza · Ação</p>
        </form>
      )}
    </div>
  );
}
