import type { CalendarEvent, Task } from './types';

/**
 * Agenda do Cume em formato de calendário (iCalendar), com alarmes (VALARM), para o celular assinar.
 * Horários no fuso de São Paulo; blocos semanais viram uma regra de repetição (RRULE), não centenas de eventos.
 */
const TZ = 'America/Sao_Paulo';
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const d8 = (date: string) => date.replace(/-/g, '');
const t6 = (hhmm: string) => `${hhmm.replace(':', '')}00`;
const addMin = (hhmm: string, m: number) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + m;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const dayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function alarm(trigger: string, text: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

export function buildIcs(tasks: Task[], events: CalendarEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const today = now.toISOString().slice(0, 10);
  const out: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cume//Agenda//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Cume°', `X-WR-TIMEZONE:${TZ}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];

  for (const t of tasks) {
    if (t.deletedAt || t.status === 'concluido' || !t.start || !t.date) continue;
    const dur = Math.max(5, t.durationMin ?? 30);
    const weekly = !!t.repeatDays?.length;
    if (weekly && t.repeatUntil && t.repeatUntil < today) continue;
    if (!weekly && t.date < plusDays(today, -1)) continue;
    // a primeira ocorrência tem de cair num dos dias da regra
    let first = t.date;
    if (weekly) for (let i = 0; i < 7 && !t.repeatDays!.includes(dayOf(first)); i++) first = plusDays(first, 1);
    const end = addMin(t.start, dur);
    const endDate = end < t.start ? plusDays(first, 1) : first;
    out.push('BEGIN:VEVENT', `UID:task-${t.id}@cume`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${d8(first)}T${t6(t.start)}`, `DTEND;TZID=${TZ}:${d8(endDate)}T${t6(end)}`,
      `SUMMARY:${esc(t.title)}`);
    if (weekly) {
      out.push(`RRULE:FREQ=WEEKLY;BYDAY=${t.repeatDays!.map((x) => DAYS[x]).join(',')}${t.repeatUntil ? `;UNTIL=${d8(t.repeatUntil)}T235959Z` : ''}`);
      // dias já marcados como feitos não tocam
      for (const dd of t.doneDates ?? []) if (dd >= today) out.push(`EXDATE;TZID=${TZ}:${d8(dd)}T${t6(t.start)}`);
    }
    if (!t.soft) out.push(...alarm(`-PT${t.remindMin ?? 10}M`, t.title));
    out.push('END:VEVENT');
  }

  for (const e of events) {
    if (e.deletedAt || e.source === 'google') continue;
    if (!e.repeat && e.date < plusDays(today, -1)) continue;
    const title = e.kind === 'prazo' ? `Prazo: ${e.title}` : e.kind === 'vencimento' ? `Vence: ${e.title}` : e.title;
    out.push('BEGIN:VEVENT', `UID:event-${e.id}@cume`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(title)}`);
    if (e.start && e.kind !== 'vencimento') {
      out.push(`DTSTART;TZID=${TZ}:${d8(e.date)}T${t6(e.start)}`, `DTEND;TZID=${TZ}:${d8(e.date)}T${t6(e.start >= '23:00' ? e.start : addMin(e.start, 60))}`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(plusDays(e.date, 1))}`);
    }
    if (e.repeat === 'mensal') out.push(`RRULE:FREQ=MONTHLY${e.repeatUntil ? `;UNTIL=${d8(e.repeatUntil)}T235959Z` : ''}`);
    if (e.kind === 'prazo') out.push(...alarm('-P1D', `Amanhã: ${e.title}`), ...alarm(e.start ? '-PT3H' : 'PT9H', `Hoje: ${e.title}`));
    else if (e.kind === 'vencimento') out.push(...alarm('-PT15H', `Amanhã vence: ${e.title}`), ...alarm('PT9H', `Vence hoje: ${e.title}`));
    else out.push(...alarm(e.start ? '-PT30M' : 'PT8H', e.title));
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  // linhas longas são dobradas a cada 73 caracteres (regra do formato)
  return out.map((l) => (l.length > 73 ? l.match(/.{1,73}/g)!.join('\r\n ') : l)).join('\r\n') + '\r\n';
}
