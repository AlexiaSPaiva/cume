import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { findRecurring, type RecurringSuggestion } from './recurrence';
import type { CalendarEvent, Goal, Imprevisto, Objective, Settings, SuggestionState, Task, VaultDoc, WeekPlan } from './types';

export interface Data {
  settings: Settings;
  tasks: Task[];
  imprevistos: Imprevisto[];
  objectives: Objective[];
  goals: Goal[];
  events: CalendarEvent[];
  docs: VaultDoc[];
  plans: WeekPlan[];
  suggestionStates: SuggestionState[];
  suggestions: RecurringSuggestion[];
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ settings, children }: { settings: Settings; children: ReactNode }) {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const imprevistos = useLiveQuery(() => db.imprevistos.toArray(), []);
  const objectives = useLiveQuery(() => db.objectives.toArray(), []);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);
  const docs = useLiveQuery(() => db.docs.toArray(), []);
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const suggestionStates = useLiveQuery(() => db.suggestions.toArray(), []);

  const suggestions = useMemo(
    () => (imprevistos && suggestionStates && tasks ? findRecurring(imprevistos, suggestionStates, tasks, settings.recurrenceThreshold) : []),
    [imprevistos, suggestionStates, tasks, settings.recurrenceThreshold],
  );

  if (!tasks || !imprevistos || !objectives || !goals || !events || !docs || !plans || !suggestionStates) return null;
  return (
    <Ctx.Provider value={{ settings, tasks, imprevistos, objectives, goals, events, docs, plans, suggestionStates, suggestions }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData fora do DataProvider');
  return v;
}
