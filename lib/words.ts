// Command words in every language (2026-09-30 owner: «anything that works when I say it in Korean must work in each
// country's own language — automatically, translated the same way as the screens»).
// Korean and English stay hand-written next to each check (the old patterns). The other 56 languages come from
// lib/words/<id>.json — one file per meaning, {"ja": [...], "de": [...]} — written by `node scripts/i18n.mjs fill`
// (Opus writes the phrases → a separate native review → a blind back-translation drops phrases that mean something else).
// The meanings and their Korean/English examples live in lib/words/src.json. tests/words.test.ts keeps every file complete.
export type Words = Record<string, string[]>;

/** Scripts written without spaces between words: a phrase may sit inside a longer run of letters. */
const NO_SPACE = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;
// A space in a phrase also matches a comma or dot typed there («ja gerne» ~ «Ja, gerne»). A short list, not \p{P}:
// that class repeated in thousands of phrases made one test of «그만» take 2~50 s (2026-10-02, remind_stop 2,058 phrases).
const SEP = "[\\s,.;:!?'\"()\\-–—、。，！？・…،؛؟।]+";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, SEP);

function phrases(w: Words): string[] {
  const all = new Set<string>();
  for (const list of Object.values(w)) for (const p of list) { const t = p.trim().toLowerCase(); if (t) all.add(t); }
  return [...all].sort((a, b) => b.length - a.length);   // longest first, so «stop reminders» wins over «stop»
}
/** One alternation of every phrase. `edge`: a phrase in a spaced script must start a word (it may end mid-word — stems);
 *  `whole`: it must also end the word («pin» but not «pinterest»). */
export function wordsSrc(w: Words, edge = true, whole = false): string {
  const B = "[\\p{L}\\p{M}\\p{N}]";
  const all = phrases(w);
  if (!edge) return all.map(esc).join("|") || "(?!)";
  // The word-edge check once around the group, not once per phrase (same matches — the two groups start in different scripts).
  const spaced = all.filter((p) => !NO_SPACE.test(p)).map(esc).join("|"), joined = all.filter((p) => NO_SPACE.test(p)).map(esc).join("|");
  return [spaced && `(?<!${B})(?:${spaced})${whole ? `(?!${B})` : ""}`, joined && `(?:${joined})`].filter(Boolean).join("|") || "(?!)";
}
/** Somewhere in the text. */
export function wordsRe(w: Words): RegExp { return new RegExp(`(?:${wordsSrc(w)})`, "iu"); }
/** The whole message is one of the phrases (punctuation around it is fine). */
export function exactRe(w: Words): RegExp { return new RegExp(`^[\\s\\p{P}]*(?:${wordsSrc(w, false)})[\\s\\p{P}]*$`, "iu"); }
/** Right after a number: «5 Minuten», «30分», «3 dias». */
export function afterNumberRe(w: Words): RegExp { return new RegExp(`\\d\\s*(?:${wordsSrc(w, false)})`, "iu"); }
