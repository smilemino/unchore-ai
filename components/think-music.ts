"use client";
// Soft music while the answer is being made in voice mode (ported from AI Soul, 2026-09-30 sync) — no spoken fillers.
// 2026-10-02 (synced from AI Soul a905020): instead of one 26.7 s loop, eight calm solo-piano pieces of our own
// (Yuki Kuramoto / Yiruma style, 1–2 min each, about 12 min in total) play one after another in shuffled order.
// When the music stops and starts again it carries on from where it stopped, so a long session is not the same first bars over and over.
// Melodies are ours; the sound is the FluidR3_GM grand piano (MIT licence) — no copyright issue. Loudness is baked into the files.
// If a piece can't be loaded yet, a quiet chime is made with the browser's sound engine instead, and swapped for the piano once it arrives.
// iPhones only play sound unlocked inside a tap, so unlock() is called from the 🎧 tap.
export const PIANO_TRACKS = Array.from({ length: 8 }, (_, i) => `/sound/piano/${String(i + 1).padStart(2, "0")}.mp3`);
const GAP = 1.5;     // seconds of rest between pieces (the reverb tail is inside each file)
const NEAR_END = 4;  // stopped in the last 4 s → next start goes to the next piece
const NOTES = [
  [261.63, 329.63, 392.0, 493.88],   // C E G B
  [220.0, 261.63, 329.63, 392.0],    // A C E G
  [174.61, 220.0, 261.63, 329.63],   // F A C E
  [196.0, 246.94, 293.66, 392.0],    // G B D G
];
const STEP = 0.55;   // seconds between notes
// Phone speakers barely play below 500 Hz, so an octave-up overtone is added to keep the low notes audible.
const VOL = 0.12;
const HARM = 0.5;    // octave-up overtone strength
// While a job left running keeps the music on, Unchore speaking or the member talking turns it down to this, not off (AI Soul 31c841c).
const DUCK = 0.3;

/** Play order — each round is shuffled, and a new round never starts with the piece that just played */
function shuffled(n: number, notFirst = -1): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  if (n > 1 && a[0] === notFirst) [a[0], a[1]] = [a[1]!, a[0]!];
  return a;
}

export class ThinkMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private at = 0;
  private n = 0;
  private order = shuffled(PIANO_TRACKS.length);
  private pos = 0;                 // place in order of the current piece
  private offset = 0;              // where to resume the current piece (s)
  private startedAt = 0;           // sound-engine time at which second 0 of the current piece sits
  private bufs = new Map<number, AudioBuffer>();
  private loading = new Set<number>();
  private src: AudioBufferSourceNode | null = null;
  private level = 1;               // full loudness: piano 1, chime VOL
  private ducked = false;
  unlock(): void {
    try {
      if (!this.ctx) {
        const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!A) return;
        this.ctx = new A();
      }
      void this.ctx.resume().catch(() => {});
      this.load(this.cur);
    } catch { /* no sound engine — wait quietly */ }
  }
  private get cur(): number { return this.order[this.pos]!; }
  /** Next piece — at the end of a round a freshly shuffled round is appended (so it can be fetched ahead) */
  private get next(): number {
    if (this.pos + 1 >= this.order.length) this.order.push(...shuffled(PIANO_TRACKS.length, this.cur));
    return this.order[this.pos + 1]!;
  }
  /** Move on only when the next piece is decoded — otherwise stay on the current one */
  private step(): void { if (this.bufs.has(this.next)) this.pos++; }
  /** Fetch and decode one piece — on failure try again later (chime / current piece meanwhile) */
  private load(i: number): void {
    const ctx = this.ctx;
    if (!ctx || this.bufs.has(i) || this.loading.has(i) || typeof ctx.decodeAudioData !== "function") return;
    this.loading.add(i);
    // 8 s cap so a request that never answers cannot leave loading stuck
    const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
    fetch(PIANO_TRACKS[i]!, signal ? { signal } : undefined).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => new Promise<AudioBuffer>((ok, no) => { ctx.decodeAudioData(b, ok, no); }))   // old Safari only knows the callback form
      .then((b) => {
        this.loading.delete(i); this.bufs.set(i, b);
        // a decoded piece is over ten MB — keep only the current and the next one (phone memory)
        for (const k of [...this.bufs.keys()]) if (k !== this.cur && k !== this.next) this.bufs.delete(k);
        if (i === this.cur && this.timer && this.out) { this.stopChime(); this.playPiano(ctx, this.out, ctx.currentTime); }   // arrived while the chime plays → switch to the piano
      })
      .catch(() => { this.loading.delete(i); });
  }
  get playing(): boolean { return this.timer !== null || this.src !== null; }
  start(): void {
    const ctx = this.ctx;
    if (!ctx || this.playing) return;
    try { void ctx.resume().catch(() => {}); } catch { /* engine without resume */ }
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.connect(ctx.destination);
    this.out = out; this.ducked = false;
    if (this.bufs.has(this.cur)) { this.playPiano(ctx, out, ctx.currentTime); return; }
    this.load(this.cur);
    this.level = VOL;
    out.gain.exponentialRampToValueAtTime(VOL, ctx.currentTime + 0.8);
    this.n = 0; this.at = ctx.currentTime + 0.05;
    const plan = () => { while (this.at < ctx.currentTime + 1.2) { this.note(ctx, out, this.at); this.at += STEP; } };
    plan();
    this.timer = setInterval(plan, 400);
  }
  /** Play the current piece from where it left off — at its end the next piece follows (or the same one again if the next isn't loaded) */
  private playPiano(ctx: AudioContext, out: GainNode, when: number): void {
    const buf = this.bufs.get(this.cur);
    if (!buf) return;
    this.level = 1;
    this.ramp(0.8);
    const off = this.offset < buf.duration - NEAR_END ? this.offset : 0;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = false; src.connect(out);
    src.onended = () => { if (this.src === src) this.advance(); };
    src.start(when, off);
    this.src = src; this.startedAt = when - off;
    this.load(this.next);
  }
  /** A piece ended — after a short rest play the next one */
  private advance(): void {
    const ctx = this.ctx, out = this.out;
    this.src = null; this.offset = 0;
    if (!ctx || !out) return;
    this.step();
    this.playPiano(ctx, out, ctx.currentTime + GAP);
  }
  private note(ctx: AudioContext, out: GainNode, t: number): void {
    const chord = NOTES[Math.floor(this.n / 8) % NOTES.length]!;
    const f = chord[[0, 2, 1, 3, 2, 1, 3, 2][this.n % 8]!]!;
    this.n++;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    g.connect(out);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2;
    const h = ctx.createGain(); h.gain.value = HARM;
    o.connect(g); o2.connect(h).connect(g);
    o.start(t); o.stop(t + 1.5); o2.start(t); o2.stop(t + 1.5);
  }
  /** Glide to the current target loudness (turned down or full) */
  private ramp(secs: number): void {
    const out = this.out, ctx = this.ctx;
    if (!out || !ctx) return;
    try {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
      out.gain.exponentialRampToValueAtTime(this.level * (this.ducked ? DUCK : 1), t + secs);
    } catch { /* engine closed */ }
  }
  /** Turn the music down (true) or back up (false) without stopping it — does nothing while it isn't playing */
  duck(on: boolean): void {
    if (!this.out || on === this.ducked) return;
    this.ducked = on;
    this.ramp(0.3);
  }
  get quiet(): boolean { return this.ducked; }
  private stopChime(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  /** Fade out — when the answer starts being read or voice mode stops. The piano remembers where it stopped */
  stop(): void {
    this.ducked = false;
    this.stopChime();
    const src = this.src; this.src = null;
    const out = this.out; const ctx = this.ctx; this.out = null;
    if (src && ctx) {
      const dur = src.buffer?.duration ?? 0;
      this.offset = Math.max(0, ctx.currentTime - this.startedAt);
      if (dur && this.offset >= dur - NEAR_END) { this.offset = 0; this.step(); }   // nearly over → next piece from the start
    }
    if (!out || !ctx) return;
    try {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), ctx.currentTime);
      out.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      setTimeout(() => { try { src?.stop(); } catch { /* already stopped */ } try { out.disconnect(); } catch { /* already disconnected */ } }, 400);
    } catch { try { src?.stop(); } catch { /* already stopped */ } }   // engine already closed — at least stop the piano
  }
  close(): void { this.stop(); const c = this.ctx; this.ctx = null; void c?.close().catch(() => {}); }
}
