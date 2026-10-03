// The «Details» part at the end of an answer starts folded (ported from AI Soul lib/answer-fold.ts, 2026-09-30 sync — folding the
// technical part cut time-to-finish 30–50% in NN/g studies). The persona keeps code, paths and setting names there, so the main text
// reads on its own. The copy button still copies the whole answer.
import { wordsSrc } from "./words";
import W_DETAILS from "./words/heading_details.json";

// Korean/English by hand, the heading in every other language from lib/words («詳細», «Einzelheiten»…).
const MARK = new RegExp(`^[ \\t#>*_-]*(?:Details|근거[ \\t]*\\([ \\t]*기술[ \\t]*\\)|자세한[ \\t]*내용|${wordsSrc(W_DETAILS, false)})[ \\t]*[:：]?[ \\t*_]*$`, "gimu");   // a heading line on its own

const MARK_LINE = new RegExp(MARK.source, "iu");
/** One line that is a «Details» heading on its own (lib/hold-line.ts). */
export function isDetailsHead(line: string): boolean { return MARK_LINE.test(line); }

export function splitTech(content: string): { head: string; tech: string } | null {
  let last = -1;
  for (const m of content.matchAll(MARK)) last = m.index ?? -1;
  if (last < 0 || last < content.length * 0.4) return null;   // the word early in an answer is not the end part
  const tech = content.slice(last).trim();
  if (tech.length < 60) return null;   // one short line isn't worth folding
  const head = content.slice(0, last).replace(/\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*\n*$/, "\n").trimEnd();
  return head ? { head, tech } : null;
}
