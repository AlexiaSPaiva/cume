import { useEffect, useState, type FormEvent } from 'react';
import { accountEmail, createAccount, hasAccount, login } from '../lib/auth';
import { db } from '../lib/db';
import { defaultSettings, seedExample } from '../lib/seed';
import type { ScenarioId, Settings } from '../lib/types';
import { SCENES, Scenery } from '../components/Scenery';

export function Login({ settings, onIn }: { settings?: Settings; onIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | null>(null);
  const [scene, setScene] = useState<ScenarioId>(settings?.scenario ?? 'por-do-sol');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [example, setExample] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hasAccount().then((h) => setMode(h ? 'login' : 'signup'));
    accountEmail().then((e) => e && setEmail(e));
  }, []);

  async function pickScene(id: ScenarioId) {
    setScene(id);
    if (settings) await db.settings.update('me', { scenario: id, customPhoto: undefined });
  }

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
        await db.settings.put({ ...defaultSettings(name.trim(), fullName.trim() || name.trim()), scenario: scene });
        if (example) await seedExample();
        onIn();
      }
    } finally {
      setBusy(false);
    }
  }

  const displayName = settings?.name ?? 'MeuPlano';

  return (
    <div className="login">
      <div className="hero-bg"><Scenery id={scene} photo={scene === settings?.scenario ? settings?.customPhoto : undefined} /></div>
      <div className="brandL">
        <div className="name">{displayName}</div>
        <p>Personal Life OS &nbsp;·&nbsp; Foco · Clareza · Ação</p>
      </div>
      {mode && (
        <form className="box form" onSubmit={submit}>
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
          <button className="btn gold" style={{ justifyContent: 'center', padding: 13, fontSize: 15 }} disabled={busy}>
            {mode === 'login' ? 'Entrar' : mode === 'reset' ? 'Salvar nova senha' : 'Criar e entrar'}
          </button>
          {mode === 'reset' && <button type="button" className="btn ghost sm" onClick={() => setMode('login')}>Voltar</button>}
          <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>entre e se sinta em casa</p>
        </form>
      )}
      <b style={{ marginTop: 28 }}>Escolha o seu cenário</b>
      <div className="scenes">
        {SCENES.map((s) => (
          <button key={s.id} type="button" className={`scene ${scene === s.id ? 'on' : ''}`} onClick={() => pickScene(s.id)}>
            <Scenery id={s.id} /><span>{s.name}</span>
          </button>
        ))}
      </div>
      <p className="muted small">Também: nome, frase, cor de destaque, widgets da Início e foto própria</p>
    </div>
  );
}
