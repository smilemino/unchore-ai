// «In progress — waiting on something outside» (ported from AI Soul lib/conv-mark.ts holdLine, 2026-09-27 · db2c480 · 8404961).
// When the work in a chat is paused on someone or something outside it (another person's reply, a delivery, a site's review),
// the AI ends its answer with «⏳ In progress — <what>» (the label in the member's language). The chat list then shows it under
// «In progress», not «Your turn», with that line under the title. The line stays in the answer — the member reads it too.
import { isDetailsHead } from "./answer-fold";

const HOLD = /^\s*⏳\s*\**\s*(.*?)\s*\**\s*$/u;
// «In progress — what» / «In progress: what» — the label is short; without one the whole line is the «what»
const LABEL = /^[^—–:：]{1,40}?\s*\**\s*(?:[—–:：]|\s-\s)\s*\**\s*(.+)$/u;
const EVIDENCE_HEAD = (l: string) => /^\s*-{3,}\s*$/.test(l) || isDetailsHead(l);

function readHold(line: string): string | null {
  const m = HOLD.exec(line);
  if (!m) return null;
  const what = (LABEL.exec(m[1]!)?.[1] ?? m[1]!).replace(/\*+/g, "").trim();
  return what ? what.slice(0, 120) : null;
}

/** The «what» of a ⏳ line at the end of the answer — in its last three lines, or right before the LAST evidence / «Details»
 *  block (searched from the end, so a ⏳ line quoted earlier in the answer is never picked). Null when there is none. */
export function holdLine(text: string | null | undefined): string | null {
  const all = String(text ?? "").trimEnd().split("\n").filter((l) => l.trim());
  const ev = all.findLastIndex((l, i) => i > 0 && EVIDENCE_HEAD(l) && readHold(all[i - 1]!) !== null);
  const lines = ev > 0 ? [all[ev - 1]!] : all.slice(-3);
  for (let i = lines.length - 1; i >= 0; i--) { const h = readHold(lines[i]!); if (h) return h; }
  return null;
}
