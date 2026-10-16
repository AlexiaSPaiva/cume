import { buildIcs } from '../src/lib/ics';
import type { CalendarEvent, Task } from '../src/lib/types';

/**
 * GET /api/agenda?t=<token> → calendário (.ics) da pessoa dona do token, para o celular assinar (webcal://).
 * Lê pela função feed_rows do Supabase (só tarefas e eventos daquele token) com a chave pública.
 */
export default {
  async fetch(req: Request): Promise<Response> {
    const t = new URL(req.url).searchParams.get('t') ?? '';
    if (!/^[a-f0-9]{32,}$/.test(t)) return new Response('link inválido', { status: 400 });
    const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/[^!-~]/g, '');
    const key = (process.env.VITE_SUPABASE_ANON_KEY ?? '').replace(/[^!-~]/g, '');
    const r = await fetch(`${url}/rest/v1/rpc/feed_rows`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ t }),
    });
    if (!r.ok) return new Response('indisponível', { status: 502 });
    const rows = (await r.json()) as { tbl: string; data: unknown }[];
    if (!rows.length) return new Response('link não encontrado', { status: 404 });
    const ics = buildIcs(
      rows.filter((x) => x.tbl === 'tasks').map((x) => x.data as Task),
      rows.filter((x) => x.tbl === 'events').map((x) => x.data as CalendarEvent),
    );
    return new Response(ics, {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900', 'Content-Disposition': 'inline; filename="cume.ics"' },
    });
  },
};
