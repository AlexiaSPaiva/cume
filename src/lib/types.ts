/** todo registro guarda criação, última edição e exclusão (lixeira de 30 dias) */
export interface Stamped {
  createdAt?: string;
  updatedAt?: string;
  /** soft delete: preenchido quando vai para a Lixeira; o purge apaga de verdade após 30 dias */
  deletedAt?: string;
}

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

export interface Task extends Stamped {
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
}

export type ImprevistoType = 'Trabalho' | 'Saúde' | 'Burocracia' | 'Infraestrutura' | 'Família' | 'Transporte' | 'Outro';

export interface Imprevisto extends Stamped {
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
}

export interface Objective extends Stamped {
  id?: number;
  title: string;
  subtitle: string;
  area: AreaId;
}

export type GoalMetric = 'valor' | 'páginas' | 'horas' | 'tarefas' | 'frequência' | 'nota' | 'outro';

export interface Goal extends Stamped {
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

export interface GoalRecord extends Stamped {
  id?: number;
  goalId: number;
  value: number;
  date: string;
  note?: string;
}

export type CalendarKind = 'evento' | 'prazo' | 'vencimento';

export interface CalendarEvent extends Stamped {
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

export interface VaultDoc extends Stamped {
  id?: number;
  name: string;
  type: DocType;
  date?: string;
  linkedTo?: string;
  value?: number;
  remind?: boolean;
  renewDate?: string;
  storage: 'arquivo' | 'drive';
  /** o arquivo ou o link ficam num Attachment (o binário em `blobs`) */
  attachmentId?: number;
}

export type AttachmentKind = 'notice' | 'boleto' | 'receipt' | 'material' | 'article' | 'file' | 'link' | 'photo';

/** metadados de um arquivo ou link; o binário fica separado em `blobs` (chave `blobKey`) */
export interface Attachment extends Stamped {
  id?: number;
  ownerType: string;
  ownerId: number | string;
  kind: AttachmentKind;
  name: string;
  size?: number;
  mime?: string;
  blobKey?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export interface StoredBlob {
  key: string;
  blob: Blob;
}

export interface Draft {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface WeekPlan extends Stamped {
  /** segunda-feira da semana (YYYY-MM-DD) */
  weekStart: string;
  hoursByArea: Record<AreaId, number>;
  top3: number[];
}

export type ScenarioId = 'por-do-sol' | 'manha' | 'noite' | 'lagoa';

export type WidgetId = 'top3' | 'prazos' | 'imprevistos' | 'foco' | 'tempo' | 'vida' | 'sugestoes';

export interface Settings extends Stamped {
  id: 'me';
  name: string;
  fullName: string;
  phrase: string;
  accent: string;
  scenario: ScenarioId;
  /** foto própria do cenário (Attachment kind 'photo') */
  photoAttachmentId?: number;
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

export interface SuggestionState extends Stamped {
  key: string;
  status: 'aceita' | 'dispensada';
  until?: string;
  taskId?: number;
}
