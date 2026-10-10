import { db } from './db';
import { addDays, today, weekStart } from './dates';
import type { AreaId, CalendarEvent, Goal, Imprevisto, ImprevistoType, Settings, Task, VaultDoc } from './types';

export function defaultSettings(name: string, fullName = name): Settings {
  return {
    id: 'me',
    name,
    fullName,
    phrase: 'Hoje é um bom dia para ser a sua melhor versão.',
    accent: '#c9a77c',
    scenario: 'por-do-sol',
    widgets: ['sugestoes', 'top3', 'prazos', 'imprevistos', 'foco', 'tempo', 'vida'],
    desiredFocus: { academica: 30, profissional: 28, saude: 12, pessoal: 10, financeiro: 10, adultices: 10 },
    city: { name: 'Rio de Janeiro, RJ', lat: -22.91, lon: -43.17 },
    recurrenceThreshold: 3,
  };
}

/** dados de exemplo baseados no MeuPlano_Design_v6, ancorados na semana atual */
export async function seedExample() {
  const now = new Date().toISOString();
  const mon = weekStart(today());
  const d = (n: number) => addDays(mon, n);

  const t = (p: Partial<Task> & Pick<Task, 'title' | 'area'>): Task => ({
    status: 'afazer', priority: 'media', createdAt: now, ...p,
  });

  const tasks: Task[] = [
    // blocos fixos
    t({ title: 'Antena 1', area: 'profissional', start: '09:00', durationMin: 180, repeatDays: [1, 2, 3, 4, 5], date: addDays(mon, -28) }),
    t({ title: 'Redes / almoço', area: 'pessoal', start: '12:00', durationMin: 60, repeatDays: [1, 2, 3, 4, 5], date: addDays(mon, -28) }),
    t({ title: 'Antena 1', area: 'profissional', start: '13:00', durationMin: 180, repeatDays: [1, 2, 3, 4, 5], date: addDays(mon, -28) }),
    // Hoje (quadro)
    t({ title: 'Estudar Matemática', area: 'academica', status: 'hoje', priority: 'alta', date: today(), start: '18:00', durationMin: 120, top3Today: true }),
    t({ title: 'Antena 1 · dev técnico', area: 'profissional', status: 'hoje', priority: 'alta', date: today(), start: '10:00', durationMin: 120, top3Today: true }),
    t({ title: 'Candidaturas LinkedIn', area: 'profissional', status: 'hoje', priority: 'media', date: today(), start: '16:00', durationMin: 120, top3Today: true }),
    // semana
    t({ title: 'Pesquisa GEUX · revisão', area: 'academica', status: 'andamento', date: d(1), start: '16:00', durationMin: 90, deadline: d(11), progress: 70 }),
    t({ title: 'Academia', area: 'saude', date: d(1), start: '19:00', durationMin: 45 }),
    t({ title: 'Aula de inglês', area: 'pessoal', date: d(1), start: '20:00', durationMin: 60 }),
    t({ title: 'Proposta WomanTech', area: 'profissional', status: 'andamento', priority: 'alta', date: d(2), start: '17:00', durationMin: 90, deadline: d(16), progress: 40 }),
    t({ title: 'Estudar para as provas', area: 'academica', date: d(2), start: '19:00', durationMin: 120 }),
    t({ title: 'Pesquisa', area: 'academica', date: d(3), start: '16:00', durationMin: 120 }),
    t({ title: 'Aula de inglês', area: 'pessoal', date: d(3), start: '20:00', durationMin: 60 }),
    t({ title: 'Transferir R$ 300 p/ reserva', area: 'financeiro', priority: 'alta', date: d(4), start: '12:00', durationMin: 15 }),
    t({ title: 'Organizar documentos', area: 'adultices', status: 'adiada', date: d(4), start: '17:00', durationMin: 60, postponedCount: 1 }),
    t({ title: 'Revisão das provas', area: 'academica', date: d(4), start: '19:00', durationMin: 120 }),
    t({ title: 'Corrida no parque', area: 'saude', status: 'adiada', date: d(5), start: '08:00', durationMin: 30, postponedCount: 2 }),
    t({ title: 'Mackenzie', area: 'academica', date: d(5), start: '09:00', durationMin: 180 }),
    t({ title: 'Lazer', area: 'pessoal', date: d(5), start: '14:00', durationMin: 120 }),
    t({ title: 'Leitura livre', area: 'pessoal', date: d(5), start: '20:00', durationMin: 90 }),
    t({ title: 'Prova Mackenzie', area: 'academica', priority: 'alta', date: d(6), start: '08:00', durationMin: 240 }),
    t({ title: 'Almoço em família', area: 'pessoal', date: d(6), start: '12:00', durationMin: 120 }),
    t({ title: 'Tarde livre', area: 'pessoal', date: d(6), start: '15:00', durationMin: 180, soft: true }),
    // quadro
    t({ title: 'Extensão Mackenzie', area: 'academica', status: 'andamento', deadline: d(18), progress: 60 }),
    t({ title: 'Provas Mackenzie', area: 'academica', status: 'aguardando', deadline: d(6) }),
    t({ title: 'Resultado 42', area: 'profissional', status: 'aguardando', deadline: d(20) }),
    t({ title: 'Resposta de currículo', area: 'profissional', status: 'aguardando' }),
    t({ title: 'Aula de inglês · Danilo', area: 'pessoal', status: 'concluido', durationMin: 30, progress: 100, doneAt: today() }),
    t({ title: 'Recarregar Riocard', area: 'adultices', status: 'concluido', durationMin: 15, progress: 100, doneAt: today() }),
    t({ title: 'Preparar marmitas', area: 'pessoal', status: 'concluido', durationMin: 60, progress: 100, doneAt: today() }),
    // backlog
    t({ title: 'Revisar GEUX', area: 'academica', durationMin: 90 }),
    t({ title: 'Documentos', area: 'adultices', durationMin: 60 }),
    t({ title: 'Spring Boot', area: 'profissional', durationMin: 120 }),
  ];

  const imp = (title: string, area: AreaId, type: ImprevistoType, date: string, start: string, end: string, durationMin: number, postponed = false, demand?: string): Imprevisto => ({
    title, area, type, date, start, end, durationMin, postponedTasks: postponed, demand, createdAt: now,
  });

  const imprevistos: Imprevisto[] = [
    imp('Falta de internet', 'academica', 'Infraestrutura', d(0), '09:00', '10:00', 60),
    imp('Reunião extra · Antena 1', 'profissional', 'Trabalho', d(1), '14:00', '16:30', 150, true, 'Refazer a entrega do sprint'),
    imp('Consulta de última hora', 'saude', 'Saúde', d(3), '10:00', '12:00', 120),
    imp('Cartão bloqueado', 'adultices', 'Burocracia', d(4), '15:00', '16:00', 60, true),
    // semanas anteriores: a reunião extra de terça se repete e vira sugestão
    imp('Reunião extra na Antena 1', 'profissional', 'Trabalho', d(-6), '14:00', '16:00', 120),
    imp('Reunião extra', 'profissional', 'Trabalho', d(-13), '14:30', '16:30', 120),
    imp('Reunião extra na Antena 1', 'profissional', 'Trabalho', d(-20), '14:00', '15:30', 90),
    imp('Falta de internet', 'academica', 'Infraestrutura', d(-10), '19:00', '20:00', 60),
  ];

  const objectives = [
    { title: 'Estabilidade financeira', subtitle: 'R$ 6.000 até jun/2027', area: 'financeiro' as AreaId },
    { title: 'Vaga remota dev', subtitle: 'R$ 10k/mês até jun/2027', area: 'profissional' as AreaId },
    { title: 'Graduações com CR >= 8', subtitle: 'Mackenzie e Cruzeiro do Sul', area: 'academica' as AreaId },
    { title: 'Bem-estar e rotina', subtitle: 'sentir-me leve e forte', area: 'saude' as AreaId },
  ];

  const events: CalendarEvent[] = [
    ['Consulta de rotina', 5, 'saude', 'evento'],
    ['Provas Mackenzie', 6, 'academica', 'prazo'],
    ['Aluguel', 6, 'adultices', 'vencimento'],
    ['Aula de inglês', 7, 'pessoal', 'evento'],
    ['Caminhada', 7, 'saude', 'evento'],
    ['Cartão Nubank vence', 11, 'financeiro', 'vencimento'],
    ['VISA vence', 11, 'financeiro', 'vencimento'],
    ['Entrega GEUX', 11, 'academica', 'prazo'],
    ['Cartão Itaú vence', 13, 'financeiro', 'vencimento'],
    ['Almoço em família', 13, 'pessoal', 'evento'],
    ['Proposta WomanTech', 16, 'profissional', 'prazo'],
    ['Extensão Mackenzie', 18, 'academica', 'prazo'],
    ['Resultado 42', 20, 'profissional', 'prazo'],
    ['Entrega UFF', 21, 'academica', 'prazo'],
    ['Renovar documento', 31, 'adultices', 'vencimento'],
    ['Bootcamp Java', 54, 'profissional', 'prazo'],
  ].map(([title, off, area, kind]) => ({
    title: title as string, date: d(off as number), area: area as AreaId, kind: kind as CalendarEvent['kind'], source: 'local' as const,
  }));

  const docs: VaultDoc[] = [
    { name: 'RG e CPF.pdf', type: 'Documento', linkedTo: 'Pessoal', storage: 'arquivo', createdAt: now },
    { name: 'Contrato aluguel.pdf', type: 'Contrato', date: addDays(mon, -200), linkedTo: 'Moradia', storage: 'arquivo', createdAt: now },
    { name: 'Comprovante aluguel.pdf', type: 'Comprovante', date: addDays(mon, -24), linkedTo: 'Aluguel', value: 1200, storage: 'arquivo', createdAt: now },
    { name: 'Comprovante Nubank.pdf', type: 'Comprovante', date: addDays(mon, -19), linkedTo: 'Cartão Nubank', value: 450, storage: 'arquivo', createdAt: now },
    { name: 'Mensalidade Mackenzie', type: 'Comprovante', date: addDays(mon, -28), linkedTo: 'Faculdade', value: 650, storage: 'drive', driveUrl: 'https://drive.google.com/file/d/EXEMPLO/view', createdAt: now },
  ];

  await db.transaction('rw', [db.tasks, db.imprevistos, db.objectives, db.goals, db.events, db.docs, db.plans], async () => {
    await db.tasks.bulkAdd(tasks);
    await db.imprevistos.bulkAdd(imprevistos);
    const [fin, prof, acad, bem] = (await db.objectives.bulkAdd(objectives, { allKeys: true })) as number[];
    const g = (p: Omit<Goal, 'initial'> & { initial?: number }): Goal => ({ initial: 0, ...p });
    await db.goals.bulkAdd([
      g({ objectiveId: fin, title: 'Reserva', metric: 'valor', unit: 'R$', current: 2150, target: 6000, area: 'financeiro', kpi: true, deadline: '2027-06-30' }),
      g({ objectiveId: fin, title: 'Quitar Nubank', metric: 'valor', unit: 'R$', current: 171, target: 450, area: 'financeiro', kpi: true }),
      g({ objectiveId: fin, title: 'Quitar Itaú', metric: 'valor', unit: 'R$', current: 95, target: 380, area: 'financeiro', kpi: true }),
      g({ title: 'Guardar todo mês', metric: 'frequência', unit: 'meses', current: 3, target: 5, area: 'financeiro' }),
      g({ objectiveId: prof, title: 'Candidaturas', metric: 'tarefas', current: 5, target: 10, area: 'profissional', kpi: true }),
      g({ objectiveId: prof, title: 'Proposta WomanTech', metric: 'outro', unit: '%', current: 40, target: 100, area: 'profissional' }),
      g({ objectiveId: prof, title: 'Bootcamp Java', metric: 'outro', unit: '%', current: 30, target: 100, area: 'profissional', deadline: d(54) }),
      g({ title: 'Renda R$ 10k/mês', metric: 'valor', unit: 'R$', current: 3500, target: 10000, area: 'profissional', kpi: true, deadline: '2027-06-30' }),
      g({ objectiveId: acad, title: 'CR Mackenzie', metric: 'nota', current: 8.1, target: 8, area: 'academica', kpi: true }),
      g({ objectiveId: acad, title: 'CR Cruzeiro', metric: 'nota', current: 8.4, target: 8, area: 'academica', kpi: true }),
      g({ objectiveId: acad, title: 'Leitura', metric: 'páginas', unit: 'págs', current: 180, target: 500, area: 'academica', kpi: true }),
      g({ objectiveId: acad, title: 'GEUX triagem', metric: 'tarefas', current: 30, target: 50, area: 'academica' }),
      g({ title: 'Matemática', metric: 'nota', current: 7, target: 10, area: 'academica' }),
      g({ objectiveId: bem, title: 'Movimento', metric: 'frequência', unit: 'sessões', current: 1, target: 2, area: 'saude', kpi: true }),
      g({ objectiveId: bem, title: 'Sono', metric: 'horas', unit: 'h', current: 6, target: 8, area: 'saude', kpi: true }),
      g({ objectiveId: bem, title: 'Água', metric: 'frequência', unit: 'copos', current: 3, target: 8, area: 'saude', kpi: true }),
      g({ objectiveId: bem, title: 'Descanso', metric: 'frequência', unit: 'blocos', current: 2, target: 3, area: 'pessoal', kpi: true }),
      g({ title: 'Refeições', metric: 'frequência', unit: 'refeições', current: 2, target: 4, area: 'saude', kpi: true }),
      g({ title: 'Aulas de inglês', metric: 'frequência', unit: 'aulas', current: 1, target: 2, area: 'pessoal', kpi: true }),
      g({ title: 'Comprovantes vinculados', metric: 'tarefas', current: 5, target: 5, area: 'adultices', kpi: true }),
      g({ title: 'Documentos pessoais', metric: 'tarefas', current: 1, target: 1, area: 'adultices' }),
    ]);
    await db.events.bulkAdd(events);
    await db.docs.bulkAdd(docs);
    await db.plans.put({
      weekStart: addDays(mon, 7),
      hoursByArea: { academica: 18, profissional: 30, saude: 4, pessoal: 6, financeiro: 2, adultices: 3 },
      top3: [],
    });
  });
}
