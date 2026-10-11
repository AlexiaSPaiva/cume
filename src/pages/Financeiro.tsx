import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { ItemMenu } from '../components/ItemMenu';
import { Page } from '../components/Layout';
import { useUI } from '../components/Overlays';
import { Bar, Empty, Icon, Modal, Stat, Stats } from '../components/ui';
import { AREA } from '../lib/areas';
import { openAttachment } from '../lib/attachments';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, ddmm, diffDays, MONTHS, relDays, today, weekStart } from '../lib/dates';
import { weekNumbers } from '../lib/derive';
import { useFormModel } from '../lib/drafts';
import {
  balances, brl, computeAmount, entryHours, equivalence, fmtWork, hoursPerDay, lastMonths, markPaid, monthStats, receivables,
  saveEntry, ym, type EntryInput,
} from '../lib/freelance';
import { occurrencesForWeek } from '../lib/week';
import type { Billing, FreelanceEntry, FreelanceProject, FreelanceUnit, PayStatus, ProjectStatus } from '../lib/types';

/** abas do Financeiro (a sidebar continua com 6 áreas; renda extra é uma aba, não uma área) */
export const FIN_TABS = [
  ['visao-geral', 'Visão geral'],
  ['renda-extra', 'Renda extra'],
  ['contas', 'Contas e cartões'],
  ['reserva', 'Reserva'],
  ['comprovantes', 'Cofre de comprovantes'],
] as const;
export type FinTab = (typeof FIN_TABS)[number][0];

export function useFinTab(): FinTab {
  const [p] = useSearchParams();
  const a = p.get('aba');
  return (FIN_TABS.find(([k]) => k === a)?.[0] ?? 'visao-geral') as FinTab;
}

export function FinTabs({ active }: { active: FinTab }) {
  return (
    <nav className="fin-tabs" aria-label="Abas do Financeiro">
      {FIN_TABS.map(([k, label]) => (
        <Link key={k} to={k === 'visao-geral' ? '/area/financeiro' : `/area/financeiro?aba=${k}`} className={k === active ? 'on' : ''}
          aria-current={k === active ? 'page' : undefined}>
          {label}{k === 'renda-extra' && <span className="novo">novo</span>}
        </Link>
      ))}
      <span className="fin-note">a renda extra soma no saldo e no foco do Financeiro</span>
    </nav>
  );
}

const TAB_SUB: Record<Exclude<FinTab, 'visao-geral'>, string> = {
  'renda-extra': 'Freelas e projetos por fora, dentro da sua vida financeira: tempo, quanto rendem e para onde vai o dinheiro.',
  contas: 'Vencimentos, contas fixas e faturas do Financeiro.',
  reserva: 'O que foi guardado: lançamentos da Reserva e o saldo que a renda extra já trouxe.',
  comprovantes: 'Comprovantes e notas fiscais guardados no Cofre.',
};

/** página do Financeiro quando a aba não é a Visão geral */
export function FinanceiroAba({ tab }: { tab: Exclude<FinTab, 'visao-geral'> }) {
  const label = FIN_TABS.find(([k]) => k === tab)![1];
  return (
    <Page title={`Financeiro · ${label}`} sub={TAB_SUB[tab]}
      crumbs={[{ to: '/', label: 'Início' }, { to: '/area/financeiro', label: 'Financeiro' }, { label }]}>
      <FinTabs active={tab} />
      {tab === 'renda-extra' && <RendaExtra />}
      {tab === 'contas' && <Contas />}
      {tab === 'reserva' && <Reserva />}
      {tab === 'comprovantes' && <Comprovantes />}
    </Page>
  );
}

/* =============================== Renda extra =============================== */

const STATUS_LABEL: Record<PayStatus, string> = { receivable: 'a receber', paid: 'pago', negotiating: 'em negociação' };
const PROJECT_LABEL: Record<ProjectStatus, [string, string]> = {
  negociacao: ['negociação', 'warn'], andamento: ['em andamento', 'info'], entregue: ['entregue', 'ok'], concluido: ['concluído', 'ok'],
};
const monthName = (m: string) => MONTHS[Number(m.slice(5)) - 1];

function RendaExtra() {
  const d = useData();
  const ui = useUI();
  const hpd = hoursPerDay(d.settings);
  const unit: FreelanceUnit = d.settings.freelanceUnit ?? 'days';
  const setUnit = (u: FreelanceUnit) => db.settings.update('me', { freelanceUnit: u });
  const [editing, setEditing] = useState<FreelanceEntry | null>(null);
  const [projectEdit, setProjectEdit] = useState<Partial<FreelanceProject> | null>(null);

  const t0 = today();
  const month = ym(t0);
  const ms = monthStats(d.entries, month);
  const goal = d.settings.freelanceGoal;
  const rec = receivables(d.entries);
  const recTotal = rec.reduce((s, e) => s + e.amount, 0);
  const nextDue = rec.find((e) => e.dueDate && e.dueDate >= t0);
  const clientName = (id: number) => d.clients.find((c) => c.id === id)?.name ?? '—';
  const projectOf = (e: FreelanceEntry) => d.projects.find((p) => p.id === e.projectId);

  // próximo prazo: entrega de projeto ou vencimento de pagamento, o que vier antes
  const deadlines = [
    ...d.projects.filter((p) => p.dueDate && p.dueDate >= t0 && p.status !== 'concluido')
      .map((p) => ({ date: p.dueDate!, label: `entrega ${p.title} · ${clientName(p.clientId)}` })),
    ...rec.filter((e) => e.dueDate && e.dueDate >= t0).map((e) => ({ date: e.dueDate!, label: `pagamento · ${clientName(e.clientId)}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const days = ms.hours / hpd;

  return (
    <>
      <Stats>
        <Stat k={`Faturado em ${monthName(month)}`} v={brl(ms.billed)}
          s={`${ms.projects} ${ms.projects === 1 ? 'projeto' : 'projetos'}${goal ? ` · meta ${brl(goal)}` : ''}`} />
        <Stat k="Trabalhado no mês" v={fmtWork(ms.hours, unit, hpd)}
          s={`${ms.hours ? fmtWork(ms.hours, unit === 'days' ? 'hours' : 'days', hpd) : '0'} · você escolhe a unidade`} />
        <Stat k="Valor médio" v={ms.hours ? <>{brl(Math.round(ms.billed / days))}<small className="unit">/dia</small></> : '—'}
          s={ms.hours ? `${brl(Math.round(ms.billed / ms.hours))}/h` : 'registre um trabalho'} />
        <Stat k="A receber" v={brl(recTotal)}
          s={`${rec.length} ${rec.length === 1 ? 'fatura' : 'faturas'}${nextDue ? ` · 1 vence ${relDays(nextDue.dueDate!)}` : ''}`} />
        <Stat k="Próximo prazo" v={deadlines[0] ? ddmm(deadlines[0].date) : '—'} s={deadlines[0]?.label ?? 'nenhum prazo à vista'} />
      </Stats>

      <div className="grid g3">
        <div className="list" style={{ gap: 16 }}>
          <TempoEFoco unit={unit} setUnit={setUnit} />
          <Faturamento month={month} />
        </div>

        <Card title={editing ? 'Editar trabalho' : 'Registrar trabalho'} expandable={false}>
          <EntryForm key={editing?.id ?? 'novo'} entry={editing} onDone={(msg) => { setEditing(null); if (msg) ui.toast(msg); }} />
        </Card>

        <div className="list" style={{ gap: 16 }}>
          <Card title="Projetos e clientes" act={<button className="add-link" style={{ margin: 0 }} onClick={() => setProjectEdit({ status: 'andamento', progress: 0 })}>+ projeto</button>}>
            <div className="list" style={{ gap: 14 }}>
              {d.projects.slice().sort((a, b) => order(a.status) - order(b.status)).map((p) => {
                const es = d.entries.filter((e) => e.projectId === p.id && e.status !== 'negotiating');
                const hrs = es.reduce((s, e) => s + entryHours(e), 0);
                const total = es.reduce((s, e) => s + e.amount, 0);
                const pending = d.entries.some((e) => e.projectId === p.id && e.status === 'receivable');
                const [tag, cls] = pending && p.status === 'entregue' ? ['a receber', 'imp'] : PROJECT_LABEL[p.status];
                const pct = p.status === 'concluido' || p.status === 'entregue' ? 100 : p.progress ?? 0;
                return (
                  <div key={p.id} className="proj">
                    <div className="row">
                      <button className="plain grow" onClick={() => setProjectEdit(p)}><b>{p.title}</b></button>
                      <span className={`tag ${cls}`}>{tag}</span>
                      <ItemMenu label={p.title} actions={{
                        edit: () => setProjectEdit(p),
                        delete: () => void ui.remove('freelanceProjects', p.id!, `Projeto “${p.title}”`),
                      }} />
                    </div>
                    <div className="row small muted">
                      <span className="grow">{clientName(p.clientId)}{hrs ? ` · ${fmtWork(hrs, unit, hpd)}` : ''}</span>
                      <span>{total ? brl(total) : p.status === 'negociacao' ? 'orçamento' : '—'}</span>
                    </div>
                    <Bar pct={pct} color={AREA.financeiro.color} />
                  </div>
                );
              })}
              {d.projects.length === 0 && (
                <Empty action={{ label: '+ projeto', run: () => setProjectEdit({ status: 'andamento', progress: 0 }) }}>
                  Nenhum projeto ainda. Ao registrar um trabalho, o cliente e o projeto entram aqui.
                </Empty>
              )}
            </div>
          </Card>

          <Card title="A receber">
            <div className="list">
              {rec.map((e) => (
                <div key={e.id} className="row small">
                  <span className="dotc" style={{ background: 'var(--imp)' }} />
                  <span className="grow">{e.dueDate ? `${ddmm(e.dueDate)} ` : ''}{clientName(e.clientId)}{projectOf(e) ? ` · ${projectOf(e)!.title}` : ''}</span>
                  <b>{brl(e.amount)}</b>
                  <button className="btn sm out" onClick={async () => {
                    await markPaid(e.id!);
                    ui.toast(e.toBalance ? `${brl(e.amount)} entrou ${e.toReserve ? 'na Reserva' : 'no saldo'}.` : 'Marcado como pago.');
                  }}>Recebi</button>
                </div>
              ))}
              {rec.length === 0 && <Empty>Nada a receber. 🎉</Empty>}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Trabalhos registrados">
        <div className="list">
          {d.entries.slice().sort((a, b) => b.dateStart.localeCompare(a.dateStart)).slice(0, 30).map((e) => (
            <div key={e.id} className="row small entry-row">
              <b style={{ width: '6.5rem', flex: 'none' }}>{ddmm(e.dateStart)}{e.dateEnd !== e.dateStart ? `–${ddmm(e.dateEnd)}` : ''}</b>
              <span className="grow">{clientName(e.clientId)}{projectOf(e) ? ` · ${projectOf(e)!.title}` : ''}</span>
              <span className="muted">{fmtWork(entryHours(e), unit, hpd)}</span>
              <span className={`tag ${e.status === 'paid' ? 'ok' : e.status === 'receivable' ? 'imp' : 'warn'}`}>{STATUS_LABEL[e.status]}</span>
              <b style={{ width: '5.5rem', textAlign: 'right', flex: 'none' }}>{brl(e.amount)}</b>
              <ItemMenu label={`${clientName(e.clientId)} ${ddmm(e.dateStart)}`} actions={{
                open: e.invoiceDocId ? { label: 'Abrir nota fiscal', run: () => {
                  const doc = d.docs.find((x) => x.id === e.invoiceDocId);
                  const att = d.attachments.find((a) => a.id === doc?.attachmentId);
                  if (att) void openAttachment(att);
                } } : undefined,
                edit: () => { setEditing(e); document.querySelector('.entry-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
                delete: () => void ui.remove('freelanceEntries', e.id!, 'Trabalho de renda extra'),
              }} />
            </div>
          ))}
          {d.entries.length === 0 && <Empty>Nenhum trabalho registrado. Use “Registrar trabalho” acima.</Empty>}
        </div>
      </Card>

      {projectEdit && (
        <Modal title={projectEdit.id ? 'Editar projeto' : 'Novo projeto'} onClose={() => setProjectEdit(null)}>
          <ProjectForm p={projectEdit} onDone={() => setProjectEdit(null)} />
        </Modal>
      )}
    </>
  );
}

const order = (s: ProjectStatus) => ({ andamento: 0, entregue: 1, negociacao: 2, concluido: 3 })[s];

function TempoEFoco({ unit, setUnit }: { unit: FreelanceUnit; setUnit: (u: FreelanceUnit) => void }) {
  const d = useData();
  const hpd = hoursPerDay(d.settings);
  const ws = weekStart(today());
  const wn = weekNumbers(d);
  const fre = occurrencesForWeek(d.tasks, ws).filter((o) => o.task.subcategory === 'renda_extra').reduce((s, o) => s + o.durationMin, 0) / 60;
  const finMin = wn.total.financeiro;
  const real = wn.totalMin ? Math.round((finMin / wn.totalMin) * 100) : 0;
  const desired = d.settings.desiredFocus.financeiro;
  const share = finMin ? Math.round(((fre * 60) / finMin) * 100) : 0;
  const ms = monthStats(d.entries, ym(today()));

  return (
    <Card title="Tempo e foco">
      <div className="row small" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Contar em</span>
        <span className="seg" role="radiogroup" aria-label="Unidade">
          <button role="radio" aria-checked={unit === 'days'} className={unit === 'days' ? 'on' : ''} onClick={() => setUnit('days')}>Dias</button>
          <button role="radio" aria-checked={unit === 'hours'} className={unit === 'hours' ? 'on' : ''} onClick={() => setUnit('hours')}>Horas</button>
        </span>
      </div>
      <div className="row" style={{ alignItems: 'baseline', marginTop: 10, flexWrap: 'wrap' }}>
        <b className="big-num" data-testid="worked">{fmtWork(ms.hours, unit, hpd)}</b>
        <span className="muted small">no mês · na semana: {fmtWork(fre, unit, hpd)} na Agenda</span>
      </div>
      <p className="faint small" style={{ margin: '4px 0 12px' }}>
        1 dia de freela = {hpd}h (<Link to="/personalizar#renda-extra" style={{ color: 'var(--accent)' }}>ajustável em Personalizar</Link>)
      </p>
      <div className="list" style={{ gap: 12 }}>
        <div><div className="row small"><span>Foco desejado do Financeiro</span><b className="right">{desired}%</b></div><div style={{ marginTop: 6 }}><Bar pct={desired * 2} color="#9ea3b8" /></div></div>
        <div><div className="row small"><span>Tempo real</span><b className="right" style={{ color: AREA.financeiro.color }}>{real}%</b></div><div style={{ marginTop: 6 }}><Bar pct={real * 2} color={AREA.financeiro.color} /></div></div>
      </div>
      <p className="muted small" style={{ margin: '12px 0 0' }}>
        {finMin ? `${share}% do tempo do Financeiro nesta semana foi renda extra.` : 'Sem tempo do Financeiro na Agenda nesta semana.'}
      </p>
    </Card>
  );
}

function Faturamento({ month }: { month: string }) {
  const d = useData();
  const goal = d.settings.freelanceGoal ?? 0;
  const months = lastMonths(month, 6).map((m) => ({ m, ...monthStats(d.entries, m) }));
  const max = Math.max(goal, ...months.map((x) => x.billed), 1);
  return (
    <Card title="Faturamento por mês" act={<span className="small muted legend"><i className="lg paid" />pago <i className="lg rec" />a receber</span>}>
      <div className="bars" role="img" aria-label={months.map((x) => `${monthName(x.m)}: ${brl(x.billed)}`).join('; ')}>
        {goal > 0 && <div className="goal-line" style={{ bottom: `calc(${(goal / max) * 100}% * .82 + 1.4rem)` }}><span>meta {brl(goal)}</span></div>}
        {months.map((x) => (
          <div key={x.m} className="bcol" title={`${monthName(x.m)}: pago ${brl(x.paid)} · a receber ${brl(x.receivable)}`}>
            <div className="stack" style={{ height: `${(x.billed / max) * 82}%` }}>
              {x.receivable > 0 && <i className="rec" style={{ flex: x.receivable }} />}
              {x.paid > 0 && <i className="paid" style={{ flex: x.paid }} />}
            </div>
            <small>{monthName(x.m).slice(0, 3)}</small>
          </div>
        ))}
      </div>
      {!goal && <p className="faint small" style={{ margin: '8px 0 0' }}>Defina uma meta mensal em <Link to="/personalizar#renda-extra" style={{ color: 'var(--accent)' }}>Personalizar</Link>.</p>}
    </Card>
  );
}

interface EntryModel {
  clientName: string; projectTitle: string; unit: FreelanceUnit; quantity: string; dateStart: string; dateEnd: string;
  billing: Billing; rate: string; status: PayStatus; dueDate: string; blockAgenda: boolean; toBalance: boolean; toReserve: boolean;
}

function EntryForm({ entry, onDone }: { entry: FreelanceEntry | null; onDone: (msg?: string) => void }) {
  const d = useData();
  const hpd = entry?.hoursPerDay ?? hoursPerDay(d.settings);
  const t0 = today();
  const initial: EntryModel = entry ? {
    clientName: d.clients.find((c) => c.id === entry.clientId)?.name ?? '',
    projectTitle: d.projects.find((p) => p.id === entry.projectId)?.title ?? '',
    unit: entry.unit, quantity: String(entry.quantity), dateStart: entry.dateStart, dateEnd: entry.dateEnd,
    billing: entry.billing, rate: String(entry.rate), status: entry.status, dueDate: entry.dueDate ?? '',
    blockAgenda: entry.blockAgenda, toBalance: entry.toBalance, toReserve: !!entry.toReserve,
  } : {
    clientName: '', projectTitle: '', unit: d.settings.freelanceUnit ?? 'days', quantity: '', dateStart: t0, dateEnd: t0,
    billing: 'day', rate: '', status: 'receivable', dueDate: addDays(t0, 15), blockAgenda: true, toBalance: true, toReserve: false,
  };
  // registro novo vira rascunho (não se perde ao recarregar); edição só grava ao salvar
  const model = useFormModel<EntryModel>(entry ? `freela:edit:${entry.id}` : 'freela:new', initial);
  const f = model.value;
  const set = model.set;
  const [invoice, setInvoice] = useState<File>();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const qty = Number(f.quantity.replace(',', '.')) || 0;
  const rate = Number(f.rate.replace(/\./g, '').replace(',', '.')) || 0;
  const amount = computeAmount(f.billing, rate, f.unit, qty, hpd);
  const projects = d.projects.filter((p) => {
    const c = d.clients.find((x) => x.name.toLocaleLowerCase('pt-BR') === f.clientName.trim().toLocaleLowerCase('pt-BR'));
    return !c || p.clientId === c.id;
  });

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!f.clientName.trim()) return setErr('Informe o cliente.');
    if (!(qty > 0)) return setErr('Informe quanto trabalhou.');
    if (f.billing !== 'fixed' && !(rate > 0)) return setErr('Informe o valor.');
    setBusy(true);
    try {
      const input: EntryInput = {
        id: entry?.id, clientName: f.clientName, projectTitle: f.projectTitle, dateStart: f.dateStart, dateEnd: f.dateEnd,
        unit: f.unit, quantity: qty, billing: f.billing, rate, status: f.status, dueDate: f.dueDate,
        blockAgenda: f.blockAgenda, toBalance: f.toBalance, toReserve: f.toReserve, invoice,
      };
      await saveEntry(input, d.settings);
      await model.clear();
      model.reset(initial);
      setInvoice(undefined);
      const where = f.status === 'paid' && f.toBalance ? (f.toReserve ? ' Entrou na Reserva.' : ' Entrou no saldo.') : '';
      onDone(`${entry ? 'Trabalho atualizado.' : 'Trabalho registrado.'}${f.blockAgenda ? ' Tempo bloqueado na Agenda.' : ''}${where}`);
    } catch (ex) {
      setErr(`Não consegui salvar: ${(ex as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form entry-form" onSubmit={save}>
      <div className="cols">
        <label className="field"><span>Cliente</span>
          <input list="fl-clients" value={f.clientName} onChange={(e) => set({ clientName: e.target.value })} placeholder="ex.: Studio Lume" />
        </label>
        <label className="field"><span>Projeto</span>
          <input list="fl-projects" value={f.projectTitle} onChange={(e) => set({ projectTitle: e.target.value })} placeholder="opcional" />
        </label>
        <datalist id="fl-clients">{d.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <datalist id="fl-projects">{projects.map((p) => <option key={p.id} value={p.title} />)}</datalist>
      </div>

      <div className="field"><span>Como você quer contar este trabalho?</span>
        <div className="seg full" role="radiogroup" aria-label="Unidade do trabalho">
          <button type="button" role="radio" aria-checked={f.unit === 'days'} className={f.unit === 'days' ? 'on' : ''} onClick={() => set({ unit: 'days' })}>Dias de freela</button>
          <button type="button" role="radio" aria-checked={f.unit === 'hours'} className={f.unit === 'hours' ? 'on' : ''} onClick={() => set({ unit: 'hours' })}>Horas</button>
        </div>
      </div>

      <div className="field"><span>Cobrança</span>
        <div className="seg full" role="radiogroup" aria-label="Cobrança">
          {(['day', 'hour', 'fixed'] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={f.billing === b} className={f.billing === b ? 'on' : ''} onClick={() => set({ billing: b })}>
              {b === 'day' ? 'Por dia' : b === 'hour' ? 'Por hora' : 'Fechado'}
            </button>
          ))}
        </div>
      </div>

      <div className="cols">
        <label className="field"><span>Quantidade ({f.unit === 'days' ? 'dias' : 'horas'})</span>
          <span className="with-hint">
            <input inputMode="decimal" value={f.quantity} onChange={(e) => set({ quantity: e.target.value })} placeholder={f.unit === 'days' ? '1,5' : '10'} />
            <small>{equivalence(f.unit, qty, hpd)}</small>
          </span>
        </label>
        <label className="field"><span>{f.billing === 'fixed' ? 'Valor total (R$)' : `Valor por ${f.billing === 'day' ? 'dia' : 'hora'} (R$)`}</span>
          <span className="with-hint">
            <input inputMode="decimal" value={f.rate} onChange={(e) => set({ rate: e.target.value })} placeholder="400" />
            {f.billing !== 'fixed' && amount > 0 && <small>total {brl(amount)}</small>}
          </span>
        </label>
      </div>

      <div className="cols">
        <label className="field"><span>De</span>
          <input type="date" value={f.dateStart} onChange={(e) => set({ dateStart: e.target.value, dateEnd: f.dateEnd < e.target.value ? e.target.value : f.dateEnd })} />
        </label>
        <label className="field"><span>Até</span>
          <input type="date" value={f.dateEnd} min={f.dateStart} onChange={(e) => set({ dateEnd: e.target.value })} />
        </label>
      </div>

      <div className="field"><span>Status</span>
        <div className="seg full" role="radiogroup" aria-label="Status do pagamento">
          {(['receivable', 'paid', 'negotiating'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={f.status === s} className={f.status === s ? 'on' : ''} onClick={() => set({ status: s })}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
      </div>
      {f.status === 'receivable' && (
        <label className="field"><span>Vence em</span><input type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></label>
      )}

      <label className="check"><input type="checkbox" checked={f.blockAgenda} onChange={(e) => set({ blockAgenda: e.target.checked })} /> Bloquear este tempo na Agenda</label>
      <label className="check"><input type="checkbox" checked={f.toBalance} onChange={(e) => set({ toBalance: e.target.checked })} /> Quando pago, entra no saldo</label>
      {f.toBalance && (
        <label className="check" style={{ marginLeft: 26 }}><input type="checkbox" checked={f.toReserve} onChange={(e) => set({ toReserve: e.target.checked })} /> mandar direto para a Reserva</label>
      )}
      <label className="check">
        <input type="checkbox" checked={!!invoice} onChange={(e) => { if (!e.target.checked) setInvoice(undefined); else document.getElementById('fl-invoice')?.click(); }} />
        Anexar nota fiscal ao Cofre{invoice ? `: ${invoice.name}` : ''}
      </label>
      <input id="fl-invoice" type="file" accept="application/pdf,image/*" hidden onChange={(e) => setInvoice(e.target.files?.[0])} />

      {err && <div className="err" role="alert">{err}</div>}
      <div className="actions">
        <button className="btn gold" style={{ flex: 1, justifyContent: 'center' }} disabled={busy}>{busy ? 'Salvando…' : 'Salvar registro'}</button>
        <button type="button" className="btn out" onClick={async () => { await model.clear(); model.reset(initial); setInvoice(undefined); onDone(); }}>Cancelar</button>
      </div>
      {model.savedAt && !entry && <span className="hint">rascunho salvo às {model.savedAt}</span>}
    </form>
  );
}

function ProjectForm({ p, onDone }: { p: Partial<FreelanceProject>; onDone: () => void }) {
  const d = useData();
  const [f, setF] = useState({
    clientName: d.clients.find((c) => c.id === p.clientId)?.name ?? '', title: p.title ?? '', status: p.status ?? 'andamento',
    progress: p.progress ?? 0, dueDate: p.dueDate ?? '',
  });
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.clientName.trim() || !f.title.trim()) return setErr('Informe o cliente e o nome do projeto.');
    await db.transaction('rw', db.clients, db.freelanceProjects, async () => {
      const name = f.clientName.trim();
      const clientId = d.clients.find((c) => c.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))?.id
        ?? ((await db.clients.add({ name })) as number);
      const row = { clientId, title: f.title.trim(), status: f.status, progress: Number(f.progress) || 0, dueDate: f.dueDate || undefined };
      if (p.id) await db.freelanceProjects.update(p.id, row);
      else await db.freelanceProjects.add(row);
    });
    onDone();
  }
  return (
    <form className="form" onSubmit={save}>
      <div className="cols">
        <label className="field"><span>Cliente</span><input list="fl-clients-m" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} /></label>
        <label className="field"><span>Projeto</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <datalist id="fl-clients-m">{d.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </div>
      <div className="cols">
        <label className="field"><span>Situação</span>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ProjectStatus })}>
            {(Object.keys(PROJECT_LABEL) as ProjectStatus[]).map((s) => <option key={s} value={s}>{PROJECT_LABEL[s][0]}</option>)}
          </select>
        </label>
        <label className="field"><span>Entrega</span><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
      </div>
      <label className="field"><span>Progresso: {f.progress}%</span>
        <input type="range" min={0} max={100} step={5} value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} />
      </label>
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn gold">Salvar</button><button type="button" className="btn out" onClick={onDone}>Cancelar</button></div>
    </form>
  );
}

/* =============================== outras abas =============================== */

function Contas() {
  const d = useData();
  const t0 = today();
  const dues = d.events.filter((e) => e.area === 'financeiro' || e.kind === 'vencimento').filter((e) => e.date >= addDays(t0, -7))
    .sort((a, b) => a.date.localeCompare(b.date));
  const ui = useUI();
  return (
    <div className="grid g2">
      <Card title="Vencimentos">
        <div className="list">
          {dues.slice(0, 20).map((e, i) => (
            <div key={i} className={`row small ${e.date < t0 ? 'muted' : ''}`}>
              <b style={{ width: '3.5rem' }}>{ddmm(e.date)}</b><span className="grow">{e.title}</span>
              <span className={e.date < t0 ? 'faint' : diffDays(e.date, t0) <= 3 ? '' : 'muted'} style={{ color: e.date >= t0 && diffDays(e.date, t0) <= 3 ? 'var(--bad)' : undefined }}>{relDays(e.date)}</span>
            </div>
          ))}
          {dues.length === 0 && <Empty>Nenhum vencimento cadastrado. Vencimentos de documentos do Cofre e eventos do Financeiro aparecem aqui.</Empty>}
        </div>
      </Card>
      <Card title="Contas e cartões">
        <Empty action={{ label: 'Guardar fatura ou contrato no Cofre', run: () => ui.openDoc() }}>
          Guarde no Cofre as faturas e os contratos das suas contas e cartões; quem tiver data de renovação ganha lembrete no Calendário.
        </Empty>
      </Card>
    </div>
  );
}

function Reserva() {
  const d = useData();
  const ui = useUI();
  const b = balances(d.txs);
  const [mv, setMv] = useState('');
  const list = d.txs.slice().sort((a, x) => x.date.localeCompare(a.date));
  async function guardar(e: FormEvent) {
    e.preventDefault();
    const v = Number(mv.replace(/\./g, '').replace(',', '.'));
    if (!(v > 0)) return;
    const date = today();
    await db.financeTxs.bulkAdd([
      { date, amount: -v, account: 'saldo', description: 'Transferência para a Reserva', source: 'manual' },
      { date, amount: v, account: 'reserva', description: 'Transferência do saldo', source: 'manual' },
    ]);
    setMv('');
    ui.toast(`${brl(v)} foi para a Reserva.`);
  }
  return (
    <>
      <Stats n={3}>
        <Stat k="Reserva" v={brl(b.reserva)} s="guardado" />
        <Stat k="Saldo lançado no app" v={brl(b.saldo)} s="entradas da renda extra e transferências" />
        <Stat k="Lançamentos" v={d.txs.length} s="no total" />
      </Stats>
      <div className="grid g2">
        <Card title="Mandar para a Reserva">
          <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={guardar}>
            <input className="input" style={{ width: '10rem' }} inputMode="decimal" placeholder="R$ 200" value={mv} onChange={(e) => setMv(e.target.value)} aria-label="Valor para a Reserva" />
            <button className="btn gold">Guardar</button>
          </form>
          <p className="muted small">Sai do saldo e entra na Reserva. A renda extra também pode cair direto aqui (opção no registro).</p>
        </Card>
        <Card title="Lançamentos">
          <div className="list">
            {list.slice(0, 30).map((t) => (
              <div key={t.id} className="row small">
                <b style={{ width: '3.5rem' }}>{ddmm(t.date)}</b>
                <span className="grow">{t.description}</span>
                <span className="tag">{t.account}</span>
                <b style={{ color: t.amount < 0 ? 'var(--bad)' : 'var(--ok)', width: '5.5rem', textAlign: 'right' }}>{brl(t.amount)}</b>
                {t.source === 'manual' && <ItemMenu label={t.description} actions={{ delete: () => void ui.remove('financeTxs', t.id!, 'Lançamento') }} />}
              </div>
            ))}
            {list.length === 0 && <Empty>Sem lançamentos ainda. Marque um trabalho de renda extra como pago para ele entrar aqui.</Empty>}
          </div>
        </Card>
      </div>
    </>
  );
}

function Comprovantes() {
  const d = useData();
  const ui = useUI();
  const docs = d.docs.filter((x) => x.type === 'Comprovante' || x.type === 'Imposto').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return (
    <Card title="Comprovantes e notas fiscais" wide act={<Link to="/area/adultices/cofre" className="add-link" style={{ margin: 0 }}>abrir o Cofre ›</Link>}>
      <div className="list">
        {docs.map((x) => {
          const att = d.attachments.find((a) => a.id === x.attachmentId);
          return (
            <div key={x.id} className="row small">
              <Icon name={x.storage === 'drive' ? 'drive' : 'file'} size={15} />
              <button className="plain grow" onClick={() => att && void openAttachment(att)}>{x.name}</button>
              <span className="muted">{x.linkedTo ?? x.type}</span>
              <span className="muted">{x.date ? ddmm(x.date) : ''}</span>
              <b style={{ width: '5.5rem', textAlign: 'right' }}>{x.value ? brl(x.value) : '—'}</b>
            </div>
          );
        })}
        {docs.length === 0 && <Empty action={{ label: '+ Adicionar comprovante', run: () => ui.openDoc() }}>Nenhum comprovante no Cofre.</Empty>}
      </div>
    </Card>
  );
}

export function SaldoStats(): ReactNode {
  const d = useData();
  const b = balances(d.txs);
  return <Stat k="Saldo · Reserva" v={brl(b.saldo)} s={`Reserva ${brl(b.reserva)}`} />;
}
