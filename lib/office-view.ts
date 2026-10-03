// The Excel · Word · PowerPoint preview page (app/view/[id]) — the member's own file only, read here on the server, never sent anywhere.
// Ported from AI Soul app/view/[id] + lib/office-preview.ts (10/3 owner «yes»). Shows the words and tables, not the original layout.
import { asMember, one } from "./db";
import { unlockBytes } from "./privacy";
import { officeKind } from "./office-kind";
import { docxParagraphs, pptxSlides, xlsxSheets, type Sheet } from "./office-text";

/** Bigger files are not opened for a preview (the download link stays). */
export const PREVIEW_MAX = 20 * 1024 * 1024;

export type Preview =
  | { kind: "xlsx"; name: string; size: number; sheets: Sheet[] }
  | { kind: "docx"; name: string; size: number; paragraphs: string[] }
  | { kind: "pptx"; name: string; size: number; slides: string[][] }
  | { kind: "none" | "too_big" | "broken"; name: string; size: number };

/** null when the file is missing or someone else's — the page answers «not found» either way. */
export async function loadPreview(userId: string, id: string): Promise<Preview | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const f = await asMember(userId, () => one<{ name: string; mime: string; size: number; data: Buffer | null; parts_of: string | null }>(
    "select name, mime, size, case when parts_of is null and size <= $3 then data end as data, parts_of from files where id = $1 and user_id = $2", [id, userId, PREVIEW_MAX]));
  if (!f) return null;
  const head = { name: f.name, size: Number(f.size) };
  const kind = officeKind(f.mime, f.name);
  if (!kind) return { kind: "none", ...head };
  if (!f.data) return { kind: "too_big", ...head };
  try {
    const buf = new Uint8Array(unlockBytes(f.data));
    if (kind === "xlsx") return { kind, ...head, sheets: xlsxSheets(buf) };
    if (kind === "docx") return { kind, ...head, paragraphs: docxParagraphs(buf) };
    return { kind, ...head, slides: pptxSlides(buf) };
  } catch {
    return { kind: "broken", ...head };
  }
}
