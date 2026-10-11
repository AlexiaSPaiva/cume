import { useEffect } from 'react';
import type { Data } from './data';
import { addDays, ddmm, dow, toMin, today } from './dates';

/**
 * Avisos enquanto o app está aberto (confere a cada 30 s):
 * - "X min antes" de tarefas e blocos de estudo;
 * - estudos: resumo da noite (22:00) e prazos do edital (7 dias, 1 dia e 3 h antes);
 * - "Silenciar no trabalho": seg–sex 09–16 só passam os urgentes (prazos do edital).
 * Mostra um aviso na tela e, se a pessoa permitiu, uma notificação do sistema.
 * Sem servidor não há aviso com o app fechado nem por e-mail.
 */
const SENT = 'cume.avisos';

type RD = Pick<Data, 'tasks' | 'settings' | 'tracks' | 'trackDates'>;

export function dueReminders(d: RD, now: Date, sent: string[]): { key: string; msg: string; urgent: boolean }[] {
  const out: { key: string; msg: string; urgent: boolean }[] = [];
  const t0 = today();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const st = d.settings.study ?? {};
  for (const t of d.tasks) {
    const remind = t.remindMin ?? (t.trackId != null && st.blockStart !== false ? st.remindMin ?? 10 : undefined);
    if (!remind || !t.start || t.date !== t0 || t.status === 'concluido' || t.status === 'adiada') continue;
    const start = toMin(t.start);
    const key = `${t.id}@${t0}${t.start}`;
    if (nowMin >= start - remind && nowMin < start && !sent.includes(key)) out.push({ key, msg: `Em ${start - nowMin} min: ${t.title} (${t.start})`, urgent: false });
  }
  // prazos do edital (trilhas com alertas): 7 dias, 1 dia e 3 horas antes
  if (st.deadlines !== false) {
    for (const x of d.trackDates.filter((x) => x.alert)) {
      const tr = d.tracks.find((t) => t.id === x.trackId);
      const at = x.time ? toMin(x.time) : 8 * 60;
      for (const [k, label, when] of [['7d', 'em 7 dias', addDays(x.date, -7)], ['1d', 'amanhã', addDays(x.date, -1)]] as const) {
        const key = `${x.id}@${k}`;
        if (when === t0 && nowMin >= 8 * 60 && !sent.includes(key)) out.push({ key, msg: `${tr?.title ?? 'Edital'}: ${x.label} ${label} (${ddmm(x.date)})`, urgent: true });
      }
      const key3 = `${x.id}@3h`;
      if (x.date === t0 && nowMin >= at - 180 && nowMin < at && !sent.includes(key3)) out.push({ key: key3, msg: `${tr?.title ?? 'Edital'}: ${x.label} hoje às ${x.time ?? '08:00'}`, urgent: true });
    }
  }
  // resumo da noite: o que ficou para amanhã
  if (st.nightly && nowMin >= 22 * 60) {
    const key = `noite@${t0}`;
    const tomorrow = d.tasks.filter((t) => t.trackId != null && t.date === addDays(t0, 1) && t.status !== 'concluido');
    if (!sent.includes(key)) out.push({ key, msg: tomorrow.length ? `Amanhã: ${tomorrow.length} ${tomorrow.length === 1 ? 'bloco' : 'blocos'} de estudo (${tomorrow.map((t) => t.start).filter(Boolean).join(', ')})` : 'Amanhã não há blocos de estudo marcados.', urgent: false });
  }
  // silenciar no trabalho: seg–sex 09–16 só o que é urgente
  const quiet = st.quiet !== false && dow(t0) >= 1 && dow(t0) <= 5 && nowMin >= 9 * 60 && nowMin < 16 * 60;
  return quiet ? out.filter((x) => x.urgent || !d.tasks.some((t) => t.trackId != null && x.key.startsWith(`${t.id}@`))) : out;
}

export function useReminders(d: RD, toast: (msg: string) => void) {
  useEffect(() => {
    const check = () => {
      let sent: string[] = [];
      try { sent = JSON.parse(sessionStorage.getItem(SENT) ?? '[]'); } catch { /* ok */ }
      for (const r of dueReminders(d, new Date(), sent)) {
        toast(r.msg);
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Cume°', { body: r.msg, icon: '/icons/cume-192.png' }); } catch { /* ok */ }
        sent.push(r.key);
      }
      try { sessionStorage.setItem(SENT, JSON.stringify(sent.slice(-300))); } catch { /* ok */ }
    };
    check();
    const i = setInterval(check, 30_000);
    return () => clearInterval(i);
  }, [d, toast]);
}

/** pede permissão de notificação (só quando a pessoa liga um aviso) */
export function askNotify() {
  try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* ok */ }
}
