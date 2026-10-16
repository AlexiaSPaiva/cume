import { describe, expect, it } from 'vitest';
import { buildIcs } from '../../src/lib/ics';
import type { CalendarEvent, Task } from '../../src/lib/types';

const now = new Date('2026-10-16T12:00:00Z');
const task = (x: Partial<Task>): Task => ({ id: 1, title: 'Bloco', area: 'academica', status: 'afazer', priority: 'media', ...x });
const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('calendário para o celular (ics)', () => {
  it('bloco semanal vira RRULE com alarme e pula os dias já feitos', () => {
    const ics = unfold(buildIcs([task({ date: '2026-10-16', start: '19:00', durationMin: 150, repeatDays: [1, 5], repeatUntil: '2026-11-22', doneDates: ['2026-10-16'] })], [], now));
    expect(ics).toContain('DTSTART;TZID=America/Sao_Paulo:20261016T190000');
    expect(ics).toContain('DTEND;TZID=America/Sao_Paulo:20261016T213000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20261122T235959Z');
    expect(ics).toContain('EXDATE;TZID=America/Sao_Paulo:20261016T190000');
    expect(ics).toContain('TRIGGER:-PT10M');
  });

  it('primeira ocorrência cai num dia da regra; feitas, sem horário e antigas ficam de fora', () => {
    const ics = unfold(buildIcs([
      task({ id: 2, date: '2026-10-16', start: '09:00', repeatDays: [2] }),
      task({ id: 3, date: '2026-10-20', start: '10:00', status: 'concluido' }),
      task({ id: 4, date: '2026-10-20' }),
      task({ id: 5, date: '2026-10-01', start: '10:00' }),
    ], [], now));
    expect(ics).toContain('UID:task-2@cume');
    expect(ics).toContain('DTSTART;TZID=America/Sao_Paulo:20261020T090000');
    expect(ics).not.toContain('task-3@');
    expect(ics).not.toContain('task-4@');
    expect(ics).not.toContain('task-5@');
  });

  it('prazos avisam na véspera; contas mensais repetem e avisam no dia', () => {
    const ev: CalendarEvent[] = [
      { id: 7, title: 'Hardware · A5', date: '2026-10-19', start: '23:59', area: 'academica', kind: 'prazo', source: 'local' },
      { id: 8, title: 'Aluguel', date: '2026-10-20', area: 'financeiro', kind: 'vencimento', source: 'local', repeat: 'mensal' },
    ];
    const ics = unfold(buildIcs([], ev, now));
    expect(ics).toContain('SUMMARY:Prazo: Hardware · A5');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261020');
    expect(ics).toContain('RRULE:FREQ=MONTHLY');
    expect(ics).toContain('TRIGGER:PT9H');
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
  });
});
