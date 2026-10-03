// Voice mode: drop Unchore's own words that the microphone picked up from the speaker at the start of what the user said.
// Ported from AI Soul lib/voice-heard dropEcho (2026-09-29 — «your words must not get mixed into mine»).
// Conditions: ①the first 5+ letters (spaces and punctuation ignored) match a stretch of the last answer
// ②that stretch ends at a sentence end in the answer ③in what was heard it is followed by a space, punctuation or the end
// (a quote glued to the user's own words, like «…보세요처럼», is kept). Nothing left → "" (the screen listens again instead of sending).
const SKIP = /[\s.,?!~…·'"«»「」()]/u;
const SENT_END = /[.?!…~。\n]/u;

function squash(t: string): { s: string; at: number[] } {
  let s = "";
  const at: number[] = [];
  for (let i = 0; i < t.length; i++) { const c = t[i]!; if (!SKIP.test(c)) { s += c; at.push(i); } }
  at.push(t.length);
  return { s, at };
}

export function dropEcho(heard: string, said: string | null | undefined): string {
  const t = (heard ?? "").trim();
  const r0 = (said ?? "").replace(/\[\[[^\]]*\]\]/g, " ").slice(-3000);
  if (t.length < 5 || r0.trim().length < 5) return t;
  const low = (x: string) => { const l = x.toLowerCase(); return l.length === x.length ? l : x; };
  const h = squash(low(t)), r = squash(low(r0));
  const ends = new Set<number>();
  for (let k = 1; k <= r.s.length; k++) {
    const from = r.at[k - 1]! + 1, to = k < r.s.length ? r.at[k]! : r0.length;
    if (k === r.s.length || SENT_END.test(r0.slice(from, to))) ends.add(k);
  }
  let best = 0;
  const cap = Math.min(h.s.length, 600);
  for (let i = 0; i < r.s.length; i++) {
    if (r.s[i] !== h.s[0]) continue;
    let n = 0;
    while (n < cap && i + n < r.s.length && r.s[i + n] === h.s[n]) n++;
    while (n > best && !ends.has(i + n)) n--;
    if (n > best) best = n;
  }
  if (best < 5) return t;
  if (best < h.s.length && h.at[best]! === h.at[best - 1]! + 1) return t;
  return t.slice(h.at[best]!).trim();
}
