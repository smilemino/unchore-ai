"use client";
// Reading answers aloud with Google's voice (/api/voice/tts → 24 kHz 16-bit PCM, played as it arrives). Long answers are cut at
// sentence ends into pieces of up to 380 characters; the next piece is fetched while the current one plays. When Google can't be
// used (today's 60 minutes are used up, no sound within 4 s, offline) the rest is read with the phone's own voice — never silence.
import { speak as phoneSpeak, speakable, stopSpeaking } from "./speech";

const RATE = 24000;
const FIRST_SOUND_MS = 6000;   // Google's first sound took 2–3 s from the server on 2026-10-01 (0.75 s on 9/30) — 4 s let answers slip to the phone voice (Synced from AI Soul)
export const STALL_SOUND_MS = 8000;   // after the first sound, this long with no new audio = play what came and move on (a dropped connection while driving must not freeze voice mode in «speaking» — AI Soul 9/30)
const RESUME_WAIT_MS = 1000;          // on a hidden page the audio context may never finish resuming — don't wait on it forever
const OFF_KEY = "uc_voice_off";   // today's date once Google said «limit reached» — skip it until tomorrow
export const LOG_KEY = "uc_voice_log";   // on-device diagnostic lines (which voice read each piece, time to first sound) — never sent anywhere
const LOG_MAX = 50;

export interface VoiceLogLine { at: number; g: boolean; ms: number; why: string; n: number }
/** Adds one diagnostic line on this device (the last 50 are kept). */
export function voiceLog(line: Omit<VoiceLogLine, "at">): void {
  try {
    const all = readVoiceLog();
    all.push({ at: Date.now(), ...line });
    localStorage.setItem(LOG_KEY, JSON.stringify(all.slice(-LOG_MAX)));
  } catch { /* private mode or no storage */ }
}
export function readVoiceLog(): VoiceLogLine[] {
  try { const v = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Cuts at sentence ends into pieces Google accepts (≤ 380 characters). */
export function pieces(text: string, max = 380): string[] {
  const out: string[] = []; let cur = "";
  for (const s of speakable(text).match(/[^.!?。？！\n]+[.!?。？！]*\s*/g) ?? []) {
    let part = s;
    while (part.length > max) { if (cur) { out.push(cur.trim()); cur = ""; } out.push(part.slice(0, max).trim()); part = part.slice(max); }
    if ((cur + part).length > max) { out.push(cur.trim()); cur = ""; }
    cur += part;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** 16-bit little-endian PCM bytes → samples; an odd byte left over is carried to the next chunk. */
export function pcmToFloat(bytes: Uint8Array, carry: number | null): { samples: Float32Array; carry: number | null } {
  const all = carry === null ? bytes : (() => { const b = new Uint8Array(bytes.length + 1); b[0] = carry; b.set(bytes, 1); return b; })();
  const n = Math.floor(all.length / 2);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = all[2 * i]! | (all[2 * i + 1]! << 8); samples[i] = (v >= 0x8000 ? v - 0x10000 : v) / 0x8000; }
  return { samples, carry: all.length % 2 ? all[all.length - 1]! : null };
}

const today = () => new Date().toLocaleDateString("en-CA");

export class Speaker {
  private ctx: AudioContext | null = null;
  private ac: AbortController | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private run = 0;
  private firstAt = 0;   // when the current piece's first sound arrived (diagnostic line)
  /** Set when Google refused for the day; the owner of this Speaker may show a one-line note. */
  /** Google voice refused: «no_credit» = the member's credit is used up, anything else = today's minutes. */
  onLimit: ((why: string) => void) | null = null;
  /** Which voice is reading now — «google» (natural), «phone» (the device's own), or "" when nothing is read. */
  onEngine: ((e: "" | "google" | "phone") => void) | null = null;
  /** Voice mode «🔇 Sound off» (AI Soul VoiceMode voice-mute): answers aren't read aloud — they still show — and listening goes on. */
  muted = false;
  constructor(public voice: string, public lang: string, public google: boolean) {}

  /** Call inside the tap that starts voice mode — iPhones only allow sound that was unlocked by a tap. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!A) return;
        this.ctx = new A();
      }
      void this.ctx.resume().catch(() => {});
      const b = this.ctx.createBuffer(1, 1, RATE); const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start();
    } catch { /* no audio — the phone's voice will read */ }
  }
  private usable(): boolean {
    try { if (localStorage.getItem(OFF_KEY) === today()) return false; } catch { /* private mode */ }
    return this.google && Boolean(this.voice) && Boolean(this.ctx);
  }

  /** Reads `text`; calls onEnd once when done (or stopped). */
  say(text: string, onEnd?: () => void): void {
    this.stop();
    const my = ++this.run;
    const end = () => { if (my === this.run) { this.setMode(""); onEnd?.(); } };
    if (this.muted) { setTimeout(end, 0); return; }
    const list = pieces(text);
    if (!list.length) { end(); return; }
    if (!this.usable()) { this.phone(list, this.google ? "off" : "chosen", end); return; }
    this.setMode("google");
    void this.play(list, my).then((left) => {
      if (my !== this.run) return;
      if (left.length) this.phone(left, this.why, end); else end();
    });
  }
  private phone(list: string[], why: string, end: () => void): void {
    for (const t of list) voiceLog({ g: false, ms: -1, why, n: t.length });
    this.setMode("phone"); phoneSpeak(list.join(" "), this.lang, end);
  }
  private mode: "" | "google" | "phone" = "";
  private setMode(m: "" | "google" | "phone"): void { if (m !== this.mode) { this.mode = m; this.onEngine?.(m); } }
  /** Why Google could not read the rest (diagnostic line): late · limit · no-res · empty. */
  private why = "";
  /** The phone's voice was reading but has gone quiet without saying it ended (it can while the page was hidden) — voice mode
   *  would wait forever. Coming back to the page checks this (AI Soul 9/30 «after the maps app it didn't hear me»). */
  stuck(): boolean {
    try { return this.mode === "phone" && !window.speechSynthesis.speaking && !window.speechSynthesis.pending; } catch { return false; }
  }

  /** Plays pieces with Google; returns the pieces it could not play (to be read by the phone). */
  private async play(list: string[], my: number): Promise<string[]> {
    const ac = new AbortController(); this.ac = ac;
    const fetchOne = (t: string) => fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t, voice: this.voice }), signal: ac.signal }).catch(() => null);
    let next = fetchOne(list[0]!);
    for (let i = 0; i < list.length; i++) {
      const t0 = Date.now(); this.firstAt = 0;
      const res = await Promise.race([next, new Promise<null>((ok) => setTimeout(() => ok(null), FIRST_SOUND_MS))]);
      if (my !== this.run) return [];
      if (!res?.ok || !res.body) {
        this.why = !res ? "late" : res.status === 429 || res.status === 503 ? "limit" : "no-res";
        if (res && (res.status === 429 || res.status === 503)) {
          try { localStorage.setItem(OFF_KEY, today()); } catch { /* */ }
          const why = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "";
          this.onLimit?.(why);
        }
        ac.abort();
        return list.slice(i);
      }
      if (i + 1 < list.length) next = fetchOne(list[i + 1]!);
      const ok = await this.playBody(res.body, my);
      if (my !== this.run) return [];
      if (!ok) { this.why = "empty"; ac.abort(); return list.slice(i); }
      voiceLog({ g: true, ms: this.firstAt ? this.firstAt - t0 : -1, why: "", n: list[i]!.length });
    }
    return [];
  }

  private async playBody(body: ReadableStream<Uint8Array>, my: number): Promise<boolean> {
    const ctx = this.ctx!;
    const reader = body.getReader();
    let carry: number | null = null; let at = 0; let got = false;
    try {
      for (;;) {
        let tm: ReturnType<typeof setTimeout> | undefined;
        const next = await Promise.race([reader.read(), new Promise<null>((ok) => { tm = setTimeout(() => ok(null), got ? STALL_SOUND_MS : FIRST_SOUND_MS + 1000); })]).finally(() => clearTimeout(tm));
        if (!next) { void reader.cancel().catch(() => {}); break; }   // the audio stopped coming — play what arrived
        const { value, done } = next;
        if (done || my !== this.run) break;
        const { samples, carry: c } = pcmToFloat(value, carry); carry = c;
        if (!samples.length) continue;
        if (!got) { got = true; this.firstAt = Date.now(); if (ctx.state === "suspended") await Promise.race([ctx.resume().catch(() => {}), new Promise((ok) => setTimeout(ok, RESUME_WAIT_MS))]); at = ctx.currentTime + 0.05; }
        const b = ctx.createBuffer(1, samples.length, RATE); b.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
        const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination);
        at = Math.max(at, ctx.currentTime + 0.02); s.start(at); at += b.duration;
        this.sources.push(s);
      }
    } catch { /* cut off — play what arrived */ }
    if (!got) return false;
    if (my !== this.run) return true;
    await new Promise<void>((ok) => setTimeout(ok, Math.max(0, (at - ctx.currentTime) * 1000) + 30));
    this.sources = [];
    return true;
  }

  stop(): void {
    this.run++; this.setMode("");
    this.ac?.abort(); this.ac = null;
    for (const s of this.sources) { try { s.stop(); } catch { /* already ended */ } }
    this.sources = [];
    stopSpeaking();
  }
  /** The context unlocked by the tap, for the first-words recorder. */
  audio(): AudioContext | null { return this.ctx; }
  close(): void { this.stop(); const c = this.ctx; this.ctx = null; void c?.close().catch(() => {}); }
}
