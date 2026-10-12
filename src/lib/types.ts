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
  /** dias da semana (0=dom..6=sáb) em que se repete (blocos fixos e tarefas semanais de metas) */
  repeatDays?: number[];
  /** último dia da repetição (YYYY-MM-DD); sem ele, repete sem fim */
  repeatUntil?: string;
  /** dias (YYYY-MM-DD) em que a tarefa semanal foi feita */
  doneDates?: string[];
  /** bloco de folga criado a partir de uma sugestão de imprevisto recorrente */
  bufferFor?: string;
  /** bloco de descanso/livre (aparece tracejado) */
  soft?: boolean;
  goalId?: number;
  doneAt?: string;
  /** detalhe dentro da área (ex.: renda extra conta no Financeiro) */
  subcategory?: 'renda_extra';
  /** bloco de agenda criado por um registro de renda extra */
  freelanceEntryId?: number;
  /** cada adiamento e cada realocação (a tarefa nunca é copiada: o mesmo id carrega a história) */
  postponeLog?: PostponeEntry[];
  /** avisar X minutos antes do início */
  remindMin?: number;
  /** segunda parte de uma tarefa quebrada em sessões */
  sessionOf?: number;
  /** estudo: bloco de uma trilha (o mesmo evento aparece na Agenda e no Cronograma) */
  trackId?: number;
  subjectId?: number;
  topicId?: number;
  /** revisão espaçada gerada automaticamente (24h, 7d, 30d) */
  reviewOf?: number;
}

export interface PostponeEntry {
  kind: 'adiada' | 'realocada';
  /** dia em que estava ('' = backlog) */
  from?: string;
  /** para onde foi: "AAAA-MM-DD HH:MM", "AAAA-MM-DD", "planejamento" ou "backlog" */
  to?: string;
  reasonText?: string;
  /** imprevisto que causou o adiamento */
  reasonId?: number;
  at: string;
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
  /** o andamento do objetivo vem de uma trilha de estudos (tempo, acertos, simulados, edital) em vez da média das metas */
  trackId?: number;
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
  /** como medir: true = pelas tarefas ligadas (concluídas ÷ total); false = por valor (atual e alvo) */
  byTasks?: boolean;
  /** trilha de estudos ligada à meta (pelas tarefas) */
  trackId?: number;
  /** true = todas as tarefas da trilha contam (inclusive as que forem criadas depois); senão, só as escolhidas */
  trackAll?: boolean;
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
  /** conta que vence todo mês no mesmo dia (vencimentos) */
  repeat?: 'mensal';
  /** último dia da repetição (opcional) */
  repeatUntil?: string;
  /** valor da conta (R$), opcional */
  amount?: number;
  /** datas (AAAA-MM-DD) em que aquela ocorrência foi paga */
  paid?: string[];
  /** só nas ocorrências calculadas de uma conta mensal: a data original da série */
  seriesDate?: string;
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
  /** o arquivo; nos Safari que não aceitam Blob no banco, vem em `bytes` + `type` (ver blobstore.ts) */
  blob?: Blob;
  bytes?: ArrayBuffer;
  type?: string;
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

/** cenário da v6 (paisagens do Rio). Campo histórico: continua guardado, mas a tela usa `sceneMode`. */
export type ScenarioId = 'por-do-sol' | 'manha' | 'noite' | 'lagoa';

/** cenas de montanha do Cume° (uma por faixa de horário) */
export type SceneName = 'amanhecer' | 'dia' | 'entardecer' | 'noite';
/** automático pela hora, uma cena fixa, ou a foto própria */
export type SceneMode = 'auto' | SceneName | 'foto';

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
  /** estudos: alarmes, revisão espaçada e pomodoro (Cronograma de estudos) */
  study?: {
    blockStart?: boolean; remindMin?: number; review?: boolean; pomodoro?: boolean; focusMin?: number; breakMin?: number;
    nightly?: boolean; deadlines?: boolean; quiet?: boolean;
    /** blocos de estudo aparecem na Agenda geral (padrão: sim) */
    showInAgenda?: boolean;
  };
  /** marcou "Não mostrar de novo" nas boas-vindas */
  welcomeDismissed?: boolean;
  /** cenário do Cume° (chave nova; sem ela: foto própria se houver, senão automático) */
  sceneMode?: SceneMode;
  widgets: WidgetId[];
  desiredFocus: Record<AreaId, number>;
  city: { name: string; lat: number; lon: number };
  /** quantas ocorrências em 30 dias tornam um imprevisto "recorrente" */
  recurrenceThreshold: number;
  /** horas por semana disponíveis para planejar (padrão 80) */
  weekCapacityH?: number;
  googleClientId?: string;
  /** menu lateral recolhido no desktop (« / ») */
  sideCollapsed?: boolean;
  /** horas de 1 dia de freela (padrão 7); só muda a exibição dias ↔ horas */
  hoursPerDay?: number;
  /** como a renda extra aparece por padrão */
  freelanceUnit?: FreelanceUnit;
  /** meta de faturamento da renda extra por mês (R$) */
  freelanceGoal?: number;
}

/* ---------- estudos: trilhas (Acadêmica) ---------- */
export type TrackType = 'degree' | 'course' | 'extension' | 'research' | 'exam' | 'language';
export type TopicStatus = 'todo' | 'studying' | 'studied' | 'reviewed';
export type ArticleStatus = 'a triar' | 'lendo' | 'incluído' | 'excluído' | 'fichado';

/** trilha de estudo: graduação, curso, extensão, pesquisa, concurso ou idioma (sempre na área Acadêmica) */
export interface Track extends Stamped {
  id?: number;
  type: TrackType;
  title: string;
  /** instituição, banca, orientadora… */
  org?: string;
  status: 'ativa' | 'pausada' | 'concluida';
  /** horas por semana planejadas para a trilha */
  hoursPerWeek?: number;
  /** próximo prazo importante (entrega, projeto final…) */
  deadline?: string;
  deadlineLabel?: string;
  /** concurso: data e hora da prova; meta de acertos (%) */
  examDate?: string;
  examTime?: string;
  targetAccuracy?: number;
  /** concurso: etapas da inscrição já cumpridas */
  steps?: string[];
  /** datas da trilha (edital, simulados, provas) aparecem no Calendário e na Agenda gerais */
  showInCalendar?: boolean;
  /** alertas do edital ligados */
  alerts?: Record<string, boolean>;
  /** pesquisa: etapa atual (1–5) */
  stage?: number;
  /** pesquisa: avisar se passar N dias sem registro no diário */
  journalAlertDays?: number;
  /** graduação: meta de média/CR */
  targetGrade?: number;
  /** curso: certificado */
  certificate?: { done?: boolean; url?: string; date?: string };
  note?: string;
}

/** matéria (concurso), módulo (curso) ou disciplina (graduação) */
export interface Subject extends Stamped {
  id?: number;
  trackId: number;
  name: string;
  /** concurso: peso e nº de questões na prova */
  weight?: number;
  questionsCount?: number;
  /** meta de acertos (%) */
  targetAccuracy?: number;
  /** curso: módulo concluído */
  done?: boolean;
  /** graduação: nota final */
  grade?: number;
  order?: number;
}

export interface Topic extends Stamped {
  id?: number;
  subjectId: number;
  name: string;
  status: TopicStatus;
  nextReviewAt?: string;
  /** número do item no edital (ex.: "1.1") */
  code?: string;
  /** seção do edital (ex.: "Antiguidade"), quando o item pai tinha subitens */
  section?: string;
}

export interface QuestionLog extends Stamped {
  id?: number;
  subjectId: number;
  topicId?: number;
  date: string;
  total: number;
  correct: number;
}

export interface MockExam extends Stamped {
  id?: number;
  trackId: number;
  title: string;
  date: string;
  total: number;
  correct: number;
}

/** datas da trilha: edital (inscrições, boleto, prova, recursos…), provas da graduação, entregas da pesquisa */
export interface TrackDate extends Stamped {
  id?: number;
  trackId: number;
  label: string;
  date: string;
  dateEnd?: string;
  time?: string;
  kind: 'edital' | 'simulado' | 'prova' | 'entrega';
  alert?: boolean;
}

/** fichamento de um artigo (anexo kind 'article' da trilha de pesquisa) */
export interface ArticleNote extends Stamped {
  id?: number;
  attachmentId: number;
  trackId: number;
  status: ArticleStatus;
  authors?: string;
  year?: string;
  objective?: string;
  method?: string;
  findings?: string;
  usage?: string;
  tags?: string[];
  pages?: string;
}

/** diário de acompanhamento (pesquisa) */
export interface JournalEntry extends Stamped {
  id?: number;
  trackId: number;
  date: string;
  text: string;
  minutes?: number;
  articleId?: number;
}

/* ---------- histórico e desempenho ---------- */
export type HistPeriod = 'dia' | 'semana' | 'mes' | 'ano';
export type MetricAggregation = 'sum' | 'avg' | 'last';

/** métrica criada pela usuária (as do sistema são calculadas, não ficam salvas) */
export interface Metric extends Stamped {
  id?: number;
  name: string;
  unit: string;
  area?: AreaId;
  aggregation: MetricAggregation;
  /** quanto maior, melhor (padrão); false = quanto menor, melhor (ex.: tempo de tela) */
  higherIsBetter?: boolean;
  /** meta por período, para "comparar com: meta" */
  target?: number;
}

export interface MetricEntry extends Stamped {
  id?: number;
  metricId: number;
  date: string;
  value: number;
}

/** fechamento automático (todo dia 1º às 08:00): retrato do mês que terminou */
export interface HistorySnapshot extends Stamped {
  id?: number;
  period: HistPeriod;
  start: string;
  data: Record<string, unknown>;
}

/* ---------- renda extra (aba do Financeiro) ---------- */
export type FreelanceUnit = 'days' | 'hours';
export type Billing = 'day' | 'hour' | 'fixed';
export type PayStatus = 'paid' | 'receivable' | 'negotiating';
export type ProjectStatus = 'negociacao' | 'andamento' | 'entregue' | 'concluido';

export interface Client extends Stamped {
  id?: number;
  name: string;
  contact?: string;
}

export interface FreelanceProject extends Stamped {
  id?: number;
  clientId: number;
  title: string;
  status: ProjectStatus;
  /** 0–100 */
  progress?: number;
  dueDate?: string;
}

export interface FreelanceEntry extends Stamped {
  id?: number;
  clientId: number;
  projectId?: number;
  dateStart: string;
  dateEnd: string;
  /** unidade em que o trabalho foi contado */
  unit: FreelanceUnit;
  quantity: number;
  /** horas de 1 dia de freela NO MOMENTO do registro (mudar a configuração depois não altera este registro) */
  hoursPerDay: number;
  billing: Billing;
  /** valor por dia/hora, ou o total quando "fechado" */
  rate: number;
  /** total cobrado (R$) */
  amount: number;
  status: PayStatus;
  dueDate?: string;
  paidAt?: string;
  /** quando pago: entra no saldo; com toReserve, vai direto para a Reserva */
  toBalance: boolean;
  toReserve?: boolean;
  financeTxId?: number;
  /** blocos na Agenda (tarefas da área Financeiro, subcategoria renda_extra) */
  blockAgenda: boolean;
  invoiceDocId?: number;
}

export interface FinanceTx extends Stamped {
  id?: number;
  date: string;
  /** positivo = entrada */
  amount: number;
  account: 'saldo' | 'reserva';
  description: string;
  source?: 'renda_extra' | 'manual';
  sourceId?: number;
}

export interface Account {
  email: string;
  passwordHash: string;
  salt: string;
  /** banco com os dados desta conta; sem ele = o histórico "meuplano" (contas da v6) */
  dbName?: string;
  /** id da mesma conta na nuvem (Supabase), quando já foi ligada */
  cloudId?: string;
}

export interface SuggestionState extends Stamped {
  key: string;
  status: 'aceita' | 'dispensada';
  until?: string;
  taskId?: number;
}
