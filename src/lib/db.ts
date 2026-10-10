import Dexie, { type EntityTable } from 'dexie';
import type {
  Account, CalendarEvent, Goal, GoalRecord, Imprevisto, Objective, Settings, SuggestionState, Task, VaultDoc, WeekPlan,
} from './types';

export const db = new Dexie('meuplano') as Dexie & {
  tasks: EntityTable<Task, 'id'>;
  imprevistos: EntityTable<Imprevisto, 'id'>;
  objectives: EntityTable<Objective, 'id'>;
  goals: EntityTable<Goal, 'id'>;
  records: EntityTable<GoalRecord, 'id'>;
  events: EntityTable<CalendarEvent, 'id'>;
  docs: EntityTable<VaultDoc, 'id'>;
  plans: EntityTable<WeekPlan, 'weekStart'>;
  settings: EntityTable<Settings, 'id'>;
  account: EntityTable<Account, 'email'>;
  suggestions: EntityTable<SuggestionState, 'key'>;
};

db.version(1).stores({
  tasks: '++id, area, status, date, deadline',
  imprevistos: '++id, area, date, type',
  objectives: '++id, area',
  goals: '++id, objectiveId, area',
  records: '++id, goalId, date',
  events: '++id, date, area, kind, source, externalId',
  docs: '++id, type, date',
  plans: 'weekStart',
  settings: 'id',
  account: 'email',
  suggestions: 'key',
});

export async function clearAllData() {
  await db.transaction('rw', [db.tasks, db.imprevistos, db.objectives, db.goals, db.records, db.events, db.docs, db.plans, db.suggestions], async () => {
    await Promise.all([
      db.tasks.clear(), db.imprevistos.clear(), db.objectives.clear(), db.goals.clear(), db.records.clear(),
      db.events.clear(), db.docs.clear(), db.plans.clear(), db.suggestions.clear(),
    ]);
  });
}

/** registra um valor real numa meta e atualiza o progresso */
export async function addRecord(goalId: number, value: number, note?: string, date = new Date().toISOString().slice(0, 10)) {
  await db.transaction('rw', db.records, db.goals, async () => {
    await db.records.add({ goalId, value, note, date });
    const g = await db.goals.get(goalId);
    if (g) await db.goals.update(goalId, { current: g.current + value });
  });
}
