import { useState } from 'react';
import { Card } from './Card';
import { Empty } from './ui';
import { ddmm } from '../lib/dates';
import { punctuality, TOLERANCE_MIN } from '../lib/punctuality';
import type { Task } from '../lib/types';

// validados (dataviz validate_palette, modo escuro sobre --color-surface): faixa de luz, croma, daltonismo e contraste
const ON_TIME = '#3f7fd8';
const LATE = '#b8862b';

const sign = (m: number) => (m > 0 ? `+${m}` : `${m}`);

/** gráfico de pontualidade dos blocos com ponto: barra para cima = atraso, para baixo = chegou antes */
export function PunctualityCard({ tasks, from }: { tasks: Task[]; from?: string }) {
  const p = punctuality(tasks, from);
  const [table, setTable] = useState(false);
  if (!tasks.some((t) => t.clock && !t.deletedAt)) return null;
  const days = p.days.filter((d) => d.late != null).slice(-20);

  const W = 320, H = 150, padL = 26, padB = 18, top = 8;
  const max = Math.max(15, ...days.map((d) => Math.abs(d.late!)));
  const mid = top + (H - padB - top) / 2;
  const y = (m: number) => mid - (m / max) * ((H - padB - top) / 2);
  const slot = days.length ? (W - padL) / days.length : 0;
  const bw = Math.min(14, Math.max(4, slot - 2));

  return (
    <Card title="Pontualidade">
      <div className="row" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div><b style={{ fontSize: '1.875rem' }}>{p.recorded ? `${p.onTimePct}%` : '—'}</b> <span className="muted small">no horário (até {TOLERANCE_MIN} min)</span></div>
        <div className="small"><span className="muted">atraso médio </span><b>{p.avgLate ? `${p.avgLate} min` : '—'}</b></div>
        <div className="small"><span className="muted">saída </span><b>{p.days.some((d) => d.extra != null) ? `${sign(p.avgExtra)} min` : '—'}</b><span className="muted"> do fim, em média</span></div>
      </div>
      {days.length === 0 ? (
        <Empty>Clique no bloco do trabalho na Agenda e registre a chegada e a saída reais. O gráfico aparece aqui.</Empty>
      ) : table ? (
        <div className="list small" style={{ marginTop: 10, gap: 6 }}>
          {[...p.days].reverse().slice(0, 20).map((d) => (
            <div key={`${d.taskId}-${d.date}`} className="row" style={{ gap: 10 }}>
              <b style={{ width: 44 }}>{ddmm(d.date)}</b>
              <span>chegou {d.in ?? '—'} <span className="muted">({d.late != null ? `${sign(d.late)} min` : '—'})</span></span>
              <span className="right">saiu {d.out ?? '—'} <span className="muted">({d.extra != null ? `${sign(d.extra)} min` : '—'})</span></span>
            </div>
          ))}
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', marginTop: 10 }} role="img"
          aria-label={`Chegada em relação ao horário, últimos ${days.length} dias: ${p.onTimePct}% no horário`}>
          {[max, 0, -max].map((m) => (
            <g key={m}>
              <line x1={padL} x2={W} y1={y(m)} y2={y(m)} stroke={m === 0 ? '#5b6385' : '#2a3150'} strokeDasharray={m === 0 ? undefined : '2 4'} />
              <text x={padL - 4} y={y(m) + 3} textAnchor="end" fontSize="9" fill="#9198b4">{sign(Math.round(m))}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const late = d.late! > TOLERANCE_MIN;
            const x = padL + i * slot + (slot - bw) / 2;
            const v = d.late === 0 ? 0.5 : d.late!;
            const y0 = Math.min(y(0), y(v)), h = Math.max(2, Math.abs(y(v) - y(0)));
            return (
              <g key={`${d.taskId}-${d.date}`}>
                <rect x={padL + i * slot} y={top} width={slot} height={H - padB - top} fill="transparent">
                  <title>{`${ddmm(d.date)} · chegou ${d.in} (${sign(d.late!)} min)${d.out ? ` · saiu ${d.out} (${sign(d.extra!)} min)` : ''}`}</title>
                </rect>
                <rect x={x} y={y0} width={bw} height={h} rx="2" fill={late ? LATE : ON_TIME} pointerEvents="none" />
                {(days.length <= 10 || i % 2 === days.length % 2) && (
                  <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#9198b4">{d.date.slice(8)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="row small" style={{ gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 5 }}><span className="dotc" style={{ background: ON_TIME }} />no horário ou antes</span>
        <span className="row" style={{ gap: 5 }}><span className="dotc" style={{ background: LATE }} />atraso (acima de {TOLERANCE_MIN} min)</span>
        {days.length > 0 && <button className="btn sm ghost right" onClick={() => setTable(!table)}>{table ? 'ver gráfico' : 'ver tabela'}</button>}
      </div>
    </Card>
  );
}
