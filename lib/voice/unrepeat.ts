// Voice mode: words the speech recognizer wrote down several times over, made one again before they are saved.
// Ported from AI Soul lib/voice-heard unrepeat (2026-09-29). Chrome on Android sends «everything heard so far» with each piece, so
// a screen that doesn't filter it sends «yes and thenyes and thenyes and then by itself…» — the start repeated tens of times.
// Here such text goes back to «the last whole take». Idea: repeated text = the starts of one utterance (U) glued together + U.
// Find U from the end; if everything before it is covered by starts of U with no gap, drop it (if not all of it is covered, peel
// what's left once more — the device restarted dictation and a new take began).
// Spaces and punctuation are ignored. A piece where the recognizer rewrote an earlier word is forgiven one letter in six.

const SKIP = /[\s.,?!~…·'"«»「」()]/u;
const GENERAL_MAX = 6000;   // the wide search for several takes runs up to this many letters (above it, one take only — stays fast)
/** One-letter first pieces that count as a repeat: Korean filler syllables a recognizer stutters on (others — a real word — are kept) */
const STUTTER = "네예응어음아그저뭐좀자";

/** The text without spaces and punctuation, and where each letter was in the original */
function squash(t: string): { s: string; at: number[] } {
  let s = "";
  const at: number[] = [];
  for (let i = 0; i < t.length; i++) { const c = t[i]!; if (!SKIP.test(c)) { s += c; at.push(i); } }
  at.push(t.length);
  return { s, at };
}

/** Is x (nearly) a start of y — up to one letter in six (six at most) missing, changed or added. Short pieces (<6) must match exactly.
 *  Differences are forgiven only inside the piece — forgiving the last letter lets it eat the next piece's head and shifts a take */
function nearHeadStr(x: string, y: string): boolean {
  const n = x.length;
  if (n === 0 || n > y.length + Math.min(6, Math.floor(n / 6))) return false;
  let lcp = 0;
  while (lcp < n && x[lcp] === y[lcp]) lcp++;
  if (lcp === n) return true;
  const allow = Math.min(6, Math.floor(n / 6));
  if (allow === 0 || lcp < 3) return false;   // the first three letters must match (else nothing to look at — keeps long text fast)
  // banded edit distance — x[i] only meets y[j] with |i-j|≤allow
  const a = x.slice(lcp), m = Math.min(y.length - lcp, a.length + allow), b = y.slice(lcp, lcp + m);
  const INF = allow + 1;
  let prev = new Array<number>(m + 1).fill(INF);
  for (let j = 0; j <= Math.min(m, allow); j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(m + 1).fill(INF);
    if (i <= allow) cur[0] = i;
    let best = cur[0]!;
    for (let j = Math.max(1, i - allow); j <= Math.min(m, i + allow); j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = Math.min(v, INF);
      if (v < best) best = v;
    }
    if (best > allow) return false;
    prev = cur;
  }
  if (Math.min(...prev) > allow) return false;
  return y.slice(Math.max(0, n - 1 - allow), n + allow).includes(x[n - 1]!);
}

/** Is s[b..r) a start piece of U=s[p..) — a piece is never longer than U (else it would swallow «U + the next head») */
function isPiece(s: string, b: number, r: number, p: number): boolean {
  const n = r - b;
  if (n <= 0 || n > s.length - p) return false;
  let lcp = 0;   // compared in place first (slicing per piece was slow on long text)
  while (lcp < n && s.charCodeAt(b + lcp) === s.charCodeAt(p + lcp)) lcp++;
  if (lcp === n) return true;
  if (lcp < 3 || n < 6) return false;
  return nearHeadStr(s.slice(b, r), s.slice(p, p + n + 6));
}

/** Is the last piece s[p..) the start of the first words said again (more than four letters, shorter than what came before) */
function resay(s: string, p: number): boolean {
  const n = s.length - p;
  if (n < 4 || n >= p) return false;
  let lcp = 0;
  while (lcp < n && s.charCodeAt(p + lcp) === s.charCodeAt(lcp)) lcp++;
  if (lcp === n) return true;
  return lcp >= 3 && n >= 6 && nearHeadStr(s.slice(p), s.slice(0, n + 6));
}

/** Work cap for one pass (rough letter comparisons) — past it the text is kept as received (tens of thousands of one letter can't hold a request) */
const WORK_MAX = 3_000_000;
const MAX_LEN = 200_000;   // longer text isn't touched
class OverBudget extends Error {}
let work = 0;

/** Where the start pieces of U=s[p..) glued before p begin (q) and how many (n) — not covered: q=p, n=0 */
function chainStart(s: string, p: number): { q: number; n: number } {
  const maxPiece = s.length - p;
  const reach = [p];   // ascending — covered positions
  const cnt = new Map<number, number>([[p, 0]]);
  for (let b = p - 1; b >= 0; b--) {
    if (reach[0]! - b > maxPiece) break;
    if (++work > WORK_MAX) throw new OverBudget();
    if (s[b] !== s[p]) continue;
    for (let k = 0; k < reach.length && k < 6; k++) {
      const r = reach[k]!;
      if (r - b > maxPiece) break;
      work += 8;
      if (isPiece(s, b, r, p)) { reach.unshift(b); cnt.set(b, (cnt.get(r) ?? 0) + 1); break; }
    }
  }
  return { q: reach[0]!, n: cnt.get(reach[0]!) ?? 0 };
}

/** Joining takes — a later one that (nearly) contains the earlier replaces it; a later one that's a start of the earlier is dropped */
function joinParts(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    const last = out[out.length - 1];
    if (last !== undefined) {
      const a = squash(last).s, b = squash(t).s;
      if (nearHeadStr(a, b)) { out[out.length - 1] = t; continue; }
      if (nearHeadStr(b, a)) continue;
    }
    out.push(t);
  }
  return out.join(" ");
}

function peel(t: string, depth: number): string[] {
  const { s, at } = squash(t);
  if (s.length < 2 || depth > 40) return [t];
  // ① one take — the shortest end take U whose starts cover the text from its first letter. The common case.
  //   A single one-letter first piece counts only for a filler syllable (STUTTER) — «559204» is what was said
  for (let p = s.length - 1; p > 0; p--) {
    if (s[p] !== s[0]) continue;
    if (resay(s, p)) return peel(t.slice(0, at[p]!), depth + 1);   // a short take came once more at the very end
    const c = chainStart(s, p);
    if (c.q === 0 && (c.n >= 2 || p >= 2 || STUTTER.includes(s[0]!))) return peel(t.slice(at[p]!).trim(), depth + 1);   // a new take may follow U
  }
  // ② several takes (the device restarted dictation) — the end take U that covers furthest; what's before it is peeled again.
  //   Only for three or more pieces covering more than six letters (a person saying «~ or ~ in ~?» or «0000» is kept).
  if (s.length > GENERAL_MAX) return [t];
  let bestP = -1, bestQ = s.length;
  for (let p = s.length - 1; p > 0; p--) {
    const c = chainStart(s, p);
    // two pieces are enough when one of them is exactly U (a short sentence said twice)
    const twin = c.n === 2 && p - c.q >= s.length - p && s.startsWith(s.slice(p), p - (s.length - p));
    if ((c.n >= 3 || twin) && p - c.q >= 6) { bestQ = c.q; bestP = p; break; }
  }
  if (bestP < 0) return [t];
  const head = t.slice(0, at[bestQ]!);
  const u = t.slice(at[bestP]!).trim();
  return head.trim() ? [...peel(head, depth + 1), u] : [u];
}

/** Repeated dictation → its last whole take. Text with no repeat comes back as it was (only trimmed). */
export function unrepeat(text: string): string {
  const t = (text ?? "").trim();
  if (t.length < 2 || t.length > MAX_LEN) return t;
  work = 0;
  try { return joinParts(peel(t, 0)); } catch (e) { if (e instanceof OverBudget) return t; throw e; }
}
