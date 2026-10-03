// The member's words when earlier messages are passed on (ported from AI Soul lib/voice heardOnce · clipEnds):
// the point of what someone says is usually at the end («…so no, don't do that»), so a long message keeps its first 30% and last 70%,
// and some phone browsers' dictation saved one sentence as its growing beginnings run together («nownow I thinknow I think so»).

/** Long text keeps its start and end and drops the middle — the meaning of a reply is at the end. */
export const clipEnds = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, Math.floor(n * 0.3))} … ${s.slice(s.length - Math.ceil(n * 0.7) + 3)}` : s;

/** Is pre the beginnings of t run together — «now» «now I» «now I think»… (Z-array over t and pre in one pass) */
function echoOf(pre: string, t: string): boolean {
  const u = `${t}\u0000${pre}`, z = new Array<number>(u.length).fill(0);
  for (let i = 1, l = 0, r = 0; i < u.length; i++) {
    if (i < r) z[i] = Math.min(r - i, z[i - l]!);
    while (i + z[i]! < u.length && u[z[i]!] === u[i + z[i]!]) z[i]!++;
    if (i + z[i]! > r) { l = i; r = i + z[i]!; }
  }
  const off = t.length + 1;
  let far = 0, prev = true;
  for (let p = 0; p <= pre.length; p++) {
    const ok: boolean = p === 0 || p <= far || (prev && /\s/.test(pre[p - 1]!));
    if (p === pre.length) return ok;
    if (ok) far = Math.max(far, p + z[off + p]!);
    prev = ok;
  }
  return false;
}

/** Dictation that saved a sentence as its growing beginnings run together → only the last (longest) take.
 *  Repeats with a space between them («yes yes okay») are what the person said and stay as they are. */
export function heardOnce(text: string): string {
  const s = text.trim(), low = s.toLowerCase();
  const k = low.length === s.length ? low : s;   // «TTS» and «tts» in two takes are the same words
  // Shortest tail first — the shortest take holding all earlier ones is the last take. A beginning under 4 characters is not
  // a take: «zzz so sleepy» or «ㅋㅋㅋ 좋아요» kept losing their first characters (AI Soul a6b5ed6).
  for (let j = k.length - 1, tries = 0; j >= 4 && tries < 600; j--) {
    if (k[j] !== k[0]) continue;
    tries++;
    const pre = k.slice(0, j);
    if (/\s$/.test(pre) || !echoOf(pre, k.slice(j))) continue;
    // Typed text goes through here too: «100100» or «hahaha» is what was written. Only a sentence of several words whose
    // beginnings were run together at least twice is dictation.
    const head = k.slice(j).split(/\s/)[0]!;
    return /\s/.test(k.slice(j)) && pre.split(head).length > 2 ? s.slice(j) : s;
  }
  return s;
}

/** One earlier message as a line for the AI: the member's words once and with their end kept, the AI's words from the start. */
export const saidLine = (role: string, content: string, max: number): string => role === "user"
  ? `User: ${clipEnds(heardOnce(content).replace(/\s+/g, " "), max)}`
  : `AI: ${content.replace(/\s+/g, " ").trim().slice(0, max)}`;
