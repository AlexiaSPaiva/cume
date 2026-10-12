import { useEffect, useState, type FormEvent } from 'react';
import { finishRecovery, hasAccount, resetPassword, signIn, signUp, type Entered } from '../lib/auth';
import { cloudOn, cloudSendReset } from '../lib/cloud';
import { db, openDb } from '../lib/db';
import { syncDb } from '../lib/syncApp';
import { defaultSettings, seedExample } from '../lib/seed';
import type { Settings } from '../lib/types';
import { BrandMark, SceneBg } from '../components/Brand';
import { useAttachmentUrl } from '../lib/attachments';
import { sceneMode } from '../lib/scene';

/** sem nuvem, a conta e os dados ficam no navegador onde foram criados: explica isso quando o e-mail não está aqui */
const NO_ACCOUNT_LOCAL = 'Não há conta com esse e-mail neste navegador. A conta fica guardada só no aparelho e no navegador onde foi criada: '
  + 'no iPhone, o app instalado na Tela de Início e o Safari são lugares separados. Entre por onde você criou a conta.';
/** com nuvem: a conta pode ser de antes da nuvem e ainda estar só no aparelho onde foi criada */
const NO_ACCOUNT_CLOUD = 'Não encontramos uma conta com esse e-mail e essa senha. Se você criou a sua antes de o Cume° guardar os dados na nuvem, '
  + 'entre uma vez pelo lugar onde ela foi criada (por exemplo, o app na Tela de Início): seus dados sobem e, depois disso, você entra em qualquer aparelho.';
const NO_ACCOUNT = () => (cloudOn() ? NO_ACCOUNT_CLOUD : NO_ACCOUNT_LOCAL);
export const AVISO_KEY = 'cume.aviso';

/** aparelho novo: baixa os dados da nuvem antes de abrir o app (sem nada lá, começa com as configurações padrão) */
async function prepare(s: Entered, email: string, name?: string, fullName?: string) {
  const target = s.reload ? openDb(s.dbName) : db;
  try {
    if (s.cloudId) await syncDb(target, s.dbName, s.cloudId).catch((e) => console.error('[cume] primeira sincronização', e));
    if (!(await target.settings.get('me'))) {
      const nick = name?.trim() || email.split('@')[0] || 'Você';
      await target.settings.put(defaultSettings(nick, fullName?.trim() || nick));
    }
    if (withExamples()) await seedExample(target);
  } finally { if (s.reload) target.close(); }
  try { if (s.warn) sessionStorage.setItem(AVISO_KEY, s.warn); } catch { /* modo privado */ }
}

/** dados de exemplo só para testes e demonstração: /?exemplos=1 (o app de verdade começa vazio) */
const withExamples = () => new URLSearchParams(location.search).get('exemplos') === '1';

/**
 * Tela de entrada: "Entrar" em cima (para quem já tem conta) e, logo abaixo, "Criar conta".
 * Cada conta tem os próprios dados neste aparelho.
 */
export function Login({ settings, onIn, recovery }: { settings?: Settings; onIn: () => void; recovery?: boolean }) {
  const [hasAny, setHasAny] = useState<boolean | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [reset, setReset] = useState(false);
  const [newPw, setNewPw] = useState(!!recovery);
  const photo = useAttachmentUrl(settings?.photoAttachmentId);

  useEffect(() => {
    // com nuvem, quem já tem conta pode estar num aparelho novo: o cadastro só abre sozinho sem nuvem
    hasAccount().then((h) => { setHasAny(h); setSignupOpen(!h && !cloudOn()); });
  }, []);

  /** depois de entrar: se a conta usa outro banco, recarrega para abrir o banco dela */
  // e sempre abre na Início (não na tela onde a outra pessoa saiu)
  const done = (s: Entered) => {
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
          {hasAny !== null && (newPw
            ? <NewPasswordForm onDone={done} onBack={() => setNewPw(false)} />
            : reset
            ? <ResetForm onBack={() => setReset(false)} onDone={done} />
            : <LoginForm onDone={done} onForgot={() => setReset(true)} empty={!hasAny} />)}
        </div>

        {hasAny !== null && <div className="box signup">
          {!signupOpen ? (
            <div className="signup-cta">
              <div><b>Primeira vez no Cume°?</b><span className="muted small">{cloudOn() ? 'Crie sua conta: ela vale em qualquer aparelho.' : 'Crie sua conta neste aparelho.'}</span></div>
              <button type="button" className="btn out" onClick={() => setSignupOpen(true)}>Criar conta</button>
            </div>
          ) : (
            <SignupForm onDone={done} />
          )}
        </div>}
        <p className="motto">Foco · Clareza · Ação</p>
        {/* para conferir se o app já está na versão nova (com nuvem) */}
        <p className="faint small login-version">versão {__APP_VERSION__}{cloudOn() ? ' · nuvem' : ''}</p>
      </div>
    </div>
  );
}

function LoginForm({ onDone, onForgot, empty }: { onDone: (s: Entered) => void; onForgot: () => void; empty?: boolean }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy('Entrando…');
    try {
      const s = await signIn(email, pw);
      if (s === 'senha') setErr('Esta senha não confere. Confira as letras maiúsculas ou use “Esqueci a senha”.');
      else if (s === 'sem-conta') setErr(NO_ACCOUNT());
      else {
        if (s.fresh) setBusy('Baixando seus dados…');
        await prepare(s, email);
        onDone(s);
      }
    } catch (ex) {
      setErr((ex as Error).message);
    } finally { setBusy(null); }
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Entrar">
      <div>
        <h1>Entrar</h1>
        <p className="lead">Já tem conta? Bem-vinda de volta.</p>
        {empty && !cloudOn() && <p className="hint login-hint">Este navegador ainda não tem nenhuma conta. Se você criou a sua no app instalado na Tela de Início ou em outro aparelho, entre por lá: cada lugar guarda os próprios dados.</p>}
        {empty && cloudOn() && <p className="hint login-hint">Já tem conta? Entre com o mesmo e-mail e senha: seus dados vêm da nuvem para este aparelho.</p>}
      </div>
      <label className="field"><span>E-mail</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></label>
      <label className="field"><span>Senha</span><input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" /></label>
      <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-end' }} onClick={onForgot}>Esqueci a senha</button>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn gold big" disabled={!!busy}>{busy ?? 'Entrar'}</button>
    </form>
  );
}

/** com nuvem: manda um e-mail com o link para criar a senha nova */
function ResetForm({ onBack, onDone }: { onBack: () => void; onDone: (s: Entered) => void }) {
  return cloudOn() ? <ResetByEmail onBack={onBack} /> : <ResetLocal onBack={onBack} onDone={onDone} />;
}

function ResetByEmail({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await cloudSendReset(email.trim().toLowerCase());
      if (r.ok) setSent(true);
      else setErr(/rate|seconds/i.test(r.message ?? '') ? 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.' : `Não foi possível enviar agora. ${r.message ?? ''}`);
    } finally { setBusy(false); }
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Nova senha">
      <div>
        <h1>Nova senha</h1>
        <p className="lead">{sent ? 'Pronto! Abra o e-mail que enviamos e toque no link para criar a senha nova.' : 'Enviamos um link para o seu e-mail. Seus dados continuam guardados.'}</p>
      </div>
      {!sent && <label className="field"><span>E-mail da conta</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
      {err && <div className="err" role="alert">{err}</div>}
      {!sent && <button className="btn gold big" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link'}</button>}
      <button type="button" className="btn ghost sm" onClick={onBack}>Voltar</button>
    </form>
  );
}

/** chegou pelo link do e-mail: cria a senha nova (vale na nuvem e neste aparelho) */
function NewPasswordForm({ onDone, onBack }: { onDone: (s: Entered) => void; onBack: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (pw.length < 6) return setErr('Use pelo menos 6 caracteres na senha.');
    if (pw !== pw2) return setErr('As senhas não são iguais.');
    setBusy('Salvando…');
    try {
      const s = await finishRecovery(pw);
      if (s.fresh) setBusy('Baixando seus dados…');
      await prepare(s, '');
      onDone(s);
    } catch (ex) {
      setErr((ex as Error).message);
    } finally { setBusy(null); }
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Criar senha nova">
      <div>
        <h1>Criar senha nova</h1>
        <p className="lead">Escolha a senha nova. Seus dados continuam guardados.</p>
      </div>
      <label className="field"><span>Nova senha</span><input type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <label className="field"><span>Repetir a nova senha</span><input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn gold big" disabled={!!busy}>{busy ?? 'Salvar e entrar'}</button>
      <button type="button" className="btn ghost sm" onClick={onBack}>Voltar</button>
    </form>
  );
}

function ResetLocal({ onBack, onDone }: { onBack: () => void; onDone: (s: Entered) => void }) {
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
      if (s) onDone(s); else setErr(NO_ACCOUNT());
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

function SignupForm({ onDone }: { onDone: (s: Entered) => void }) {
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
      const s = await signUp(email, pw);
      // os dados da conta nova vão para o banco dela
      await prepare(s, email, name, fullName);
      onDone(s);
    } catch (ex) {
      setErr((ex as Error).message);
    } finally { setBusy(false); }
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Criar conta">
      <div>
        <h2 className="signup-title">Criar conta</h2>
        <p className="lead">{cloudOn() ? 'Primeira vez no Cume°? Seus dados ficam neste aparelho e guardados na nuvem.' : 'Primeira vez no Cume°? Seus dados ficam guardados neste aparelho.'}</p>
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
