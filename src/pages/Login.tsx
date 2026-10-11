import { useEffect, useState, type FormEvent } from 'react';
import { createAccount, hasAccount, login, resetPassword, type Signed } from '../lib/auth';
import { db, openDb } from '../lib/db';
import { defaultSettings, seedExample } from '../lib/seed';
import type { Settings } from '../lib/types';
import { BrandMark, SceneBg } from '../components/Brand';
import { useAttachmentUrl } from '../lib/attachments';
import { sceneMode } from '../lib/scene';

/** a conta e os dados ficam no navegador onde foram criados: explica isso quando o e-mail não está aqui */
const NO_ACCOUNT = 'Não há conta com esse e-mail neste navegador. A conta fica guardada só no aparelho e no navegador onde foi criada: '
  + 'no iPhone, o app instalado na Tela de Início e o Safari são lugares separados. Entre por onde você criou a conta.';

/** dados de exemplo só para testes e demonstração: /?exemplos=1 (o app de verdade começa vazio) */
const withExamples = () => new URLSearchParams(location.search).get('exemplos') === '1';

/**
 * Tela de entrada: "Entrar" em cima (para quem já tem conta) e, logo abaixo, "Criar conta".
 * Cada conta tem os próprios dados neste aparelho.
 */
export function Login({ settings, onIn }: { settings?: Settings; onIn: () => void }) {
  const [hasAny, setHasAny] = useState<boolean | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [reset, setReset] = useState(false);
  const photo = useAttachmentUrl(settings?.photoAttachmentId);

  useEffect(() => {
    hasAccount().then((h) => { setHasAny(h); setSignupOpen(!h); });
  }, []);

  /** depois de entrar: se a conta usa outro banco, recarrega para abrir o banco dela */
  // e sempre abre na Início (não na tela onde a outra pessoa saiu)
  const done = (s: Signed) => {
    if (s.reload) return location.assign('/');
    history.replaceState(null, '', '/');
    onIn();
  };

  return (
    <div className="login">
      <SceneBg kind="login" mode={sceneMode(settings)} photo={photo} />
      <div className="login-col">
        <div className="box">
          <BrandMark subtitle />
          {hasAny !== null && (reset
            ? <ResetForm onBack={() => setReset(false)} onDone={done} />
            : <LoginForm onDone={done} onForgot={() => setReset(true)} empty={!hasAny} />)}
        </div>

        {hasAny !== null && <div className="box signup">
          {!signupOpen ? (
            <div className="signup-cta">
              <div><b>Primeira vez no Cume°?</b><span className="muted small">Crie sua conta neste aparelho.</span></div>
              <button type="button" className="btn out" onClick={() => setSignupOpen(true)}>Criar conta</button>
            </div>
          ) : (
            <SignupForm onDone={done} />
          )}
        </div>}
        <p className="motto">Foco · Clareza · Ação</p>
      </div>
    </div>
  );
}

function LoginForm({ onDone, onForgot, empty }: { onDone: (s: Signed) => void; onForgot: () => void; empty?: boolean }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const s = await login(email, pw);
      if (s === 'senha') setErr('Esta senha não confere. Confira as letras maiúsculas ou use “Esqueci a senha”.');
      else if (s === 'sem-conta') setErr(NO_ACCOUNT);
      else onDone(s);
    } finally { setBusy(false); }
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Entrar">
      <div>
        <h1>Entrar</h1>
        <p className="lead">Já tem conta? Bem-vinda de volta.</p>
        {empty && <p className="hint login-hint">Este navegador ainda não tem nenhuma conta. Se você criou a sua no app instalado na Tela de Início ou em outro aparelho, entre por lá: cada lugar guarda os próprios dados.</p>}
      </div>
      <label className="field"><span>E-mail</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></label>
      <label className="field"><span>Senha</span><input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" /></label>
      <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-end' }} onClick={onForgot}>Esqueci a senha</button>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn gold big" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}

function ResetForm({ onBack, onDone }: { onBack: () => void; onDone: (s: Signed) => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (pw.length < 6) return setErr('Use pelo menos 6 caracteres na senha.');
    if (pw !== pw2) return setErr('As senhas não são iguais.');
    setBusy(true);
    try {
      const s = await resetPassword(email, pw);
      if (s) onDone(s); else setErr(NO_ACCOUNT);
    } finally { setBusy(false); }
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Nova senha">
      <div>
        <h1>Nova senha</h1>
        <p className="lead">Seus dados continuam aqui, só a senha muda.</p>
      </div>
      <label className="field"><span>E-mail da conta</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field"><span>Nova senha</span><input type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <label className="field"><span>Repetir a nova senha</span><input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn gold big" disabled={busy}>Salvar nova senha</button>
      <button type="button" className="btn ghost sm" onClick={onBack}>Voltar</button>
    </form>
  );
}

function SignupForm({ onDone }: { onDone: (s: Signed) => void }) {
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('Como você quer ser chamada?');
    if (pw.length < 6) return setErr('Use pelo menos 6 caracteres na senha.');
    if (pw !== pw2) return setErr('As senhas não são iguais.');
    setBusy(true);
    try {
      const s = await createAccount(email, pw);
      // os dados da conta nova vão para o banco dela
      const target = s.reload ? openDb(s.dbName) : db;
      if (!(await target.settings.get('me'))) await target.settings.put(defaultSettings(name.trim(), fullName.trim() || name.trim()));
      if (withExamples()) await seedExample(target);
      if (s.reload) target.close();
      onDone(s);
    } catch (ex) {
      setErr((ex as Error).message);
    } finally { setBusy(false); }
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Criar conta">
      <div>
        <h2 className="signup-title">Criar conta</h2>
        <p className="lead">Primeira vez no Cume°? Seus dados ficam guardados neste aparelho.</p>
      </div>
      <div className="cols">
        <label className="field"><span>Como quer ser chamada</span><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Alexia" /></label>
        <label className="field"><span>Nome completo</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alexia Silva Paiva" /></label>
      </div>
      <label className="field"><span>Seu e-mail</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></label>
      <div className="cols">
        <label className="field"><span>Crie uma senha</span><input type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label className="field"><span>Confirmar senha</span><input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn gold big" disabled={busy}>{busy ? 'Criando…' : 'Criar e entrar'}</button>
    </form>
  );
}
