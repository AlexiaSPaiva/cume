import { useEffect, useRef, useState } from 'react';
import { useData } from '../lib/data';
import { db } from '../lib/db';
import { fromMin, today } from '../lib/dates';
import { reviewDates } from '../lib/study';
import type { Task, Track } from '../lib/types';

/** configurações de estudo (alarmes e pomodoro) com padrões */
export function studyPrefs(s: { study?: StudyPrefs }): Required<StudyPrefs> {
  return { blockStart: true, remindMin: 10, review: true, pomodoro: true, focusMin: 50, breakMin: 10, nightly: false, deadlines: true, quiet: true, showInAgenda: true, ...s.study };
}
export interface StudyPrefs {
  blockStart?: boolean; remindMin?: number; review?: boolean; pomodoro?: boolean; focusMin?: number; breakMin?: number;
  nightly?: boolean; deadlines?: boolean; quiet?: boolean; showInAgenda?: boolean;
}

const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/**
 * Sessão de estudo ("▶ Estudar agora"): pomodoro (foco/pausa) com Pausar e Concluir.
 * Concluir registra a sessão na Agenda (o bloco planejado de hoje, ou um bloco novo já concluído),
 * lança as questões e, se houver tópico, marca como estudado e agenda as revisões 24h, 7 e 30 dias.
 */
export function StudyTimer({ track, block, onDone }: { track: Track; block?: Task; onDone: (msg?: string) => void }) {
  const d = useData();
  const prefs = studyPrefs(d.settings);
  const subs = d.subjects.filter((s) => s.trackId === track.id);
  const [subjectId, setSubjectId] = useState<number | ''>(block?.subjectId ?? '');
  const [topicId, setTopicId] = useState<number | ''>(block?.topicId ?? '');
  const topics = d.topics.filter((t) => t.subjectId === subjectId);
  const [running, setRunning] = useState(true);
  const [phase, setPhase] = useState<'foco' | 'pausa'>('foco');
  const [focusMs, setFocusMs] = useState(0);
  const [phaseMs, setPhaseMs] = useState(0);
  const [q, setQ] = useState({ total: '', correct: '' });
  const startedAt = useRef(new Date());
  const last = useRef(Date.now());

  useEffect(() => {
    const i = setInterval(() => {
      const now = Date.now();
      const dt = now - last.current;
      last.current = now;
      if (!running) return;
      setPhaseMs((p) => p + dt);
      if (phase === 'foco') setFocusMs((f) => f + dt);
    }, 500);
    return () => clearInterval(i);
  }, [running, phase]);

  // troca foco ↔ pausa no tempo do pomodoro
  const phaseLen = (phase === 'foco' ? prefs.focusMin : prefs.breakMin) * 60_000;
  useEffect(() => {
    if (!prefs.pomodoro || phaseMs < phaseLen) return;
    const next = phase === 'foco' ? 'pausa' : 'foco';
    setPhase(next);
    setPhaseMs(0);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Cume°', { body: next === 'pausa' ? `Pausa de ${prefs.breakMin} min` : 'Volta ao foco' }); } catch { /* ok */ }
  }, [phaseMs, phaseLen, phase, prefs.pomodoro, prefs.breakMin]);

  async function finish() {
    const min = Math.max(1, Math.round(focusMs / 60_000));
    const t0 = today();
    const start = fromMin(startedAt.current.getHours() * 60 + startedAt.current.getMinutes());
    const subject = subs.find((s) => s.id === subjectId);
    const topic = d.topics.find((t) => t.id === topicId);
    await db.transaction('rw', [db.tasks, db.topics, db.questionLogs], async () => {
      if (block?.id) {
        await db.tasks.update(block.id, { status: 'concluido', doneAt: t0, durationMin: min, subjectId: subjectId || block.subjectId, topicId: topicId || block.topicId });
      } else {
        await db.tasks.add({
          title: `${track.title}${subject ? ` · ${subject.name}` : ''}`, area: 'academica', status: 'concluido', priority: 'media',
          date: t0, start, durationMin: min, doneAt: t0, trackId: track.id, subjectId: subjectId || undefined, topicId: topicId || undefined,
        });
      }
      const total = Number(q.total), correct = Number(q.correct);
      if (subjectId && total > 0) await db.questionLogs.add({ subjectId, topicId: topicId || undefined, date: t0, total, correct: Math.min(total, Math.max(0, correct || 0)) });
      if (topic) {
        if (topic.status === 'todo' || topic.status === 'studying') await db.topics.update(topic.id!, { status: 'studied', nextReviewAt: reviewDates(t0)[0] });
        if (prefs.review) {
          for (const date of reviewDates(t0)) {
            await db.tasks.add({
              title: `Revisão · ${topic.name}`, area: 'academica', status: 'afazer', priority: 'media', date, start: '07:00', durationMin: 30,
              trackId: track.id, subjectId: subject?.id, topicId: topic.id, reviewOf: topic.id, remindMin: prefs.blockStart ? prefs.remindMin : undefined,
            });
          }
        }
      }
    });
    onDone(`Sessão registrada: ${min} min de ${track.title}.${topic && prefs.review ? ' Revisões em 24h, 7 e 30 dias na Agenda.' : ''}`);
  }

  return (
    <div className="form study-timer">
      <div className="timer" aria-live="polite">
        <span className={`phase ${phase}`}>{phase === 'foco' ? 'Foco' : 'Pausa'}</span>
        <b className="clock-big">{prefs.pomodoro ? mmss(phaseLen - phaseMs) : mmss(focusMs)}</b>
        <span className="muted small">{prefs.pomodoro ? `pomodoro ${prefs.focusMin}/${prefs.breakMin}` : 'cronômetro'} · {Math.round(focusMs / 60_000)} min de foco</span>
      </div>
      {subs.length > 0 && (
        <div className="cols">
          <label className="field"><span>{track.type === 'exam' ? 'Matéria' : track.type === 'degree' ? 'Disciplina' : 'Módulo'}</span>
            <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value ? Number(e.target.value) : ''); setTopicId(''); }}>
              <option value="">—</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Tópico</span>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : '')} disabled={!topics.length}>
              <option value="">—</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      )}
      {track.type === 'exam' && subjectId !== '' && (
        <div className="cols">
          <label className="field"><span>Questões feitas</span><input inputMode="numeric" value={q.total} onChange={(e) => setQ({ ...q, total: e.target.value })} /></label>
          <label className="field"><span>Acertos</span><input inputMode="numeric" value={q.correct} onChange={(e) => setQ({ ...q, correct: e.target.value })} /></label>
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn gold big" style={{ flex: 1 }} onClick={() => setRunning((r) => !r)}>{running ? 'Pausar' : 'Retomar'}</button>
        <button type="button" className="btn out big" style={{ flex: 1 }} onClick={() => void finish()}>Concluir</button>
      </div>
      <button type="button" className="btn ghost sm" onClick={() => onDone()}>Cancelar sem registrar</button>
    </div>
  );
}
