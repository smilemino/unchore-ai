// What the AI gets from an attached file (10/1 owner «Unchore can't read Excel and the like — find why it isn't synced»).
// Before: only plain-text files were read; PDF (AI Soul reads it with unpdf · lib/server/attachments.ts) and Excel/Word/PowerPoint
// went to the AI as «content not readable». Now: text → as is · PDF → its text · xlsx/docx/pptx → words and tables (lib/office-text.ts).
// Card numbers are masked in what comes out (the zip/PDF bytes hide them from the byte-level mask on arrival).
import { maskCardsInText } from "./card-mask";
import { docxText, officeKind, pptxText, xlsxText } from "./office-text";
import { decodeText } from "./text-decode";

export const EXTRACT_MAX = 2_000_000;
const TEXTY = /^(text\/|application\/(json|xml|csv|x-yaml|yaml|javascript|typescript|x-sh|sql))/;
export function isTexty(mime: string, name: string): boolean { return TEXTY.test(mime) || /\.(txt|md|csv|tsv|json|xml|ya?ml|html?|js|ts|tsx|py|sql|log|ini|toml)$/i.test(name); }
export const isPdf = (mime: string, name: string) => mime === "application/pdf" || /\.pdf$/i.test(name);
/** Can extractText get words out of this kind of file? */
export const readable = (mime: string, name: string) => isTexty(mime, name) || isPdf(mime, name) || officeKind(mime, name) !== null;

async function raw(name: string, mime: string, buf: Uint8Array): Promise<string | null> {
  if (isTexty(mime, name)) return decodeText(buf);
  const k = officeKind(mime, name);
  if (k) return k === "xlsx" ? xlsxText(buf) : k === "docx" ? docxText(buf) : pptxText(buf);
  if (isPdf(mime, name)) {
    const { extractText: ex, getDocumentProxy } = await import("unpdf");
    const r = await ex(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
    return Array.isArray(r.text) ? r.text.join("\n") : String(r.text);
  }
  return null;
}

/** The file's words for the AI, or null when there are none (a scanned PDF, a broken file, a kind we don't read). Never throws. */
export async function extractText(name: string, mime: string, buf: Uint8Array): Promise<string | null> {
  const t = await raw(name, mime, buf).catch(() => null);
  return t && t.trim() ? maskCardsInText(t.slice(0, EXTRACT_MAX)).text : null;
}
