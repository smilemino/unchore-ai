"use client";
// Bridge to the Unchore Android app (android/unchore-app · owner 2026-09-30 «like YouTube: keep talking over the maps app»).
// Inside the app a web view has no browser dictation, and a web page loses the mic when another app is on screen. So the app runs the
// phone's own dictation (SpeechRecognizer) and voice (TextToSpeech) in a «voice mode» notification service, and here they are slotted
// in with the same shape as the browser ones (webkitSpeechRecognition · speechSynthesis) — components/speech.ts needs no change.
// Ported from AI Soul components/native-voice.ts; here every call carries the member's language (Unchore speaks 58).
// In a browser window.UnchoreAndroid is missing and nothing happens. App → page news comes in as window.__ucNative(ev).

interface Bridge {
  srStart(lang: string): void;
  srAbort(): void;
  ttsSpeak(id: string, text: string, rate: number, lang: string): void;
  ttsCancel(): void;
  voiceSession(on: boolean): void;
  /** What the small floating window (over the maps app) shows */
  voiceView(phase: string, line: string): void;
}
type NativeEvent =
  | { type: "sr"; ev: "result"; text: string; final: boolean }
  | { type: "sr"; ev: "end" }
  | { type: "sr"; ev: "error"; error: string }
  | { type: "tts"; ev: "end"; id: string }
  | { type: "call"; ev: "start" | "end" }          // a phone call rings or is on (also internet calls) / ended
  | { type: "ctl"; ev: "interrupt" | "end" };      // «Stop and listen» (small window, headset button) · «End» in the notification
type W = Window & { UnchoreAndroid?: Bridge; __ucNative?: (e: NativeEvent) => void; __ucNativeOn?: boolean };

/** Inside the Unchore Android app? */
export function nativeBridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  return (window as W).UnchoreAndroid ?? null;
}

interface Handlers {
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
let current: NativeRec | null = null;   // only the listener started last gets the app's news
const own = (r: NativeRec | null) => { current = r; };
/** Same shape as browser dictation. The phone's dictation ends when the speaker goes quiet; speech.ts listens again after onend. */
class NativeRec implements Handlers {
  lang = "en-US"; interimResults = true; continuous = false;
  onresult: Handlers["onresult"] = null;
  onerror: Handlers["onerror"] = null;
  onend: Handlers["onend"] = null;
  start(): void { own(this); nativeBridge()?.srStart(this.lang || "en-US"); }
  stop(): void { this.abort(); }
  abort(): void { if (current === this) nativeBridge()?.srAbort(); }
}

interface Utter { text: string; lang: string; rate: number; voice: unknown; onend: (() => void) | null; onerror: (() => void) | null }
const speaking = new Map<string, Utter>();
let seq = 0;

/** Voice mode registers here while open, to hear calls and the app's buttons. */
export interface NativeControl { call(on: boolean): void; interrupt(): void; end(): void }
let control: NativeControl | null = null;
export function setNativeControl(c: NativeControl | null): void { control = c; }

function onNative(e: NativeEvent): void {
  if (e.type === "tts") { const u = speaking.get(e.id); speaking.delete(e.id); u?.onend?.(); return; }
  if (e.type === "call") { control?.call(e.ev === "start"); return; }
  if (e.type === "ctl") { if (e.ev === "end") control?.end(); else control?.interrupt(); return; }
  const r = current;
  if (!r) return;
  if (e.ev === "result") r.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: e.text }], { isFinal: e.final })] });
  else if (e.ev === "error") r.onerror?.({ error: e.error });
  else { if (current === r) own(null); r.onend?.(); }
}

/** Voice mode opened / closed — the app keeps the mic and sound alive behind other apps only while it is open. */
export function nativeVoiceSession(on: boolean): void {
  try { nativeBridge()?.voiceSession(on); } catch { /* the app is closing */ }
}

let lastView = "";
/** Tells the small floating window what is going on (same text twice is not sent again). */
export function nativeView(phase: "listening" | "thinking" | "speaking" | "off", line: string): void {
  const b = nativeBridge();
  if (!b) return;
  const k = `${phase}\n${line}`;
  if (k === lastView) return;
  lastView = k;
  try { b.voiceView(phase, line); } catch { /* the app is closing */ }
}

/** Inside the app: slot the phone's dictation and voice in (once). */
export function installNativeVoice(): void {
  const w = window as W;
  const b = w.UnchoreAndroid;
  if (!b || w.__ucNativeOn) return;
  w.__ucNativeOn = true;
  w.__ucNative = onNative;
  (w as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = NativeRec;
  try { delete (w as unknown as { SpeechRecognition?: unknown }).SpeechRecognition; } catch { /* not there */ }
  const synth = {
    get speaking() { return speaking.size > 0; },   // Speaker.stuck() reads this when the page comes back
    pending: false, paused: false, onvoiceschanged: null,
    getVoices: () => [],
    speak(u: Utter) { const id = String(++seq); speaking.set(id, u); b.ttsSpeak(id, u.text, u.rate || 1, u.lang || document.documentElement.lang || "en"); },
    cancel() { speaking.clear(); b.ttsCancel(); },
    pause() {}, resume() {},
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(w, "speechSynthesis", { value: synth, configurable: true });
  (w as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: Utter, t?: string) {
    this.text = t ?? ""; this.lang = ""; this.rate = 1; this.voice = null; this.onend = null; this.onerror = null;
  };
}

if (typeof window !== "undefined") installNativeVoice();
