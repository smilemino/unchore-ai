// Paste many memories at once — e.g. the Claude app's memory export («[2026-09-18] - …» one per line) or a list you wrote
// (ported from AI Soul lib/memory-import.ts, 2026-09-30 sync). Heading and group-label lines are not memories and are left out:
// a numbered summary pasted into «add memory» used to turn «7. Personal interests» into a memory of its own.
export type MemoryItem = { date: string | null; content: string };

const ENDS_SENTENCE = /([다요음함임됨죠까]|[.!?。])["'」』)]*$/;
export function isHeadingLine(s: string): boolean {
  const t = s.trim();
  if (/^#{1,6}\s/.test(t)) return true;                                                   // # heading
  if (/^(\[[^\]]{1,40}\]|【[^】]{1,40}】)$/.test(t)) return !/^\[\d{4}-\d{2}-\d{2}\]$/.test(t);   // [Work]
  if (/^\*\*[^*]{1,40}\*\*[:：]?$/.test(t)) return true;                                    // **Bold title**
  if (t.length <= 40 && /[:：]$/.test(t)) return true;                                      // «Pricing:»
  if (t.length <= 40 && /^\d{1,2}[.)]\s*\S/.test(t) && !ENDS_SENTENCE.test(t)) return true;   // «7. Personal interests»
  if (/^[^:：]{1,30}\s\d{1,3}\s?(개|items?)$/i.test(t)) return true;                        // «Projects 2 items»
  return false;
}

/** Pasted text → memory lines, plus the heading lines left out. In a bulleted paste, a short non-sentence line right before a
 *  bullet or heading is a list title too. */
export function splitMemoryPaste(text: string): { items: MemoryItem[]; skipped: string[] } {
  const lines = text.replace(/```[a-z]*/g, "").split("\n").map((raw) => ({ bullet: /^\s*[-*•]\s+/.test(raw), line: raw.trim().replace(/^[-*•]\s+/, "") })).filter((x) => x.line);
  const bullets = lines.filter((x) => x.bullet).length;
  const items: MemoryItem[] = [];
  const skipped: string[] = [];
  lines.forEach(({ bullet, line }, i) => {
    const m = line.match(/^\[?(\d{4}-\d{2}-\d{2})\]?\s*[-–—:]?\s*(.+)$/);
    if (m) { items.push({ date: m[1]!, content: m[2]!.trim() }); return; }
    if (line.length < 4) return;
    const next = lines[i + 1];
    const titleOfList = bullets >= 2 && !bullet && !!next && (next.bullet || isHeadingLine(next.line)) && line.length <= 30 && !ENDS_SENTENCE.test(line) && !/[:：]./.test(line);
    if (isHeadingLine(line) || titleOfList) { skipped.push(line); return; }
    items.push({ date: null, content: line });
  });
  return { items, skipped };
}
