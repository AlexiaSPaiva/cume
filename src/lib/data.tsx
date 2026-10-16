import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { findRecurring, type RecurringSuggestion } from './recurrence';
import { isWeekly, weeklyProgress } from './recurring';
import { expandEvents } from './bills';
import { withReading } from './reading';
import type {
  ArticleNote, Attachment, Book, DevProject, CalendarEvent, Client, FinanceTx, FreelanceEntry, FreelanceProject, Goal, GoalRecord, HistorySnapshot, Imprevisto, JournalEntry, Metric, MetricEntry, MockExam, Objective, QuestionLog, Settings, Subject, SuggestionState, Task, Topic, Track, TrackDate, VaultDoc, WeekPlan,
} from './types';

export interface Data {
  settings: Settings;
  tasks: Task[];
  imprevistos: Imprevisto[];
  objectives: Objective[];
  goals: Goal[];
  events: CalendarEvent[];
  docs: VaultDoc[];
  attachments: Attachment[];
  plans: WeekPlan[];
  suggestionStates: SuggestionState[];
  suggestions: RecurringSuggestion[];
  /** renda extra (aba do Financeiro) */
  clients: Client[];
  projects: FreelanceProject[];
  entries: FreelanceEntry[];
  /** lançamentos do saldo e da Reserva */
  txs: FinanceTx[];
  /** histórico: registros das metas, métricas próprias e seus valores, fechamentos mensais */
  records: GoalRecord[];
  metrics: Metric[];
  metricEntries: MetricEntry[];
  snapshots: HistorySnapshot[];
  /** estudos (Acadêmica): trilhas e tudo o que pertence a elas */
  tracks: Track[];
  subjects: Subject[];
  topics: Topic[];
  questionLogs: QuestionLog[];
  mockExams: MockExam[];
  trackDates: TrackDate[];
  articleNotes: ArticleNote[];
  journal: JournalEntry[];
  /** Pessoal › Leitura */
  books: Book[];
  /** Profissional › Projetos */
  devProjects: DevProject[];
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ settings, fallback = null, children }: { settings: Settings; fallback?: ReactNode; children: ReactNode }) {
  // itens na Lixeira (deletedAt) não aparecem em nenhuma tela
  const live = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt);
  const tasks = useLiveQuery(() => db.tasks.toArray().then(live), []);
  const imprevistos = useLiveQuery(() => db.imprevistos.toArray().then(live), []);
  const objectives = useLiveQuery(() => db.objectives.toArray().then(live), []);
  const goals = useLiveQuery(() => db.goals.toArray().then(live), []);
  // contas mensais viram uma ocorrência por mês (Calendário, Financeiro, avisos)
  const events = useLiveQuery(() => db.events.toArray().then(live).then((x) => expandEvents(x)), []);
  const docs = useLiveQuery(() => db.docs.toArray().then(live), []);
  const attachments = useLiveQuery(() => db.attachments.toArray().then(live), []);
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const suggestionStates = useLiveQuery(() => db.suggestions.toArray(), []);
  const clients = useLiveQuery(() => db.clients.toArray().then(live), []);
  const projects = useLiveQuery(() => db.freelanceProjects.toArray().then(live), []);
  const entries = useLiveQuery(() => db.freelanceEntries.toArray().then(live), []);
  const txs = useLiveQuery(() => db.financeTxs.toArray().then(live), []);
  const records = useLiveQuery(() => db.records.toArray().then(live), []);
  const metrics = useLiveQuery(() => db.metrics.toArray().then(live), []);
  const metricEntries = useLiveQuery(() => db.metricEntries.toArray().then(live), []);
  const snapshots = useLiveQuery(() => db.snapshots.toArray(), []);
  const tracks = useLiveQuery(() => db.tracks.toArray().then(live), []);
  const subjects = useLiveQuery(() => db.subjects.toArray().then(live), []);
  const topics = useLiveQuery(() => db.topics.toArray().then(live), []);
  const questionLogs = useLiveQuery(() => db.questionLogs.toArray().then(live), []);
  const mockExams = useLiveQuery(() => db.mockExams.toArray().then(live), []);
  const trackDates = useLiveQuery(() => db.trackDates.toArray().then(live), []);
  const articleNotes = useLiveQuery(() => db.articleNotes.toArray().then(live), []);
  const journal = useLiveQuery(() => db.journal.toArray().then(live), []);
  const books = useLiveQuery(() => db.books.toArray().then(live), []);
  const devProjects = useLiveQuery(() => db.devProjects.toArray().then(live), []);

  // metas: o progresso vem das tarefas ligadas (concluídas ÷ total)
  // metas da Leitura (páginas hoje, livros no mês) são calculadas pela estante
  const goalsView = useMemo(() => (goals && tasks && books ? withReading(withTaskProgress(goals, tasks), books) : undefined), [goals, tasks, books]);

  const suggestions = useMemo(
    () => (imprevistos && suggestionStates && tasks ? findRecurring(imprevistos, suggestionStates, tasks, settings.recurrenceThreshold) : []),
    [imprevistos, suggestionStates, tasks, settings.recurrenceThreshold],
  );

  if (!tasks || !imprevistos || !objectives || !goals || !events || !docs || !attachments || !plans || !suggestionStates
    || !clients || !projects || !entries || !txs || !records || !metrics || !metricEntries || !snapshots
    || !tracks || !subjects || !topics || !questionLogs || !mockExams || !trackDates || !articleNotes || !journal || !books || !devProjects) return fallback;
  return (
    <Ctx.Provider value={{
      settings, tasks, imprevistos, objectives, goals: goalsView!, events, docs, attachments, plans, suggestionStates, suggestions,
      clients, projects, entries, txs, records, metrics, metricEntries, snapshots,
      tracks, subjects, topics, questionLogs, mockExams, trackDates, articleNotes, journal, books, devProjects,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData fora do DataProvider');
  return v;
}

/**
 * Progresso das metas pelas tarefas: uma meta "pelas tarefas" (byTasks) ou com tarefas ligadas
 * passa a valer concluídas/total. As metas antigas sem nenhuma tarefa ligada continuam com os
 * números que tinham, até a pessoa ligar tarefas a elas.
 */
export function withTaskProgress(goals: Goal[], tasks: Task[]): Goal[] {
  const by = new Map<number, Task[]>();
  for (const t of tasks) if (t.goalId != null && !t.deletedAt) by.set(t.goalId, [...(by.get(t.goalId) ?? []), t]);
  return goals.map((g) => {
    // meta ligada a uma trilha inteira: todas as sessões dela contam (as novas também), sem ligar uma a uma
    const fromTrack = g.trackAll && g.trackId != null ? tasks.filter((t) => t.trackId === g.trackId && !t.deletedAt && t.goalId !== g.id) : [];
    const linked = [...(by.get(g.id!) ?? []), ...fromTrack];
    // a pessoa escolheu medir por valor (atual/alvo): as tarefas ligadas não mudam o número
    if (g.byTasks === false) return g;
    if (!g.byTasks && !linked.length) return g;
    return { ...g, byTasks: true, metric: 'tarefas', unit: 'tarefas', initial: 0, ...taskCount(linked, g) };
  });
}

/**
 * Conta da meta pelas tarefas: cada tarefa comum vale 1; cada tarefa semanal vale os dias em que
 * ela acontece até a data final da repetição (ex.: seg/qua/sex até 31/12 = todos esses dias).
 */
export function taskCount(linked: Task[], g?: Pick<Goal, 'deadline'>): { current: number; target: number } {
  let current = 0;
  let target = 0;
  for (const t of linked) {
    if (isWeekly(t)) { const p = weeklyProgress(t, g); current += p.done; target += p.total; }
    else { target++; if (t.status === 'concluido') current++; }
  }
  return { current, target };
}
