import { useEffect } from 'react';
import { toMin, today } from './dates';
import type { Task } from './types';

/**
 * Avisos "X min antes": enquanto o app está aberto, confere a cada 30 s.
 * Mostra um aviso na tela e, se a pessoa permitiu, uma notificação do sistema.
 * (Sem servidor não há como avisar com o app fechado; isso fica para quando houver sincronização.)
 */
const SENT = 'cume.avisos';

export function useReminders(tasks: Task[], toast: (msg: string) => void) {
  useEffect(() => {
    const check = () => {
      const t0 = today();
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      let sent: string[] = [];
      try { sent = JSON.parse(sessionStorage.getItem(SENT) ?? '[]'); } catch { /* ok */ }
      for (const t of tasks) {
        if (!t.remindMin || !t.start || t.date !== t0 || t.status === 'concluido' || t.status === 'adiada') continue;
        const start = toMin(t.start);
        const key = `${t.id}@${t0}${t.start}`;
        if (nowMin >= start - t.remindMin && nowMin < start && !sent.includes(key)) {
          const msg = `Em ${start - nowMin} min: ${t.title} (${t.start})`;
          toast(msg);
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Cume°', { body: msg, icon: '/icons/cume-192.png' }); } catch { /* ok */ }
          sent.push(key);
        }
      }
      try { sessionStorage.setItem(SENT, JSON.stringify(sent.slice(-200))); } catch { /* ok */ }
    };
    check();
    const i = setInterval(check, 30_000);
    return () => clearInterval(i);
  }, [tasks, toast]);
}

/** pede permissão de notificação (só quando a pessoa liga um aviso) */
export function askNotify() {
  try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* ok */ }
}
