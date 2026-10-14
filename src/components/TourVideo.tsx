import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DegreeTarget } from './Brand';
import { Icon } from './ui';
import { Tune } from '../lib/tune';

/**
 * Vídeo de boas-vindas: um tour animado de ~3 min pelas telas do Cume° e pela diferença entre
 * objetivo, meta e tarefa. É desenhado aqui mesmo (HTML + animação CSS + musiquinha em Web Audio):
 * pesa quase nada, funciona offline e se mantém fiel ao app quando ele muda.
 *
 * Cada cena tem duração, legendas com o segundo em que entram e um desenho que recebe o tempo da cena.
 * As entradas usam animação CSS com atraso (--d); pausar congela tudo (animation-play-state).
 * Legendas usam *asteriscos* para negrito, e o mesmo texto vira o roteiro em texto, embaixo do vídeo.
 */

type Line = [at: number, text: string];
interface Scene { chapter: string; dur: number; lines: Line[]; v: (t: number) => ReactNode }

/** elemento que entra com atraso: kind = up (sobe e aparece), fade, pop (check), fill (barra enchendo) */
function A({ d = 0, k = 'up', className = '', style, children }: { d?: number; k?: 'up' | 'fade' | 'pop' | 'fill' | 'left'; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return <div className={`tv-a tv-${k} ${className}`} style={{ ...style, animationDelay: `${d}s` }}>{children}</div>;
}

const C = { obj: '#e9cf9f', meta: '#7da0c9', task: '#7fb8a0', imp: '#d9945a' };
const AREAS: [string, string][] = [
  ['Acadêmica', '#8f8cc4'], ['Profissional', '#7da0c9'], ['Saúde', '#7fb8a0'],
  ['Pessoal', '#d197ae'], ['Financeiro', '#c8ac68'], ['Adultices', '#d29d72'],
];

function Ic({ name, color }: { name: string; color?: string }) {
  return <span className="tv-ic" style={color ? { color } : undefined}><Icon name={name} /></span>;
}

function Cloud() {
  return (
    <span className="tv-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18Z" />
    </svg></span>
  );
}

/** a montanha com os três marcos: tarefa (base), meta (meio) e objetivo (topo) */
function Peak({ lit, delays = [0, 0, 0] }: { lit: ('obj' | 'meta' | 'task')[]; delays?: number[] }) {
  const mark = (k: 'obj' | 'meta' | 'task', x: number, y: number, d: number) => {
    const on = lit.includes(k);
    return (
      <g key={k}>
        <circle cx={x} cy={y} r="3" fill="#33406e" />
        {on && (
          <g className="tv-svgin" style={{ animationDelay: `${d}s` }}>
            <circle cx={x} cy={y} r="6.5" fill={C[k]} className="tv-ring" style={{ animationDelay: `${d}s` }} />
            <circle cx={x} cy={y} r="3.2" fill={C[k]} />
          </g>
        )}
      </g>
    );
  };
  return (
    <svg className="tv-peak" viewBox="0 0 100 72" aria-hidden="true">
      <defs>
        <linearGradient id="tv-mt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#26305a" />
          <stop offset="1" stopColor="#121a38" />
        </linearGradient>
      </defs>
      <polygon points="2,70 50,8 98,70" fill="url(#tv-mt)" stroke="#33406e" strokeWidth=".8" />
      <polygon points="50,8 41,20 46,18 50,22 55,18 59,20" fill="#e8e6f1" opacity=".85" />
      <path d="M30 64 L62 52 L44 38 L56 24 L50 11" fill="none" stroke="#c8a97e" strokeWidth="1" strokeDasharray="2 2.4" opacity=".7" />
      <path d="M50 8 V-2 L60 1 L50 4" fill={lit.includes('obj') ? C.obj : '#6a7398'} stroke="none" />
      {mark('task', 30, 64, delays[2])}
      {mark('meta', 44, 38, delays[1])}
      {mark('obj', 50, 11, delays[0])}
    </svg>
  );
}

function Bar({ w, color, d = 0, base }: { w: number; color: string; d?: number; base?: number }) {
  return (
    <div className="tv-bar">
      {base != null && <div className="tv-bar-base" style={{ width: `${base}%`, background: color }} />}
      <div className="tv-bar-clip" style={{ left: `${base ?? 0}%`, width: `${w - (base ?? 0)}%` }}>
        <A k="fill" d={d} style={{ background: color }} />
      </div>
    </div>
  );
}

function Check({ d, color = C.task, done = true }: { d: number; color?: string; done?: boolean }) {
  return (
    <span className="tv-box">
      {done && <A k="pop" d={d} className="tv-tick" style={{ background: color }}><Icon name="check" /></A>}
    </span>
  );
}

const between = (t: number, a: number, b = Infinity) => t >= a && t < b;

export const SCENES: Scene[] = [
  {
    chapter: 'Abertura', dur: 6,
    lines: [[0, 'Em *3 minutos*, você conhece cada parte do Cume°.'], [3, 'Dá para *pausar* e *pular de capítulo* na barra de baixo.']],
    v: () => (
      <div className="tv-col tv-center">
        <A d={0.2} className="tv-logo"><span>Cume</span><DegreeTarget /></A>
        <A d={0.9} className="tv-tag">Foco · Clareza · Ação</A>
        <A d={1.6} className="tv-chip gold">Tour do app</A>
      </div>
    ),
  },
  {
    chapter: 'Objetivo, meta e tarefa', dur: 8,
    lines: [[0, 'Primeiro, as três palavras mais importantes do app: *objetivo*, *meta* e *tarefa*.'], [4, 'Pense numa montanha: o *topo*, os *trechos* da subida e cada *passo*.']],
    v: () => (
      <div className="tv-row">
        <A d={0.1} className="tv-peak-wrap"><Peak lit={['obj', 'meta', 'task']} delays={[0.8, 1.8, 2.8]} /></A>
        <div className="tv-col tv-words">
          <A d={0.8} className="tv-word"><i style={{ background: C.obj }} />Objetivo<small>o topo</small></A>
          <A d={1.8} className="tv-word"><i style={{ background: C.meta }} />Meta<small>os trechos</small></A>
          <A d={2.8} className="tv-word"><i style={{ background: C.task }} />Tarefa<small>cada passo</small></A>
        </div>
      </div>
    ),
  },
  {
    chapter: 'Objetivo', dur: 9,
    lines: [[0, '*Objetivo* é o topo da montanha: *aonde você quer chegar*.'], [4.5, 'É grande e mostra o porquê. Por exemplo: *passar no concurso*.']],
    v: () => (
      <div className="tv-row">
        <A d={0.1} className="tv-peak-wrap"><Peak lit={['obj']} delays={[0.3]} /></A>
        <A d={0.6} className="tv-card tv-wcard" style={{ borderColor: C.obj }}>
          <span className="tv-kicker" style={{ color: C.obj }}>Objetivo</span>
          <A d={4.5} k="fade" className="tv-h">Passar no concurso</A>
          <A d={5.3} k="fade" className="tv-meta"><span className="tv-chip"><i style={{ background: '#8f8cc4' }} />Acadêmica</span></A>
          <A d={6.2} k="fade" className="tv-note">aonde quero chegar · sem número</A>
        </A>
      </div>
    ),
  },
  {
    chapter: 'Meta', dur: 10,
    lines: [[0, '*Meta* é um trecho da subida que dá para medir: tem *número* e *prazo*.'], [5, 'Um objetivo pode ter *várias metas*. A barra mostra *quanto já foi*.']],
    v: () => (
      <div className="tv-row">
        <A d={0.1} className="tv-peak-wrap"><Peak lit={['meta']} delays={[0, 0.3, 0]} /></A>
        <A d={0.6} className="tv-card tv-wcard" style={{ borderColor: C.meta }}>
          <span className="tv-kicker" style={{ color: C.meta }}>Metas</span>
          <div className="tv-goal">
            <div className="tv-line"><b>Estudar 200 h</b><span>até 30/03</span></div>
            <Bar w={45} color={C.meta} d={1.6} />
            <A d={2.6} k="fade" className="tv-note">90 de 200 h · 45%</A>
          </div>
          <A d={5} className="tv-goal">
            <div className="tv-line"><b>Resolver 1.000 questões</b><span>até 30/04</span></div>
            <Bar w={30} color={C.meta} d={5.6} />
            <A d={6.6} k="fade" className="tv-note">300 de 1.000 · 30%</A>
          </A>
        </A>
      </div>
    ),
  },
  {
    chapter: 'Tarefa', dur: 10,
    lines: [[0, '*Tarefa* é o passo de hoje: uma ação pequena e concreta, com *dia e hora*.'], [5, 'Fez? *Marque como feita*. É assim que a subida acontece.']],
    v: () => (
      <div className="tv-row">
        <A d={0.1} className="tv-peak-wrap"><Peak lit={['task']} delays={[0, 0, 0.3]} /></A>
        <A d={0.6} className="tv-card tv-wcard" style={{ borderColor: C.task }}>
          <span className="tv-kicker" style={{ color: C.task }}>Tarefas</span>
          {([['20 questões de português', 'hoje · 19h', 5.4], ['Revisar crase', 'hoje · 20h', 6.6], ['Simulado', 'sábado · 9h', -1]] as const).map(([title, when, d], i) => (
            <A key={title} d={1.2 + i * 0.7} className="tv-task">
              <Check d={d} done={d >= 0} />
              <span className="grow"><b>{title}</b></span>
              <span className="tv-when">{when}</span>
            </A>
          ))}
        </A>
      </div>
    ),
  },
  {
    chapter: 'Como tudo se liga', dur: 14,
    lines: [
      [0, 'Tudo se conecta: cada *tarefa feita* faz a *meta* andar…'],
      [4, '…e as metas fazem o *objetivo* subir.'],
      [7.5, 'Resumindo: *objetivo* é aonde, *meta* é quanto e até quando, *tarefa* é o que fazer agora.'],
    ],
    v: () => (
      <div className="tv-col tv-center">
        <div className="tv-row tv-flow">
          <A d={0.3} className="tv-card tv-step">
            <span className="tv-kicker" style={{ color: C.task }}>Tarefas</span>
            <div className="tv-checks"><Check d={1} /><Check d={1.6} /><Check d={2.2} /></div>
          </A>
          <A d={0.3} k="fade" className="tv-arrow">→</A>
          <A d={0.5} className="tv-card tv-step">
            <span className="tv-kicker" style={{ color: C.meta }}>Meta</span>
            <Bar w={70} base={30} color={C.meta} d={2.6} />
          </A>
          <A d={0.5} k="fade" className="tv-arrow">→</A>
          <A d={0.7} className="tv-card tv-step">
            <span className="tv-kicker" style={{ color: C.obj }}>Objetivo</span>
            <svg className="tv-donut" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="15.915" fill="none" stroke="#26305a" strokeWidth="5" />
              <circle cx="20" cy="20" r="15.915" fill="none" stroke={C.obj} strokeWidth="5" strokeDasharray="100 100" className="tv-donut-fill" style={{ animationDelay: '4s' }} transform="rotate(-90 20 20)" />
            </svg>
          </A>
        </div>
        <A d={7.5} className="tv-sum">
          <span><i style={{ background: C.obj }} /><b>Objetivo</b> = aonde quero chegar</span>
          <span><i style={{ background: C.meta }} /><b>Meta</b> = quanto e até quando</span>
          <span><i style={{ background: C.task }} /><b>Tarefa</b> = o que faço agora</span>
        </A>
      </div>
    ),
  },
  {
    chapter: 'Início', dur: 12,
    lines: [
      [0, 'A tela *Início* é o seu painel do dia.'],
      [2.5, 'Nela estão o *Top 3 de hoje* (as três coisas mais importantes) e os *próximos prazos*…'],
      [7, '…os *imprevistos da semana* e *quanto tempo* cada área da vida está recebendo.'],
    ],
    v: () => (
      <div className="tv-col tv-center">
        <A d={0} className="tv-screen"><Ic name="home" /> Início</A>
        <div className="tv-grid2">
          <A d={2.5} className="tv-card">
            <span className="tv-kicker">Top 3 de hoje</span>
            {['Entregar relatório', 'Academia', '20 questões'].map((x, i) => <div key={x} className="tv-mini"><b className="tv-num">{i + 1}</b>{x}</div>)}
          </A>
          <A d={4.5} className="tv-card">
            <span className="tv-kicker">Próximos prazos</span>
            <div className="tv-mini"><b>14/10</b> Prova de inglês</div>
            <div className="tv-mini"><b>20/10</b> Aluguel</div>
          </A>
          <A d={7} className="tv-card">
            <span className="tv-kicker" style={{ color: C.imp }}>Imprevistos da semana</span>
            <div className="tv-mini"><b style={{ color: C.imp }}>2</b> · 1h30 fora do plano</div>
          </A>
          <A d={8.5} className="tv-card">
            <span className="tv-kicker">Tempo por área</span>
            {AREAS.slice(0, 3).map(([n, c], i) => <div key={n} className="tv-hbar"><Bar w={[70, 45, 25][i]} color={c} d={9 + i * 0.3} /></div>)}
          </A>
        </div>
      </div>
    ),
  },
  {
    chapter: 'Semana, Agenda e Calendário', dur: 16,
    lines: [
      [0, 'Três jeitos de ver o seu tempo.'],
      [1.5, '*Minha semana*: a lista de cada dia, com horário.'],
      [5.5, '*Agenda*: a semana em blocos. Cheio é *plano*, tracejado é *descanso* e laranja é *imprevisto*.'],
      [11, '*Calendário*: o mês inteiro, com *prazos, eventos e contas*. Dá para conectar o *Google Agenda*.'],
    ],
    v: (t) => (
      <div className="tv-row tv-three">
        <A d={1.5} className={`tv-card tv-third ${between(t, 1.5, 5.5) ? 'tv-hl' : ''}`}>
          <span className="tv-kicker"><Ic name="week" /> Minha semana</span>
          {[['Seg', '9h', 'Aula'], ['Ter', '18h', 'Treino'], ['Qua', '19h', 'Estudo']].map(([d, h, x]) => (
            <div key={d} className="tv-mini"><b>{d}</b> {h} · {x}</div>
          ))}
        </A>
        <A d={5.5} className={`tv-card tv-third ${between(t, 5.5, 11) ? 'tv-hl' : ''}`}>
          <span className="tv-kicker"><Ic name="agenda" /> Agenda</span>
          <div className="tv-blocks">
            <div><i className="b" style={{ top: '5%', height: '40%', background: '#8f8cc4' }} /><i className="b rest" style={{ top: '55%', height: '30%' }} /></div>
            <div><i className="b" style={{ top: '15%', height: '30%', background: '#7da0c9' }} /><A d={8.5} k="fade" className="b imp" style={{ top: '52%', height: '25%' }} /></div>
            <div><i className="b" style={{ top: '30%', height: '45%', background: '#7fb8a0' }} /></div>
          </div>
        </A>
        <A d={11} className={`tv-card tv-third ${t >= 11 ? 'tv-hl' : ''}`}>
          <span className="tv-kicker"><Ic name="calendar" /> Calendário</span>
          <div className="tv-month">
            {Array.from({ length: 28 }, (_, i) => (
              <i key={i} className={[3, 9, 14, 20, 25].includes(i) ? 'dot' : ''} style={i === 14 ? { background: C.imp } : i === 20 ? { background: '#c8ac68' } : undefined} />
            ))}
          </div>
        </A>
      </div>
    ),
  },
  {
    chapter: 'Tarefas', dur: 16,
    lines: [
      [0, 'Em *Tarefas*, o *Quadro* separa o que é de hoje, o que está em andamento e o que já foi concluído.'],
      [5, 'A *Lista* mostra tudo junto. *Adiadas* guarda o que ficou para trás, para você realocar sem recriar.'],
      [10.5, 'A *Lixeira* guarda o que foi excluído por 30 dias. E o *⋯* de cada tarefa edita, adia, duplica ou exclui.'],
    ],
    v: (t) => {
      const tab = t < 5 ? 0 : t < 7.5 ? 1 : t < 10.5 ? 2 : 3;
      return (
        <div className="tv-col tv-center tv-wide">
          <div className="tv-tabs">
            {['Quadro', 'Lista', 'Adiadas', 'Lixeira'].map((x, i) => <span key={x} className={i === tab ? 'on' : ''}>{x}</span>)}
          </div>
          <div className="tv-tabbody" key={tab}>
            {tab === 0 && (
              <div className="tv-row tv-board">
                {([['Hoje', '#d9776b', ['Academia']], ['Em andamento', '#7ea3cc', ['Relatório']], ['Concluído', '#7fb8a0', ['20 questões']]] as const).map(([n, c, items], i) => (
                  <A key={n} d={0.3 + i * 0.4} className="tv-colk">
                    <span className="tv-kicker" style={{ color: c }}>{n}</span>
                    {items.map((x) => <div key={x} className="tv-card tv-tcard">{x}</div>)}
                    {i === 2 && <A d={3} className="tv-card tv-tcard">Revisar crase</A>}
                  </A>
                ))}
              </div>
            )}
            {tab === 1 && (
              <A className="tv-card tv-list">
                {['Academia · hoje', 'Relatório · em andamento', 'Ligar para o banco · aguardando', '20 questões · concluída'].map((x) => <div key={x} className="tv-mini">{x}</div>)}
              </A>
            )}
            {tab === 2 && (
              <A className="tv-card tv-list">
                <div className="tv-task"><span className="grow"><b>Revisar crase</b> <span className="tv-note">adiada 2x</span></span><span className="tv-btn gold">Realocar</span></div>
                <div className="tv-task"><span className="grow"><b>Arrumar o armário</b> <span className="tv-note">adiada 1x</span></span><span className="tv-btn gold">Realocar</span></div>
              </A>
            )}
            {tab === 3 && (
              <div className="tv-row tv-trash">
                <A className="tv-card tv-list">
                  <div className="tv-task"><span className="grow"><b>Curso antigo</b> <span className="tv-note">excluída há 2 dias</span></span><span className="tv-btn">Restaurar</span></div>
                </A>
                {t >= 12.5 && (
                  <A className="tv-card tv-menu">
                    <span className="tv-kicker">⋯ da tarefa</span>
                    {['Editar', 'Adiar', 'Duplicar', 'Excluir'].map((x) => <div key={x} className="tv-mini">{x}</div>)}
                  </A>
                )}
              </div>
            )}
          </div>
        </div>
      );
    },
  },
  {
    chapter: 'Planejamento', dur: 14,
    lines: [
      [0, 'No *Planejamento* você prepara a semana que vem.'],
      [3, 'Primeiro, distribui as *horas que realmente tem* entre as áreas da vida.'],
      [8, 'Depois escolhe o *Top 3 da semana* e puxa tarefas do *backlog*, a lista do “um dia eu faço”.'],
    ],
    v: () => (
      <div className="tv-row">
        <A d={0.3} className="tv-card tv-wcard">
          <span className="tv-kicker"><Ic name="plan" /> Horas por área</span>
          {([['Acadêmica', 12], ['Profissional', 20], ['Saúde', 5], ['Pessoal', 6]] as const).map(([n, h], i) => {
            const c = AREAS.find(([x]) => x === n)![1];
            return (
              <div key={n} className="tv-hrow">
                <span>{n}</span>
                <Bar w={(h / 20) * 100} color={c} d={3 + i * 0.6} />
                <b>{h} h</b>
              </div>
            );
          })}
          <A d={6} k="fade" className="tv-note">43 h de 50 h livres</A>
        </A>
        <div className="tv-col tv-side">
          <A d={8} className="tv-card">
            <span className="tv-kicker">Top 3 da semana</span>
            {['Simulado', 'Projeto', 'Consulta'].map((x, i) => <div key={x} className="tv-mini"><b className="tv-num">{i + 1}</b>{x}</div>)}
          </A>
          <A d={10} className="tv-card">
            <span className="tv-kicker">Backlog</span>
            <div className="tv-mini"><span className="grow">Óculos novos</span><span className="tv-btn gold">+</span></div>
          </A>
        </div>
      </div>
    ),
  },
  {
    chapter: 'Imprevistos', dur: 14,
    lines: [
      [0, 'Saiu do plano? Toque em *+ Imprevisto*, no topo (ou no *+* do celular).'],
      [4, 'O Cume° mostra *o que tirou você do plano* e *quanto tempo custou*.'],
      [8, 'Se um imprevisto *se repete*, ele sugere *reservar um tempo* para isso no planejamento.'],
    ],
    v: (t) => (
      <div className="tv-col tv-center tv-wide">
        <A d={0.2} className={`tv-btn imp big ${t < 4 ? 'tv-pulse' : ''}`}><Ic name="zap" /> + Imprevisto</A>
        <div className="tv-card tv-list">
          {([['Ônibus atrasou', '40 min', 4], ['Visita surpresa', '1h', 5], ['Ônibus atrasou', '35 min', 6]] as const).map(([x, m, d], i) => (
            <A key={i} d={d} className="tv-task"><i className="tv-dot" style={{ background: C.imp }} /><span className="grow">{x}</span><b>{m}</b></A>
          ))}
        </div>
        <A d={8} className="tv-card tv-sugg">
          <Ic name="repeat" color={C.imp} />
          <span className="grow"><b style={{ color: C.imp }}>Imprevisto recorrente:</b> “Ônibus atrasou” aconteceu 3x em 30 dias. Incluir no planejamento?</span>
          <span className="tv-btn gold">Incluir</span>
        </A>
      </div>
    ),
  },
  {
    chapter: 'Histórico', dur: 10,
    lines: [
      [0, 'O *Histórico* compara você com *você mesma*…'],
      [3.5, '…por *dia, semana, mês e ano*: horas em cada área, o mapa do mês e as suas métricas.'],
    ],
    v: (t) => {
      const p = t < 3.5 ? 2 : Math.min(3, Math.floor((t - 3.5) / 1.4));
      return (
        <div className="tv-col tv-center tv-wide">
          <div className="tv-tabs">{['Dia', 'Semana', 'Mês', 'Ano'].map((x, i) => <span key={x} className={i === p ? 'on' : ''}>{x}</span>)}</div>
          <A d={0.4} className="tv-card tv-chart">
            <span className="tv-kicker"><Ic name="history" /> Tempo por área · este mês × mês passado</span>
            <div className="tv-cols">
              {AREAS.map(([n, c], i) => (
                <div key={n} className="tv-colbar">
                  <div className="tv-vbars">
                    <i className="ref" style={{ height: `${[50, 70, 30, 40, 20, 25][i]}%` }} />
                    <A k="up" d={0.8 + i * 0.25} className="cur" style={{ height: `${[70, 60, 45, 50, 30, 20][i]}%`, background: c }} />
                  </div>
                  <small>{n.slice(0, 4)}</small>
                </div>
              ))}
            </div>
          </A>
        </div>
      );
    },
  },
  {
    chapter: 'Áreas da vida', dur: 16,
    lines: [
      [0, 'No menu, em *Vida*, cada área tem o seu painel: Acadêmica, Profissional, Saúde, Pessoal, Financeiro e Adultices.'],
      [6, 'Na *Acadêmica*, os estudos viram *trilhas*, com cronograma, prazos e arquivos.'],
      [10.5, 'No *Financeiro* ficam a renda extra, as contas e a reserva. Em *Adultices*, o *Cofre* guarda documentos e comprovantes.'],
    ],
    v: () => (
      <div className="tv-col tv-center tv-wide">
        <div className="tv-areas">
          {AREAS.map(([n, c], i) => <A key={n} d={0.4 + i * 0.4} className="tv-chip"><i style={{ background: c }} />{n}</A>)}
        </div>
        <div className="tv-row tv-three">
          <A d={6} className="tv-card tv-third tv-areacard" style={{ borderColor: '#8f8cc4' }}>
            <span className="tv-kicker" style={{ color: '#8f8cc4' }}>Acadêmica</span>
            <div className="tv-mini">Trilhas de estudo</div><div className="tv-mini">Cronograma</div><div className="tv-mini">Prazos e arquivos</div>
          </A>
          <A d={10.5} className="tv-card tv-third tv-areacard" style={{ borderColor: '#c8ac68' }}>
            <span className="tv-kicker" style={{ color: '#c8ac68' }}>Financeiro</span>
            <div className="tv-mini">Renda extra</div><div className="tv-mini">Contas e cartões</div><div className="tv-mini">Reserva</div>
          </A>
          <A d={12.5} className="tv-card tv-third tv-areacard" style={{ borderColor: '#d29d72' }}>
            <span className="tv-kicker" style={{ color: '#d29d72' }}>Adultices</span>
            <div className="tv-mini">Documentos</div><div className="tv-mini">Comprovantes</div><div className="tv-mini">Vencimentos</div>
          </A>
        </div>
      </div>
    ),
  },
  {
    chapter: 'Dicas', dur: 13,
    lines: [
      [0, 'Algumas dicas: o *⛶* abre qualquer card em *tela cheia*, para focar, e a *busca* acha qualquer coisa.'],
      [6.5, 'Em *Personalizar* você muda nome e cenário e faz *backup*. Seus dados ficam na *nuvem*: entre com o mesmo e-mail em qualquer aparelho.'],
    ],
    v: () => (
      <div className="tv-grid2 tv-tips">
        <A d={0.5} className="tv-card tv-tip"><Ic name="expand" color={C.obj} /><span><b>Modo foco</b><small>card ou tela em tela cheia</small></span></A>
        <A d={3} className="tv-card tv-tip"><Ic name="search" color={C.obj} /><span><b>Busca</b><small>tarefas, metas, trilhas, arquivos</small></span></A>
        <A d={6.5} className="tv-card tv-tip"><Ic name="gear" color={C.obj} /><span><b>Personalizar</b><small>nome, cenário, backup, lixeira</small></span></A>
        <A d={9} className="tv-card tv-tip"><span style={{ color: C.obj }}><Cloud /></span><span><b>Nuvem</b><small>mesmo e-mail em qualquer aparelho</small></span></A>
      </div>
    ),
  },
  {
    chapter: 'Boa subida!', dur: 8,
    lines: [[0, 'Comece pelo topo: crie o seu primeiro *objetivo* em *Objetivos e Metas*.'], [4, 'Um passo de cada vez. *Boa subida!*']],
    v: () => (
      <div className="tv-row">
        <A d={0.1} className="tv-peak-wrap"><Peak lit={['task', 'meta', 'obj']} delays={[1.6, 0.9, 0.2]} /></A>
        <div className="tv-col">
          <A d={0.6} className="tv-chip gold"><Ic name="target" /> Objetivos e Metas</A>
          <A d={4} className="tv-logo small"><span>Boa subida!</span></A>
        </div>
      </div>
    ),
  },
];

const STARTS = SCENES.reduce<number[]>((a, _s, i) => [...a, i ? a[i - 1] + SCENES[i - 1].dur : 0], []);
export const TOTAL = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1].dur;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** *negrito* → <b> */
export function rich(s: string) {
  return s.split('*').map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>));
}

export function TourVideo() {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [nonce, setNonce] = useState(0);
  const clock = useRef(0);
  const tune = useRef<Tune | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ h: 0, f: 1, narrow: false });

  // tamanho do palco: 16:9 em telas largas, 4:3 no celular; a letra acompanha a largura
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      // celular: palco mais alto, peças empilhadas e letra maior
      const narrow = w < 520;
      const h = narrow ? w * 1.2 : (w * 9) / 16;
      setBox({ h, f: (narrow ? Math.min(w / 21, h / 25) : Math.min(w / 30, h / 17)) / 16, narrow });
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    window.addEventListener('resize', fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, []);

  // relógio do vídeo
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current = Math.min(TOTAL, clock.current + (now - last) / 1000);
      last = now;
      setT(Math.floor(clock.current * 10) / 10);
      if (clock.current >= TOTAL) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // música acompanha o play/pause; sai de cena junto com a janela
  useEffect(() => {
    if (!tune.current) return;
    if (playing) tune.current.start(); else tune.current.pause();
  }, [playing]);
  useEffect(() => () => tune.current?.stop(), []);
  useEffect(() => { tune.current?.setMuted(muted); }, [muted]);

  // trocou de aba/app: pausa (senão animação e relógio se desencontram)
  useEffect(() => {
    const v = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, []);

  const play = useCallback(() => {
    if (!tune.current) { tune.current = new Tune(); tune.current.setMuted(muted); }
    tune.current.start(); // dentro do toque: o iPhone só libera o som assim
    if (clock.current >= TOTAL) { clock.current = 0; setT(0); setNonce((n) => n + 1); }
    setStarted(true);
    setPlaying(true);
  }, [muted]);

  const seek = (i: number) => {
    clock.current = STARTS[i];
    setT(STARTS[i]);
    setNonce((n) => n + 1);
    if (!started) play();
  };

  let idx = STARTS.findIndex((s, i) => t >= s && (i === SCENES.length - 1 || t < STARTS[i + 1]));
  if (idx < 0) idx = 0;
  const scene = SCENES[idx];
  const lt = t - STARTS[idx];
  const line = [...scene.lines].reverse().find(([at]) => lt >= at) ?? scene.lines[0];
  const ended = started && !playing && t >= TOTAL;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); if (playing) setPlaying(false); else play(); }
    if (e.key === 'ArrowRight' && idx < SCENES.length - 1) seek(idx + 1);
    if (e.key === 'ArrowLeft') seek(lt > 2 || idx === 0 ? idx : idx - 1);
  };

  return (
    <section className="tv" aria-label="Vídeo: tour do Cume°">
      <div className={`tv-player ${playing ? '' : 'paused'}`} tabIndex={0} onKeyDown={onKey}>
        <div className={`tv-stage ${box.narrow ? 'narrow' : ''}`} ref={stage} style={{ height: box.h || undefined, fontSize: `${box.f}rem` }} aria-hidden="true"
          onClick={() => (started ? (playing ? setPlaying(false) : play()) : undefined)}>
          <svg className="tv-bg" viewBox="0 0 300 100" preserveAspectRatio="xMidYMax slice">
            <polygon points="0,100 60,55 110,85 170,40 230,80 300,50 300,100" fill="#121a38" />
            <polygon points="0,100 40,80 90,92 150,70 210,95 260,78 300,90 300,100" fill="#0e1430" />
          </svg>
          <i className="tv-climb" style={{ left: `${4 + (t / TOTAL) * 90}%` }} />
          {started ? <div className="tv-scene" key={`${idx}-${nonce}`}>{scene.v(lt)}</div> : (
            <div className="tv-scene tv-poster">
              <div className="tv-col tv-center">
                <div className="tv-logo small"><span>Cume</span><DegreeTarget /></div>
                <div className="tv-tag">Tour do app</div>
                <span className="tv-big-ic"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
                <div className="tv-poster-list">Objetivo, meta e tarefa · cada tela explicada</div>
              </div>
            </div>
          )}
        </div>

        <p className="tv-cap" aria-live="off"><span>{started ? rich(line[1]) : <>Tour do Cume° · {mmss(TOTAL)} · com música</>}</span></p>

        {(!started || ended) && (
          <button type="button" className={`tv-big ${ended ? '' : 'ghost'}`} onClick={play} aria-label={ended ? 'Assistir de novo' : 'Assistir ao vídeo'}>
            <span className="tv-big-ic"><svg viewBox="0 0 24 24" aria-hidden="true">{ended ? <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> : <path d="M8 5v14l11-7z" fill="currentColor" />}</svg></span>
            <span>{ended ? 'Assistir de novo' : 'Assistir ao vídeo'}</span>
          </button>
        )}

        <div className="tv-ctrl">
          <button type="button" className="tv-cbtn" onClick={() => (playing ? setPlaying(false) : play())} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /> : <path d="M8 5v14l11-7z" fill="currentColor" />}</svg>
          </button>
          <div className="tv-segs" role="group" aria-label="Capítulos">
            {SCENES.map((s, i) => {
              const p = Math.max(0, Math.min(1, (t - STARTS[i]) / s.dur));
              return (
                <button key={i} type="button" className={`tv-seg ${i === idx && started ? 'cur' : ''}`} style={{ flexGrow: s.dur }}
                  onClick={() => seek(i)} aria-label={`Capítulo ${i + 1}: ${s.chapter}`} title={s.chapter}>
                  <i style={{ width: `${p * 100}%` }} />
                </button>
              );
            })}
          </div>
          <span className="tv-time">{mmss(t)} / {mmss(TOTAL)}</span>
          <button type="button" className="tv-cbtn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Ligar a música' : 'Desligar a música'} aria-pressed={muted}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {muted ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
        {started && <div className="tv-chapter">{idx + 1}/{SCENES.length} · {scene.chapter}</div>}
      </div>

      <details className="tv-script">
        <summary>Ler o roteiro do vídeo</summary>
        <ol>
          {SCENES.map((s) => (
            <li key={s.chapter}><b>{s.chapter}.</b> {s.lines.map(([, x], i) => <Fragment key={i}>{rich(x.replace(/^…|…$/g, ''))} </Fragment>)}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
