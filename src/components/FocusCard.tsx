import { Card } from './Card';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AREAS } from '../lib/areas';
import { useData } from '../lib/data';
import { addDays, ddmm, today, weekStart } from '../lib/dates';
import { planHours, toPercents } from '../lib/derive';
import { AreaDot, Donut } from './ui';

type Which = 'esta' | 'proxima';
// nome histórico, não alterar: guarda os dados da usuária
const KEY = 'meuplano.focusWeek';

/**
 * Foco por área = a fatia de cada área nas horas que você planejou para a semana.
 * Muda na hora quando você ajusta o Planejamento (− / +) ou agenda blocos.
 * O foco desejado (Personalizar) aparece ao lado como referência.
 */
export function FocusCard() {
  const d = useData();
  const cur = weekStart(today());
  const next = addDays(cur, 7);
  const [which, setWhich] = useState<Which>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'esta' || saved === 'proxima') return saved;
    } catch { /* ignore */ }
    // se você já está planejando a semana que vem, mostra ela
    return d.plans.some((p) => p.weekStart === next) ? 'proxima' : 'esta';
  });
  const pick = (w: Which) => {
    setWhich(w);
    try { localStorage.setItem(KEY, w); } catch { /* ignore */ }
  };

  const ws = which === 'esta' ? cur : next;
  const { hours, source } = planHours(d, ws);
  const pct = toPercents(hours);
  const total = Object.values(hours).reduce((a, b) => a + b, 0);
  const desired = d.settings.desiredFocus;

  return (
    <Card title="Foco por área">
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <span className="seg" role="tablist" aria-label="Semana">
          <button role="tab" aria-selected={which === 'esta'} className={which === 'esta' ? 'on' : ''} onClick={() => pick('esta')}>Esta semana</button>
          <button role="tab" aria-selected={which === 'proxima'} className={which === 'proxima' ? 'on' : ''} onClick={() => pick('proxima')}>Próxima</button>
        </span>
        <span className="muted small">
          {source === 'planejamento' ? 'do seu Planejamento' : source === 'agenda' ? 'dos blocos agendados' : 'nada planejado ainda'}
          {' · '}{ddmm(ws)} – {ddmm(addDays(ws, 6))}
        </span>
      </div>
      {total === 0 ? (
        <div className="empty">
          Nenhuma hora planejada nesta semana. <Link to="/planejamento" style={{ color: 'var(--accent)' }}>Planejar agora ›</Link>
        </div>
      ) : (
        <div className="row" style={{ gap: 22, flexWrap: 'wrap' }}>
          <Donut size={132} data={AREAS.map((a) => ({ value: pct[a.id], color: a.color }))}
            center={<span className="small" style={{ lineHeight: 1.2 }}><b style={{ fontSize: '1.125rem' }}>{total}h</b><br /><span className="muted">planejadas</span></span>} />
          <div className="list fa-list" style={{ flex: 1, minWidth: '9rem', gap: 6 }}>
            {AREAS.map((a) => {
              const diff = pct[a.id] - desired[a.id];
              const off = Math.abs(diff) >= 5;
              return (
                <div key={a.id} className="row small" style={{ alignItems: 'flex-start' }} title={`${hours[a.id]}h planejadas · foco desejado ${desired[a.id]}%`}>
                  <AreaDot area={a.id} />
                  <span style={{ flex: 1, minWidth: 0, marginTop: -3 }}>
                    {a.name}
                    <span className="faint" style={{ display: 'block', fontSize: '0.6875rem' }}>
                      {off && <span style={{ color: diff < 0 ? 'var(--bad)' : 'var(--warn)' }}>{diff < 0 ? '▼' : '▲'} </span>}
                      desejado {desired[a.id]}% · {hours[a.id]}h
                    </span>
                    {/* só no modo foco: barra do planejado com o traço do desejado */}
                    <span className="fa-bar" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, pct[a.id])}%`, background: a.color }} />
                      <em style={{ left: `${Math.min(100, desired[a.id])}%` }} />
                    </span>
                  </span>
                  <b style={{ marginTop: -3 }}>{pct[a.id]}%</b>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Link to="/planejamento" className="add-link" style={{ display: 'inline-block', marginTop: 10, textDecoration: 'none' }}>Ajustar no Planejamento ›</Link>
    </Card>
  );
}
