import { db } from './db';
import { addDays, iso, today } from './dates';
import type { AreaId, CalendarEvent } from './types';

/**
 * Sincronização (somente leitura) com o Google Calendar pelo navegador.
 * Precisa de um OAuth Client ID do tipo "Aplicativo da Web" criado no Google Cloud,
 * com a origem do app (ex.: http://localhost:5173) autorizada.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void }): {
            requestAccessToken(o?: { prompt?: string }): void;
          };
        };
      };
    };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
let token: string | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Não foi possível carregar o login do Google (sem internet?).'));
    document.head.appendChild(s);
  });
}

export async function connectGoogle(clientId: string): Promise<void> {
  await loadGis();
  token = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error ?? 'Autorização negada'))),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export function isConnected() {
  return token != null;
}

async function api<T>(path: string): Promise<T> {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Google respondeu ${r.status}`);
  return r.json();
}

export interface GCal { id: string; summary: string; backgroundColor?: string; primary?: boolean }

export async function listCalendars(): Promise<GCal[]> {
  const j = await api<{ items: GCal[] }>('users/me/calendarList');
  return j.items ?? [];
}

/** importa os próximos 60 dias dos calendários escolhidos para a área indicada */
export async function syncCalendars(cals: { id: string; name: string; area: AreaId }[]): Promise<number> {
  const timeMin = new Date(`${addDays(today(), -7)}T00:00:00`).toISOString();
  const timeMax = new Date(`${addDays(today(), 60)}T23:59:59`).toISOString();
  let n = 0;
  for (const c of cals) {
    const j = await api<{ items: { id: string; summary?: string; start: { date?: string; dateTime?: string } }[] }>(
      `calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${timeMin}&timeMax=${timeMax}`,
    );
    const events: CalendarEvent[] = (j.items ?? []).map((e) => {
      const dt = e.start.dateTime ? new Date(e.start.dateTime) : null;
      return {
        title: e.summary ?? '(sem título)',
        date: dt ? iso(dt) : e.start.date!,
        start: dt ? dt.toTimeString().slice(0, 5) : undefined,
        area: c.area,
        kind: 'evento',
        source: 'google',
        calendarName: c.name,
        externalId: `${c.id}:${e.id}`,
      };
    });
    // atualiza pelo id do Google (externalId); nunca apaga eventos locais
    await db.transaction('rw', db.events, async () => {
      for (const ev of events) {
        const cur = await db.events.where('externalId').equals(ev.externalId!).first();
        if (cur) await db.events.update(cur.id!, ev as Partial<typeof ev> as never);
        else await db.events.add(ev);
      }
    });
    n += events.length;
  }
  return n;
}
