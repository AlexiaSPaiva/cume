import { addDays, today } from './dates';
import { db } from './db';
import type { CalendarEvent } from './types';

/**
 * Vencimentos das contas (aluguel, cartão, luz…). Cada conta é um evento do tipo "vencimento";
 * com `repeat: 'mensal'` ele vale todo mês no mesmo dia (dia 31 em fevereiro → último dia do mês).
 * As ocorrências são calculadas na hora: aparecem no Calendário geral, no Financeiro e nos avisos de prazo.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate(); // m = 1..12

/** a data do vencimento no mês `ym` (AAAA-MM) */
export function dueIn(seriesDate: string, ym: string): string {
  const day = Number(seriesDate.slice(8, 10));
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(Math.min(day, lastDay(y, m)))}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/** troca cada conta mensal pelas ocorrências entre `from` e `to` (as outras ficam como estão) */
export function expandEvents(events: CalendarEvent[], from = addDays(today(), -120), to = addDays(today(), 730)): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const e of events) {
    if (e.repeat !== 'mensal') { out.push(e); continue; }
    const end = e.repeatUntil && e.repeatUntil < to ? e.repeatUntil : to;
    for (let ym = e.date.slice(0, 7); ym <= end.slice(0, 7); ym = nextMonth(ym)) {
      const date = dueIn(e.date, ym);
      if (date < e.date || date < from || date > end) continue;
      out.push({ ...e, date, seriesDate: e.date });
    }
  }
  return out;
}

export const isPaid = (e: CalendarEvent) => !!e.paid?.includes(e.date);

/** marca/desmarca o vencimento daquela data como pago */
export async function togglePaid(e: CalendarEvent): Promise<boolean> {
  if (!e.id) return false;
  const cur = await db.events.get(e.id);
  if (!cur) return false;
  const on = !cur.paid?.includes(e.date);
  await db.events.update(e.id, { paid: on ? [...(cur.paid ?? []), e.date].sort() : (cur.paid ?? []).filter((x) => x !== e.date) });
  return on;
}

export const brlShort = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v % 1 ? 2 : 0 });
