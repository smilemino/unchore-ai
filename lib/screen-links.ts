// «Go to that screen» under an answer (AI Soul / shop help, 2026-10-02): when a member asks where something is
// («where do I connect Telegram?»), the answer links the Unchore screen (lib/set-marks.ts «Where things are») and the
// chat shows each in-app link as a button too — easier to tap than a word inside the text. Works in every language: it
// reads the link the AI wrote, not keywords. Only our own /app pages; outside links stay in the text.
export type ScreenLink = { label: string; href: string };

const LINK = /\[([^\]\n]{1,80})\]\((\/app(?:\/[\w-]+)*\/?(?:\?[\w=&-]*)?(?:#[\w-]+)?)\)/g;

/** In-app screens an answer links to, first ones first, each screen once. */
export function screenLinks(text: string, max = 2): ScreenLink[] {
  const out: ScreenLink[] = [];
  for (const m of text.matchAll(LINK)) {
    const label = m[1]!.replace(/[*_`]/g, "").trim(), href = m[2]!;
    if (!label || out.some((x) => x.href === href)) continue;
    out.push({ label, href });
    if (out.length >= max) break;
  }
  return out;
}
