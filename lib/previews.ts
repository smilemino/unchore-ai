// HTML preview (ported from AI Soul components/Preview.tsx + lib/previews.ts): an ```html block in an answer can be opened in a
// sealed box — its scripts run, but it can't reach this page, the member's sign-in, or the internet (sandbox without same-origin + CSP).
export const PREVIEW_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'">`;

/** Is this code block a page worth previewing? html/htm/svg blocks with at least one tag. */
export function isPreviewable(lang: string, body: string): boolean {
  return /^(html?|svg|xhtml)$/i.test(lang) && /<[a-z!][\s\S]*>/i.test(body);
}

/** The page the box shows: the CSP goes first in <head> (added if missing), so nothing inside can load or send anything. */
export function htmlDoc(body: string): string {
  if (/<head[\s>]/i.test(body)) return body.replace(/<head[^>]*>/i, (m) => `${m}${PREVIEW_CSP}`);
  if (/<html[\s>]/i.test(body)) return body.replace(/<html[^>]*>/i, (m) => `${m}<head>${PREVIEW_CSP}</head>`);
  return `<!doctype html><html><head><meta charset="utf-8">${PREVIEW_CSP}<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`;
}

/** A whole answer worth opening as a document (AI Soul lib/previews.ts findPreviews): a markdown table, or a long text with headings. */
export function docPreview(text: string): "Table" | "Document" | null {
  if (/^\|.+\|\s*$/m.test(text) && /^\|[-:| ]+\|\s*$/m.test(text)) return "Table";
  if (text.length > 1500 && /^#{1,3}\s/m.test(text)) return "Document";
  return null;
}

/** Every previewable block in these answers, oldest first (AI Soul lib/previews.ts previewVersions): the preview window flips
 *  through them (◀ 2/3 ▶) and opens at the one that was clicked — earlier tries of the same page stay one tap away. */
export function previewVersions(contents: string[], body: string): { list: string[]; start: number } {
  const list: string[] = [];
  for (const c of contents) for (const m of c.matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g)) {
    const b = (m[2] ?? "").replace(/\n$/, "");
    if (isPreviewable(m[1] ?? "", b) && list[list.length - 1] !== b) list.push(b);
  }
  const at = list.lastIndexOf(body);
  return at < 0 ? { list: [body], start: 0 } : { list, start: at };
}
