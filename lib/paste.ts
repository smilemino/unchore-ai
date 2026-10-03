import type { TFn } from "./i18n";
// A very long paste becomes a «Pasted text» file attachment instead of filling the input box (like the Claude app;
// ported from AI Soul lib/paste.ts, 2026-09-30 sync). 4,000 characters is already 23× the box height on a computer and
// 57× on a phone, so it can't be read or edited there; 50,000 characters freezes typing for about 1.5 s.
export const PASTE_ATTACH_CHARS = 4000;

/** Should this pasted text go in as a file attachment? */
export function shouldAttachPaste(text: string): boolean {
  return text.length > PASTE_ATTACH_CHARS;
}

/** File name for the n-th pasted text in this message («Pasted text.txt», «Pasted text 2.txt», …). */
export function pasteFileName(existing: string[], t: TFn): string {
  const base = t("Pasted text");
  const n = existing.filter((x) => x.startsWith(base)).length;
  return n ? `${base} ${n + 1}.txt` : `${base}.txt`;
}
