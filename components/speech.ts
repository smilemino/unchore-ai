"use client";
import { speechTag } from "@/lib/i18n";
import { nativeBridge } from "./native-app";
// Browser speech: dictation (Web Speech API) and read-aloud (speechSynthesis). No server, no cost.
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

/** One of the app's languages («ko», «zh-TW») or a spoken language like «ja-JP» → what the browser's speech engines expect. */
export const bcp47 = (lang: string): string => speechTag(lang || "en");

export function canListen(): boolean { return typeof window !== "undefined" && Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition); }

// The app's phone dictation can «stick» (error 5 «client» or 8 «busy»): started again at once it sticks again, several times a second,
// and every stop ended the turn — half a sentence was sent and the AI talked over the member, or nothing was heard at all
// (AI Soul c0e50e6, 2026-10-02: the owner's phone stuck 5 times a second). A stuck ear now starts again a little later each time
// (0.3 → 2 s), keeps every word heard so far, and gives up only after a minute without a word.
const STUCK = /^code-(5|8)\b/;
const STUCK_GIVEUP_MS = 60_000;
export const stuckDelayMs = (n: number): number => Math.min(300 * 2 ** Math.max(0, n - 1), 2000);

// In the app, starting the phone's dictation right after the last one ended is what made it stick most (AI Soul 808fccd:
// 45% of 654 «error 5» came while the AI was talking and the ear was restarted at once). The app rests 0.7 s between ears.
export const EAR_REST_MS = 700;
let earEndedAt = 0;
export const earRestMs = (now: number, endedAt: number, app: boolean): number => (app ? Math.max(0, endedAt + EAR_REST_MS - now) : 0);

/** Starts listening. Calls onText with the running transcript; onDone when the speaker stops (browser end-of-speech). */
/** `rest: false` — the member is holding «Hold to talk»: start at once (the 0.7 s app rest would drop their first words). */
export function listen(lang: string, onText: (t: string, final: boolean) => void, onDone: (t: string, error?: string) => void, opts: { rest?: boolean } = {}): () => void {
  const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!C) { queueMicrotask(() => onDone("", "not-supported")); return () => {}; }
  let finalText = "", carry = "", shown = "";
  let ended = false;
  let stopping = false;
  let r: Rec | null = null, stuckErr = false, stuck = 0, stuckSince = 0;
  let wait: ReturnType<typeof setTimeout> | null = null;
  const finish = (error?: string) => {
    if (ended) return;
    ended = true; earEndedAt = Date.now();
    // Complete after the caller has installed its stop handle, including synchronous start failures.
    queueMicrotask(() => onDone(finalText.trim(), error));
  };
  const spawn = () => {
    wait = null;
    if (ended) return;
    const me = new C(); r = me;
    me.lang = bcp47(lang); me.interimResults = true; me.continuous = false;
    me.onresult = (e) => {
      if (ended || r !== me) return;
      finalText = carry; stuck = 0; stuckSince = 0;
      const partials: string[] = [];
      // Rebuild from the whole snapshot (AI Soul readSpoken). resultIndex is the first changed slot,
      // not an append cursor: browsers repeat final slots, and the app always replaces slot zero.
      for (let i = 0; i < e.results.length; i++) {
        const x = e.results[i];
        const heard = x?.[0]?.transcript.trim();
        if (!x || !heard) continue;
        if (x.isFinal) finalText = joinHeard(finalText, heard); else partials.push(heard);
      }
      const interim = partials.join(" ");
      shown = (finalText + " " + interim).trim();
      onText(shown, !interim);
    };
    me.onerror = (e) => {
      if (ended || r !== me) return;
      if (!stopping && STUCK.test(e.error)) { stuckErr = true; return; }   // the phone's dictation stuck — start again slowly at its end
      // Android Voice.java: timeout/no-match (6/7) can listen again.
      const retry = ["no-speech", "code-6", "code-7", "code-5", "code-5-nobias", "code-8"].includes(e.error)
        || (stopping && e.error === "aborted");
      // Keep the normal end event ordering: an old Android end must not close a newly started listener.
      if (retry) return;
      finish(e.error || "recognition-failed");
      try { me.abort(); } catch { /* already ended */ }
    };
    me.onend = () => {
      if (ended || r !== me) return;
      if (stuckErr && !stopping) {   // not the end of what they say — keep the words and listen again a little later
        stuckErr = false; r = null;
        const now = Date.now();
        if (!stuckSince) stuckSince = now;
        finalText = carry = shown;
        if (now - stuckSince > STUCK_GIVEUP_MS) { finish(shown ? undefined : "stuck"); return; }
        wait = setTimeout(spawn, stuckDelayMs(++stuck));
        return;
      }
      finish();
    };
    try { me.start(); } catch { finish("start-failed"); }
  };
  const rest = opts.rest === false ? 0 : earRestMs(Date.now(), earEndedAt, Boolean(nativeBridge()));
  if (rest) wait = setTimeout(spawn, rest); else spawn();
  return () => {
    if (ended) return;
    stopping = true;
    if (wait) { clearTimeout(wait); wait = null; finish(); return; }
    try { r?.stop(); } catch { finish("stop-failed"); }
  };
}

/** Appends a finished piece without doubling it («지금도» + «지금도 괜찮은데» → «지금도 괜찮은데»). */
export function joinHeard(prev: string, next: string): string {
  const a = prev.trim(), b = next.trim();
  if (!a) return b; if (!b) return a;
  if (b.startsWith(a)) return b;
  if (a.endsWith(b)) return a;
  return `${a} ${b}`;
}

/** Plain text for speaking: drops code, links and marks. */
export function speakable(md: string): string {
  return md.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_>|~-]{1,3}/g, " ").replace(/\s+/g, " ").trim();
}

export function speak(text: string, lang: string, onEnd?: () => void): void {
  if (typeof speechSynthesis === "undefined") { onEnd?.(); return; }
  speechSynthesis.cancel();
  const parts = speakable(text).match(/[^.!?。？！\n]+[.!?。？！]?/g) ?? [];
  if (!parts.length) { onEnd?.(); return; }
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = bcp47(lang);
    if (i === parts.length - 1) u.onend = () => onEnd?.();
    speechSynthesis.speak(u);
  });
}
export function stopSpeaking(): void { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }
