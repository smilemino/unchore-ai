// Talking over the voice (ported from AI Soul 9/30 aa59ea6 · fc72b42 — «when I talk while you're speaking, stop and listen»).
// While an answer is read aloud the microphone stays on. What it hears is compared with what is being read: words that are only
// our own voice coming back through the speaker are dropped; if the user's own words remain, reading stops and their words go on.
// Words are cut with the browser's word segmenter, so it works in every language (also those written without spaces).
// Fillers and «stop» come from lib/words (yes_short · stop_bare) plus the Korean/English below.
import { exactRe } from "@/lib/words";
import W_YES from "@/lib/words/yes_short.json";
import W_STOP from "@/lib/words/stop_bare.json";

const FILL_ANY = exactRe(W_YES), STOP_ANY = exactRe(W_STOP);
const FILL = /^(네|예|응|어|음|아|그|저|좀|뭐|이제|yes|yeah|yep|ok|okay|uh|um|hmm|oh|so|well)$/i;
const STOP = /^(잠깐|잠깐만|잠깐만요|잠시만|잠시만요|그만|그만요|멈춰|멈춰요|스톱|아니|아니요|아뇨|wait|stop|hold on|no)$/i;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** Words of a sentence in any language (word-like pieces only), with where each starts. */
export function wordsAt(s: string): { w: string; at: number }[] {
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;
  if (seg) return [...seg.segment(s)].filter((x) => x.isWordLike).map((x) => ({ w: norm(x.segment), at: x.index })).filter((x) => x.w);
  const out: { w: string; at: number }[] = [];
  for (const m of s.matchAll(/\S+/g)) { const w = norm(m[0]); if (w) out.push({ w, at: m.index ?? 0 }); }
  return out;
}
export const wordsOf = (s: string): string[] => wordsAt(s).map((x) => x.w);
/** Is this heard word just our own reading coming back? (recognition often changes a word ending — treated as the same word) */
function echoWord(w: string, ref: string): boolean {
  if (ref.includes(w)) return true;
  const n = [...w].length;
  return (n >= 3 && ref.includes([...w].slice(0, -1).join(""))) || (n >= 4 && ref.includes([...w].slice(0, -2).join("")));
}
export interface Barge { hit: boolean; stop: boolean; novel: number; user: string }
/** Heard while reading `spoken`: did the user talk? Two new words (4+ letters together) in the last 8, or «stop / wait». */
export function bargeCheck(heard: string, spoken: string, win = 8): Barge {
  const ref = norm(spoken);
  const ws = wordsAt(heard);
  let novel = 0, n = 0, stop = false, first = -1;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!.w;
    if (FILL.test(w) || FILL_ANY.test(w) || echoWord(w, ref)) continue;
    if (first < 0) first = i;
    if (i < ws.length - win) continue;   // only the latest words decide; the user's words are kept from their first one
    n++; novel += [...w].length;
    if (STOP.test(w) || STOP_ANY.test(w)) stop = true;
  }
  return { hit: stop || (n >= 2 && novel >= 4), stop, novel, user: first < 0 ? "" : heard.slice(ws[first]!.at).trim() };
}
/** Heard only as one finished piece (some phones send no partial words while reading): count only the user's words at the very end —
 *  a mishearing of the speaker is scattered between our own words, while the user's words come last (AI Soul bargeFinal · eafd435). */
export function bargeFinal(heard: string, spoken: string): Barge {
  const b = bargeCheck(heard, spoken);
  const ref = norm(spoken), ws = wordsAt(heard);
  let n = 0, chars = 0;
  for (let i = ws.length - 1; i >= 0; i--) {
    const w = ws[i]!.w;
    if (FILL.test(w) || FILL_ANY.test(w)) continue;
    if (echoWord(w, ref)) break;
    n++; chars += [...w].length;
  }
  return { ...b, hit: b.stop || (n >= 2 && chars >= 4) };
}
/** A line that only says «stop» (or /stop) — typed while an answer is coming, it stops the answer instead of waiting in the queue.
 *  Only the word alone counts: a sentence with «stop» in it is a new instruction (AI Soul Chat.tsx «글로 멈추기»). */
export function stopOnly(text: string): boolean {
  const s = text.trim();
  if (/^\/stop[.!。]?$/i.test(s)) return true;
  if (!s || s.includes("\n") || s.length > 30) return false;
  const ws = wordsOf(s);
  return ws.length > 0 && ws.length <= 3 && ws.every((w) => STOP.test(w) || STOP_ANY.test(w) || /^(주세요|좀|please|now)$/i.test(w));
}
/** When they finished: really the user (a stop word, or they kept talking), or the speaker misheard? */
export function bargeReal(at: Barge, end: Barge): boolean { return at.stop || end.stop || end.novel >= at.novel + 2 || end.novel >= 8; }
