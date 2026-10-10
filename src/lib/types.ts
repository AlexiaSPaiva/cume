export type AreaId = 'academica' | 'profissional' | 'saude' | 'pessoal' | 'financeiro' | 'adultices';

export interface Area {
  id: AreaId;
  name: string;
  color: string;
  tagline: string;
}

/** 'afazer' = planejada para um dia (ou no backlog, sem dia); entra no quadro "Hoje" quando o dia chega */
export type TaskStatus = 'afazer' | 'hoje' | 'andamento' | 'aguardando' | 'concluido' | 'adiada';
export type Priority = 'alta' | 'media' | 'baixa';

export interface Task {
  id?: number;
  title: string;
  area: AreaId;
  status: TaskStatus;
  priority: Priority;
  /** dia em que está planejada (YYYY-MM-DD); vazio = backlog */
  date?: string;
  /** horário de início (HH:MM) */
  start?: string;
  durationMin?: number;
  /** prazo final (YYYY-MM-DD) */
  deadline?: string;
  progress?: number;
  postponedCount?: number;
  /** marcada no Top 3 do dia */
  top3Today?: boolean;
  /** dias da semana (0=dom..6=sáb) em que o bloco se repete; usado para compromissos fixos */
  repeatDays?: number[];
  /** bloco de folga criado a partir de uma sugestão de imprevisto recorrente */
  bufferFor?: string;
  /** bloco de descanso/livre (aparece tracejado) */
  soft?: boolean;
  goalId?: number;
  doneAt?: string;
  createdAt: string;
}

export type ImprevistoType = 'Trabalho' | 'Saúde' | 'Burocracia' | 'Infraestrutura' | 'Família' | 'Transporte' | 'Outro';

export interface Imprevisto {
  id?: number;
  title: string;
  area: AreaId;
  type: ImprevistoType;
  demand?: string;
  date: string;
  start: string;
  end: string;
  durationMin: number;
  postponedTasks: boolean;
  postponedTaskIds?: number[];
  createdAt: string;
}

export interface Objective {
  id?: number;
  title: string;
  subtitle: string;
  area: AreaId;
}

export type GoalMetric = 'valor' | 'páginas' | 'horas' | 'tarefas' | 'frequência' | 'nota' | 'outro';

export interface Goal {
  id?: number;
  objectiveId?: number;
  title: string;
  metric: GoalMetric;
  unit?: string;
  initial: number;
  current: number;
  target: number;
  deadline?: string;
  area: AreaId;
  /** aparece como indicador no topo do painel da área */
  kpi?: boolean;
}

export interface GoalRecord {
  id?: number;
  goalId: number;
  value: number;
  date: string;
  note?: string;
}

export type CalendarKind = 'evento' | 'prazo' | 'vencimento';

export interface CalendarEvent {
  id?: number;
  title: string;
  date: string;
  start?: string;
  area: AreaId;
  kind: CalendarKind;
  source: 'local' | 'google';
  calendarName?: string;
  externalId?: string;
}

export type DocType = 'Documento' | 'Comprovante' | 'Contrato' | 'Imposto' | 'Outro';

export interface VaultDoc {
  id?: number;
  name: string;
  type: DocType;
  date?: string;
  linkedTo?: string;
  value?: number;
  remind?: boolean;
  renewDate?: string;
  storage: 'arquivo' | 'drive';
  blob?: Blob;
  mime?: string;
  size?: number;
  driveUrl?: string;
  createdAt: string;
}

export interface WeekPlan {
  /** segunda-feira da semana (YYYY-MM-DD) */
  weekStart: string;
  hoursByArea: Record<AreaId, number>;
  top3: number[];
}

export type ScenarioId = 'por-do-sol' | 'manha' | 'noite' | 'lagoa';

export type WidgetId = 'top3' | 'prazos' | 'imprevistos' | 'foco' | 'tempo' | 'vida' | 'sugestoes';

export interface Settings {
  id: 'me';
  name: string;
  fullName: string;
  phrase: string;
  accent: string;
  scenario: ScenarioId;
  customPhoto?: string;
  widgets: WidgetId[];
  desiredFocus: Record<AreaId, number>;
  city: { name: string; lat: number; lon: number };
  /** quantas ocorrências em 30 dias tornam um imprevisto "recorrente" */
  recurrenceThreshold: number;
  /** horas por semana disponíveis para planejar (padrão 80) */
  weekCapacityH?: number;
  googleClientId?: string;
}

export interface Account {
  email: string;
  passwordHash: string;
  salt: string;
}

export interface SuggestionState {
  key: string;
  status: 'aceita' | 'dispensada';
  until?: string;
  taskId?: number;
}
