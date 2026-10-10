import { useData } from '../lib/data';
import { db } from '../lib/db';
import { addDays, DOW_LONG, dur, today } from '../lib/dates';
import { AREA } from '../lib/areas';
import { useUI } from './Overlays';
import { Icon } from './ui';

/** cartões de "imprevisto recorrente: incluir no planejamento?" */
export function SuggestionBanner({ limit }: { limit?: number }) {
  const { suggestions } = useData();
  const ui = useUI();
  if (!suggestions.length) return null;
  return (
    <div className="list" id="sugestoes" style={{ gap: 12 }}>
      {suggestions.slice(0, limit).map((s) => (
        <div key={s.key} className="suggest">
          <div className="ic"><Icon name="repeat" size={18} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>“{s.label}” virou rotina: {s.count}x nos últimos 30 dias</h3>
            <p>
              Somou {dur(s.totalMin)} fora do plano em {AREA[s.area].name}
              {s.weekdayStrong ? `, quase sempre às ${DOW_LONG[s.weekday]}s por volta das ${s.start}` : ''}.
              Sugestão: reservar {dur(s.avgMin)} {s.weekdayStrong ? `toda ${DOW_LONG[s.weekday]}` : 'por semana'} no seu planejamento.
            </p>
            <div className="actions">
              <button className="btn gold sm" onClick={() => ui.openSuggestion(s)}>Incluir no planejamento</button>
              <button className="btn sm ghost" onClick={async () => {
                await db.suggestions.put({ key: s.key, status: 'dispensada', until: addDays(today(), 30) });
                ui.toast('Ok, não vou sugerir isso pelos próximos 30 dias.');
              }}>Agora não</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
