import { useState, type CSSProperties, type ReactNode } from 'react';
import { db } from '../lib/db';
import { DegreeTarget } from './Brand';
import { TourVideo } from './TourVideo';
import { Icon, Modal } from './ui';

const STEPS: { icon: string; title: string; text: ReactNode }[] = [
  {
    icon: 'target', title: 'Escolha o seu cume',
    text: <>Em <b>Objetivos e Metas</b>, diga aonde você quer chegar e quebre cada objetivo em metas que dá para medir. É o topo da sua montanha.</>,
  },
  {
    icon: 'plan', title: 'Planeje a subida da semana',
    text: <>No <b>Planejamento</b>, distribua as horas entre as áreas da vida e escolha o seu Top 3. A <b>Início</b> mostra se o seu foco está onde você quer.</>,
  },
  {
    icon: 'tasks', title: 'Dê o próximo passo hoje',
    text: <>Em <b>Tarefas</b> e na <b>Agenda</b>, organize o que precisa de você agora. O <b>⋯</b> de cada item edita, adia, duplica ou exclui. Excluiu sem querer? Toque em <b>Desfazer</b>.</>,
  },
  {
    icon: 'zap', title: 'Registre os imprevistos',
    text: <>Use <b>+ Imprevisto</b> no topo (ou o <b>+</b> no celular). Quando um imprevisto se repete, o Cume° sugere reservar tempo para ele.</>,
  },
  {
    icon: 'history', title: 'Acompanhe a sua evolução',
    text: <>O <b>Histórico</b> compara você com você mesma, por dia, semana, mês e ano. O <b>⛶</b> abre qualquer card em tela cheia, para focar.</>,
  },
];

/**
 * Boas-vindas: o que é o Cume° e como usar. Aparece ao abrir o app até a pessoa marcar
 * "Não mostrar de novo". Fechar sem marcar esconde só até a próxima vez que o app abrir.
 */
export function Welcome({ name, onClose }: { name: string; onClose: () => void }) {
  const [step, setStep] = useState(-1);
  const [never, setNever] = useState(false);

  const close = async () => {
    if (never) await db.settings.update('me', { welcomeDismissed: true });
    onClose();
  };
  const last = step === STEPS.length - 1;

  return (
    <Modal title="Boas-vindas ao Cume°" onClose={() => void close()} wide>
      <div className="welcome">
        {step < 0 ? (
          <div className="welcome-intro">
            <span className="welcome-mark" aria-hidden="true"><DegreeTarget /></span>
            <p className="welcome-lead">Olá, {name}!</p>
            <p>
              O Cume° organiza a sua vida inteira num lugar só: estudos, trabalho, saúde, dinheiro e burocracias.
              O nome vem de <b>cume</b>, o topo da montanha: o <b>topo da sua vida</b> é cada objetivo que você alcança.
            </p>
            <p>Tudo no app gira em torno de três palavras:</p>
            <ul className="welcome-ladder">
              <li style={{ '--c': '#e9cf9f' } as CSSProperties}>
                <b>Objetivo</b><span>aonde você quer chegar.</span><small>Ex.: passar no concurso.</small>
              </li>
              <li style={{ '--c': '#7da0c9' } as CSSProperties}>
                <b>Meta</b><span>um trecho que dá para medir, com número e prazo.</span><small>Ex.: estudar 200 h até março.</small>
              </li>
              <li style={{ '--c': '#7fb8a0' } as CSSProperties}>
                <b>Tarefa</b><span>o que fazer hoje.</span><small>Ex.: 20 questões às 19h.</small>
              </li>
            </ul>
            <p>Cada <b>tarefa</b> feita faz a <b>meta</b> andar, e as metas levam você ao <b>objetivo</b>.</p>
            <p className="muted small">Seus dados ficam guardados na nuvem: entre com o mesmo e-mail e senha em qualquer aparelho.</p>

            <h3 className="welcome-video-h">Assista ao tour do app</h3>
            <TourVideo />
          </div>
        ) : (
          <div className="welcome-step" aria-live="polite">
            <span className="welcome-num">Passo {step + 1} de {STEPS.length}</span>
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <span className="welcome-ic" aria-hidden="true"><Icon name={STEPS[step].icon} size={22} /></span>
              <div>
                <h3>{STEPS[step].title}</h3>
                <p>{STEPS[step].text}</p>
              </div>
            </div>
          </div>
        )}

        <div className="welcome-dots" aria-hidden="true">
          {[-1, ...STEPS.map((_, i) => i)].map((i) => <i key={i} className={i === step ? 'on' : ''} />)}
        </div>

        <div className="welcome-foot">
          <label className="check"><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Não mostrar de novo</label>
          <div className="actions">
            {step >= 0 && <button type="button" className="btn out" onClick={() => setStep(step - 1)}>Voltar</button>}
            {step < 0 && <button type="button" className="btn gold" onClick={() => setStep(0)}>Como usar o app</button>}
            {step >= 0 && !last && <button type="button" className="btn gold" onClick={() => setStep(step + 1)}>Próximo</button>}
            {(last || step < 0) && <button type="button" className={`btn ${last ? 'gold' : 'out'}`} onClick={() => void close()}>{last ? 'Começar a subida' : 'Pular'}</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** a pessoa fechou nesta sessão (sem marcar "Não mostrar de novo"): só volta quando o app abrir de novo */
export const WELCOME_SESSION_KEY = 'cume.boasvindas.fechada';
