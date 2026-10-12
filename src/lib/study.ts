import type { Data } from './data';
import { addDays, diffDays, today, weekStart } from './dates';
import type { CalendarEvent, Subject, Task, Track, TrackType } from './types';
import { occurrencesForWeek } from './week';

/**
 * Estudos (Acadêmica por trilhas). Tudo aqui SÓ LÊ: as sessões de estudo são tarefas da Agenda
 * com trackId (o mesmo evento aparece na Agenda, no Calendário e no Cronograma; nunca é duplicado).
 */

export const TRACK_TYPES: { id: TrackType; label: string; plural: string; color: string }[] = [
  { id: 'degree', label: 'Graduação', plural: 'Graduação', color: '#8f8cc4' },
  { id: 'course', label: 'Curso', plural: 'Cursos', color: '#6fb7c9' },
  { id: 'extension', label: 'Extensão', plural: 'Extensão', color: '#a7b4d8' },
  { id: 'research', label: 'Pesquisa', plural: 'Pesquisa', color: '#d197ae' },
  { id: 'exam', label: 'Concurso', plural: 'Concursos', color: '#c8a97e' },
  { id: 'language', label: 'Idioma', plural: 'Idiomas', color: '#7fb8a0' },
];
export const TYPE = Object.fromEntries(TRACK_TYPES.map((t) => [t.id, t])) as Record<TrackType, (typeof TRACK_TYPES)[number]>;

/** abas da trilha por tipo (v7, §5) */
export const TRACK_TABS: Record<TrackType, [string, string][]> = {
  exam: [['visao', 'Visão geral'], ['materias', 'Matérias'], ['cronograma', 'Cronograma'], ['edital', 'Edital e prazos'], ['documentos', 'Documentos'], ['simulados', 'Simulados']],
  research: [['visao', 'Visão geral'], ['artigos', 'Artigos'], ['arquivos', 'Arquivos'], ['diario', 'Diário']],
  course: [['visao', 'Visão geral'], ['modulos', 'Módulos'], ['cronograma', 'Cronograma'], ['certificado', 'Certificado']],
  degree: [['visao', 'Visão geral'], ['disciplinas', 'Disciplinas'], ['provas', 'Provas'], ['notas', 'Notas']],
  extension: [['visao', 'Visão geral'], ['modulos', 'Atividades'], ['cronograma', 'Cronograma'], ['arquivos', 'Arquivos']],
  language: [['visao', 'Visão geral'], ['modulos', 'Níveis'], ['cronograma', 'Cronograma'], ['certificado', 'Certificado']],
};

export const RESEARCH_STAGES = ['Projeto', 'Triagem', 'Leitura e fichamento', 'Análise', 'Escrita e entrega'];
export const EXAM_STEPS = ['Edital lido', 'Inscrição feita', 'Boleto pago', 'Cartão de confirmação', 'Prova', 'Resultado'];

type SD = Pick<Data, 'tasks' | 'subjects' | 'topics' | 'questionLogs' | 'mockExams' | 'trackDates' | 'articleNotes' | 'journal' | 'attachments'>;

/** sessões de estudo da trilha (tarefas com trackId) numa semana, em minutos */
export function studyMinutesWeek(d: Pick<Data, 'tasks'>, ws: string, trackId?: number, onlyDone = false): number {
  return occurrencesForWeek(d.tasks, ws)
    .filter((o) => o.task.trackId != null && (trackId == null || o.task.trackId === trackId) && o.task.status !== 'adiada')
    .filter((o) => !onlyDone || o.task.status === 'concluido' || o.date < today())
    .reduce((s, o) => s + o.durationMin, 0);
}

export const isStudy = (t: Task) => t.trackId != null;

/** acertos (%) de uma matéria: questões lançadas + simulados não entram aqui */
export function accuracy(d: Pick<Data, 'questionLogs'>, subjectId: number, lastN?: number): number | null {
  let xs = d.questionLogs.filter((q) => q.subjectId === subjectId).sort((a, b) => a.date.localeCompare(b.date));
  if (lastN) xs = xs.slice(-lastN);
  const total = xs.reduce((s, q) => s + q.total, 0);
  return total ? Math.round((xs.reduce((s, q) => s + q.correct, 0) / total) * 100) : null;
}

/** parte do edital/módulo coberta: tópicos estudados ou revisados ÷ total */
export function coverage(d: Pick<Data, 'topics'>, subjectId: number): { done: number; total: number; pct: number } {
  const ts = d.topics.filter((t) => t.subjectId === subjectId);
  const done = ts.filter((t) => t.status === 'studied' || t.status === 'reviewed').length;
  return { done, total: ts.length, pct: ts.length ? done / ts.length : 0 };
}

/**
 * Necessidade (concurso, §6): peso × max(0, meta de acertos − acerto) × (1 − % do edital estudado).
 * Sem questões lançadas ainda, o acerto conta como 0 (a matéria precisa ser medida).
 */
export function necessity(d: Pick<Data, 'topics' | 'questionLogs'>, s: Subject, trackTarget = 75): number {
  const meta = (s.targetAccuracy ?? trackTarget) / 100;
  const acc = (accuracy(d, s.id!) ?? 0) / 100;
  return Math.round((s.weight ?? 1) * Math.max(0, meta - acc) * (1 - coverage(d, s.id!).pct) * 1000) / 1000;
}

export function necessityLevel(n: number, max: number): 'alta' | 'media' | 'baixa' {
  if (!max) return 'baixa';
  const r = n / max;
  return r > 0.6 ? 'alta' : r > 0.3 ? 'media' : 'baixa';
}

/** minutos estudados por matéria (sessões concluídas ou já passadas com subjectId) */
export function subjectMinutes(d: Pick<Data, 'tasks'>, subjectId: number): number {
  return d.tasks.filter((t) => t.subjectId === subjectId && (t.status === 'concluido' || (t.date ?? '9') < today())).reduce((s, t) => s + (t.durationMin ?? 0), 0);
}

export interface TrackSummary {
  /** linha principal do card ("CR 8,1 · meta ≥ 8", "Módulo 4 de 9", "Edital 46% coberto"…) */
  metric: string;
  /** linha de apoio */
  detail: string;
  /** 0–100 */
  progress: number;
  next?: { date: string; label: string };
}

export function trackSummary(d: SD, t: Track): TrackSummary {
  const subs = d.subjects.filter((s) => s.trackId === t.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const next = nextDate(d, t);
  if (t.type === 'exam') {
    const all = subs.flatMap((s) => d.topics.filter((x) => x.subjectId === s.id));
    const cov = all.length ? Math.round((all.filter((x) => x.status === 'studied' || x.status === 'reviewed').length / all.length) * 100) : 0;
    const logs = d.questionLogs.filter((q) => subs.some((s) => s.id === q.subjectId));
    const tot = logs.reduce((s, q) => s + q.total, 0);
    const acc = tot ? Math.round((logs.reduce((s, q) => s + q.correct, 0) / tot) * 100) : null;
    return { metric: `Edital ${cov}% coberto`, detail: `Acertos ${acc != null ? `${acc}%` : '—'} · meta ${t.targetAccuracy ?? 75}%`, progress: cov, next };
  }
  if (t.type === 'research') {
    const arts = d.articleNotes.filter((a) => a.trackId === t.id);
    const tri = arts.filter((a) => a.status !== 'a triar').length;
    const last = d.journal.filter((j) => j.trackId === t.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    const stage = RESEARCH_STAGES[(t.stage ?? 1) - 1] ?? RESEARCH_STAGES[0];
    return {
      metric: `Etapa: ${stage.toLowerCase()}${arts.length ? ` ${tri}/${arts.length}` : ''}`,
      detail: last ? `Último registro há ${Math.max(0, diffDays(today(), last.date))} ${diffDays(today(), last.date) === 1 ? 'dia' : 'dias'}` : 'Nenhum registro no diário ainda',
      progress: Math.round((((t.stage ?? 1) - 1) / RESEARCH_STAGES.length) * 100 + (arts.length ? (tri / arts.length) * (100 / RESEARCH_STAGES.length) : 0)),
      next,
    };
  }
  if (t.type === 'degree') {
    const graded = subs.filter((s) => s.grade != null);
    const avg = graded.length ? graded.reduce((s, x) => s + x.grade!, 0) / graded.length : null;
    const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const ok = graded.filter((s) => s.grade! >= (t.targetGrade ?? 7)).length;
    return {
      metric: `${avg != null ? `Média ${fmt(avg)}` : 'Sem notas ainda'}${t.targetGrade ? ` · meta ≥ ${fmt(t.targetGrade)}` : ''}`,
      detail: subs.length ? `Disciplinas ${ok}/${subs.length} em dia` : 'Cadastre as disciplinas',
      progress: subs.length ? Math.round((ok / subs.length) * 100) : 0,
      next,
    };
  }
  // curso, idioma, extensão: módulos/níveis/atividades concluídos
  const done = subs.filter((s) => s.done).length;
  const cur = subs.findIndex((s) => !s.done);
  const word = t.type === 'language' ? 'Nível' : t.type === 'extension' ? 'Atividade' : 'Módulo';
  return {
    metric: subs.length ? `${word} ${cur < 0 ? subs.length : cur + 1} de ${subs.length}` : `Nenhum ${word.toLowerCase()} ainda`,
    detail: subs.length ? `${Math.round((done / subs.length) * 100)}% ${t.type === 'course' ? 'do curso' : 'concluído'}` : 'Cadastre os módulos para acompanhar',
    progress: subs.length ? Math.round((done / subs.length) * 100) : 0,
    next,
  };
}

/** próximo prazo da trilha: datas cadastradas, prazo da trilha e a prova */
export function nextDate(d: Pick<Data, 'trackDates'>, t: Track, from = today()): { date: string; label: string } | undefined {
  const xs = [
    ...d.trackDates.filter((x) => x.trackId === t.id && (x.dateEnd ?? x.date) >= from).map((x) => ({ date: x.date, label: x.label })),
    ...(t.deadline && t.deadline >= from ? [{ date: t.deadline, label: t.deadlineLabel ?? 'prazo' }] : []),
    ...(t.examDate && t.examDate >= from ? [{ date: t.examDate, label: 'prova' }] : []),
  ];
  return xs.sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** blocos de estudo de um dia (com o título da trilha) */
export function studyToday(d: Pick<Data, 'tasks'>, day = today()): Task[] {
  return occurrencesForWeek(d.tasks, weekStart(day)).filter((o) => o.date === day && o.task.trackId != null && o.task.status !== 'adiada')
    .sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99')).map((o) => o.task);
}

/** revisões espaçadas para hoje (tarefas de revisão + tópicos com revisão marcada) */
export function reviewsToday(d: Pick<Data, 'tasks' | 'topics'>, day = today()): number {
  return d.tasks.filter((t) => t.reviewOf != null && t.date === day && t.status !== 'concluido').length
    + d.topics.filter((t) => t.nextReviewAt === day).length;
}

/** revisão espaçada: datas 24h, 7 e 30 dias depois do estudo */
export const REVIEW_OFFSETS = [1, 7, 30];
export const reviewDates = (from: string) => REVIEW_OFFSETS.map((n) => addDays(from, n));

/**
 * "Gerar cronograma pela necessidade" (§6): distribui as horas da trilha na semana seguinte pelas matérias,
 * na proporção da necessidade (quem mais precisa ganha mais blocos), nos horários livres de cada dia
 * (sem sobrepor nada que já está na Agenda). Devolve os blocos para gravar; não grava.
 */
export function planByNecessity(
  d: Pick<Data, 'tasks' | 'subjects' | 'topics' | 'questionLogs'>, track: Track,
  opts: { from?: string; days?: number; blockMin?: number; slots?: string[] } = {},
): Task[] {
  const from = opts.from ?? addDays(today(), 1);
  const days = opts.days ?? 7;
  const blockMin = opts.blockMin ?? 60;
  const slots = opts.slots ?? ['19:00', '20:00', '07:00', '21:00', '14:00'];
  const subs = d.subjects.filter((s) => s.trackId === track.id);
  if (!subs.length) return [];
  const budget = Math.max(blockMin, Math.round(((track.hoursPerWeek ?? 6) * 60 * days) / 7));
  const nBlocks = Math.max(1, Math.floor(budget / blockMin));
  const need = subs.map((s) => ({ s, n: necessity(d, s, track.targetAccuracy ?? 75) }));
  const sumN = need.reduce((a, x) => a + x.n, 0);
  // blocos por matéria: proporção da necessidade (todas iguais se ninguém tem necessidade medida)
  const share = need.map((x) => ({ s: x.s, k: sumN ? (x.n / sumN) * nBlocks : nBlocks / subs.length }));
  const counts = share.map((x) => ({ s: x.s, c: Math.floor(x.k), r: x.k - Math.floor(x.k) }));
  let left = nBlocks - counts.reduce((a, x) => a + x.c, 0);
  for (const x of [...counts].sort((a, b) => b.r - a.r)) { if (left <= 0) break; x.c++; left--; }
  const queue: Subject[] = [];
  // intercala as matérias (a de maior necessidade primeiro)
  const order = counts.filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
  for (let round = 0; queue.length < nBlocks && round < nBlocks; round++) for (const x of order) if (x.c > round) queue.push(x.s);

  const out: Task[] = [];
  const busy = (date: string, start: string) => {
    const s = toMinutes(start);
    const occ = occurrencesForWeek([...d.tasks, ...out], weekStart(date)).filter((o) => o.date === date && o.start && o.task.status !== 'adiada');
    return occ.some((o) => { const a = toMinutes(o.start!); return s < a + o.durationMin && a < s + blockMin; });
  };
  let i = 0;
  for (let day = 0; day < days && i < queue.length; day++) {
    const date = addDays(from, day);
    let perDay = 0;
    for (const start of slots) {
      if (i >= queue.length || perDay >= 2) break;
      if (busy(date, start)) continue;
      const s = queue[i++];
      perDay++;
      out.push({ title: `${s.name}`, area: 'academica', status: 'afazer', priority: 'media', date, start, durationMin: blockMin, trackId: track.id, subjectId: s.id });
    }
  }
  return out;
}

const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/**
 * Datas das trilhas que aparecem no Calendário e nos prazos gerais (trilhas com "Mostrar no Calendário" ligado):
 * as datas do edital/provas/entregas e a data da prova do concurso. Só leitura: editam-se na trilha.
 */
export function trackEvents(d: Pick<Data, 'tracks' | 'trackDates'>): CalendarEvent[] {
  const shown = d.tracks.filter((t) => t.showInCalendar !== false && t.status !== 'concluida');
  const ids = new Set(shown.map((t) => t.id));
  const name = (id: number) => shown.find((t) => t.id === id)?.title ?? '';
  return [
    ...d.trackDates.filter((x) => ids.has(x.trackId)).map((x): CalendarEvent => ({
      title: `${name(x.trackId)} · ${x.label}`, date: x.date, start: x.time, area: 'academica', kind: x.kind === 'prova' || x.kind === 'entrega' ? 'prazo' : 'evento', source: 'local',
    })),
    ...shown.filter((t) => t.examDate && !d.trackDates.some((x) => x.trackId === t.id && x.kind === 'prova' && x.date === t.examDate)).map((t): CalendarEvent => ({
      title: `${t.title} · prova`, date: t.examDate!, start: t.examTime, area: 'academica', kind: 'prazo', source: 'local',
    })),
  ];
}

/* ---------- tópicos colados do edital ---------- */

export interface ParsedTopic { name: string; code?: string; section?: string }

// "1.", "1.1.", "1.1", "2)", "3 -", "4.2.1:" no começo da linha
const NUMBERED = /^\s*(\d{1,3}(?:\.\d{1,3})*)\s*[.)]?\s*[-–—:]?\s+(\S.*)$/;

/**
 * Lê o texto colado do edital.
 * - Com numeração: só as linhas numeradas viram tópicos; um item que tem subitens (ex.: "1. ANTIGUIDADE" com 1.1, 1.2…)
 *   vira o nome da SEÇÃO, não um tópico. Linhas sem número são ignoradas, exceto quando continuam a linha de
 *   cima (texto do PDF quebrado no meio do tópico). O ";" dentro do tópico não quebra o tópico.
 * - Sem numeração: um tópico por linha (ou separados por ";"), como antes.
 */
export function parseTopics(text: string): ParsedTopic[] {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items: { code: string; name: string }[] = [];
  for (const l of lines) {
    const m = NUMBERED.exec(l);
    if (m) { items.push({ code: m[1], name: m[2].trim() }); continue; }
    const last = items[items.length - 1];
    // continuação: a linha de cima não terminou (sem ponto final) e esta começa em minúscula
    if (last && !/[.;:!?]$/.test(last.name) && /^[a-zà-ú(]/.test(l)) last.name = `${last.name} ${l}`;
  }
  if (!items.length) {
    return text.split(/[\n;]/).map((x) => x.trim()).filter(Boolean).map((name) => ({ name }));
  }
  const isParent = (code: string) => items.some((x) => x.code.startsWith(`${code}.`));
  const titleOf = (code: string) => items.find((x) => x.code === code)?.name;
  const out: ParsedTopic[] = [];
  for (const it of items) {
    if (isParent(it.code)) continue;
    const parent = it.code.includes('.') ? it.code.slice(0, it.code.lastIndexOf('.')) : undefined;
    out.push({ code: it.code, name: it.name, section: parent ? sectionName(titleOf(parent)) : undefined });
  }
  return out;
}

/** "ANTIGUIDADE" → "Antiguidade"; "MUNDO MEDIEVAL" → "Mundo Medieval" (o resto fica como veio) */
function sectionName(s?: string): string | undefined {
  if (!s) return undefined;
  const t = s.replace(/[.:;]+$/, '');
  if (t !== t.toUpperCase()) return t;
  const small = new Set(['a', 'as', 'o', 'os', 'e', 'de', 'da', 'das', 'do', 'dos', 'em', 'na', 'no', 'para']);
  return t.toLowerCase().split(' ').map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

/* ---------- trilha como indicador de objetivo ---------- */

export interface Indicator { label: string; value: string; /** 0–100: quanto este índice já chegou do esperado */ pct: number }
export interface TrackIndicators { progress: number; parts: Indicator[]; bySubject: { name: string; acc: number | null; target: number }[] }

/**
 * Índices de andamento de uma trilha, para medir um objetivo (ex.: aprovação no concurso):
 * - Tempo: horas estudadas (sessões concluídas) ÷ horas que o plano pedia até hoje (horas/semana × semanas, ou as sessões já marcadas);
 * - Acertos: questões + simulados ÷ meta de acertos;  - Simulados: último simulado ÷ meta;
 * - Edital (concurso) ou o andamento próprio da trilha (módulos, notas, etapas).
 * O progresso é a média dos índices que já têm dado.
 */
export function trackIndicators(d: SD & Pick<Data, 'tracks'>, t: Track, ref = today()): TrackIndicators {
  const parts: Indicator[] = [];
  const sessions = d.tasks.filter((x) => x.trackId === t.id && x.status !== 'adiada');
  const studied = sessions.filter((x) => x.status === 'concluido').reduce((s, x) => s + (x.durationMin ?? 0), 0);
  const since = t.createdAt?.slice(0, 10) ?? ref;
  const weeks = Math.max(1, Math.ceil((diffDays(ref, since) + 1) / 7));
  const plannedSoFar = t.hoursPerWeek
    ? t.hoursPerWeek * 60 * weeks
    : sessions.filter((x) => x.date && x.date <= ref).reduce((s, x) => s + (x.durationMin ?? 0), 0);
  const h = (m: number) => `${Math.round((m / 60) * 10) / 10}`.replace('.', ',');
  if (plannedSoFar > 0) parts.push({ label: 'Tempo', value: `${h(studied)}h de ${h(plannedSoFar)}h`, pct: Math.min(100, Math.round((studied / plannedSoFar) * 100)) });

  const subs = d.subjects.filter((s) => s.trackId === t.id);
  const target = t.targetAccuracy ?? 75;
  const bySubject = subs.map((s) => ({ name: s.name, acc: accuracy(d, s.id!), target: s.targetAccuracy ?? target }));
  if (t.type === 'exam') {
    const all = subs.flatMap((s) => d.topics.filter((x) => x.subjectId === s.id));
    if (all.length) {
      const cov = Math.round((all.filter((x) => x.status === 'studied' || x.status === 'reviewed').length / all.length) * 100);
      parts.push({ label: 'Edital', value: `${cov}% coberto`, pct: cov });
    }
    const logs = d.questionLogs.filter((q) => subs.some((s) => s.id === q.subjectId));
    const mocks = d.mockExams.filter((m) => m.trackId === t.id).sort((a, b) => a.date.localeCompare(b.date));
    const tot = logs.reduce((s, q) => s + q.total, 0) + mocks.reduce((s, m) => s + m.total, 0);
    const ok = logs.reduce((s, q) => s + q.correct, 0) + mocks.reduce((s, m) => s + m.correct, 0);
    if (tot) {
      const acc = Math.round((ok / tot) * 100);
      parts.push({ label: 'Acertos', value: `${acc}% · meta ${target}%`, pct: Math.min(100, Math.round((acc / target) * 100)) });
    }
    const last = mocks.at(-1);
    if (last && last.total) {
      const m = Math.round((last.correct / last.total) * 100);
      parts.push({ label: 'Simulados', value: `último ${m}%`, pct: Math.min(100, Math.round((m / target) * 100)) });
    }
  } else {
    const s = trackSummary(d, t);
    parts.push({ label: TYPE[t.type].label, value: s.metric, pct: s.progress });
  }
  const progress = parts.length ? Math.round(parts.reduce((s, p) => s + p.pct, 0) / parts.length) : 0;
  return { progress, parts, bySubject };
}
