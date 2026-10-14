/**
 * Musiquinha de fundo do vídeo de boas-vindas: uma caixinha de música feita na hora com Web Audio
 * (nenhum arquivo de áudio, nada de direitos autorais, funciona offline e no Safari 14).
 * Dó maior, 92 bpm, 8 compassos em loop: melodia em sino + baixo suave + acorde de fundo.
 */

type Ctx = AudioContext;
const _ = null;
// MIDI: C4=60 … C6=84. Cada compasso = 8 colcheias.
const MELODY: (number | null)[][] = [
  [76, 79, 84, 79, 81, 79, 76, _],
  [77, 81, 79, 76, 74, _, 72, _],
  [76, 79, 84, 86, 88, 86, 84, 81],
  [79, _, 76, 79, 81, 79, _, _],
  [77, 76, 74, 77, 76, 74, 72, 76],
  [74, 72, 69, 72, 67, _, _, _],
  [76, 79, 81, 84, 86, 84, 81, 79],
  [76, 74, 76, 79, 72, _, _, _],
];
// acorde de cada compasso (notas do fundo); o baixo é a primeira nota, uma oitava abaixo
const CHORDS: number[][] = [
  [48, 64, 67], [53, 65, 69], [48, 64, 67], [45, 64, 69],
  [53, 65, 69], [50, 65, 69], [53, 65, 72], [48, 64, 67],
];
const BPM = 92;
const EIGHTH = 60 / BPM / 2;
const BAR = EIGHTH * 8;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Tune {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private timer = 0;
  private next = 0; // próxima colcheia (contador global)
  private t0 = 0;
  private muted = false;
  volume = 0.16;

  /** precisa ser chamado dentro do toque/clique (exigência do iPhone) */
  start() {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.t0 = this.ctx.currentTime + 0.08;
      this.next = 0;
    }
    void this.ctx.resume();
    if (!this.timer) this.timer = window.setInterval(() => this.schedule(), 90);
    this.schedule();
  }

  pause() {
    window.clearInterval(this.timer);
    this.timer = 0;
    void this.ctx?.suspend();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  stop() {
    this.pause();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.3;
    // se a aba ficou parada, não despeja notas atrasadas de uma vez
    if (this.t0 + this.next * EIGHTH < ctx.currentTime - 0.1) {
      this.next = Math.ceil((ctx.currentTime - this.t0) / EIGHTH);
    }
    while (this.t0 + this.next * EIGHTH < horizon) {
      const at = this.t0 + this.next * EIGHTH;
      const bar = Math.floor(this.next / 8) % MELODY.length;
      const step = this.next % 8;
      const n = MELODY[bar][step];
      if (n != null) this.bell(hz(n), at);
      if (step === 0) {
        this.pad(CHORDS[bar].slice(1).map(hz), at, BAR);
        this.bass(hz(CHORDS[bar][0]), at);
      }
      if (step === 4) this.bass(hz(CHORDS[bar][0] + 7), at);
      this.next++;
    }
  }

  /** sino de caixinha de música: seno + harmônico agudo, ataque rápido e decaimento longo */
  private bell(f: number, at: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    g.connect(this.master!);
    for (const [mult, amp] of [[1, 1], [2, 0.35], [3.01, 0.12]] as const) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(at);
      o.stop(at + 1.2);
    }
  }

  private bass(f: number, at: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.28, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + EIGHTH * 3.5);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + EIGHTH * 4);
  }

  private pad(fs: number[], at: number, len: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.06, at + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    g.connect(this.master!);
    for (const f of fs) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start(at);
      o.stop(at + len + 0.05);
    }
  }
}
