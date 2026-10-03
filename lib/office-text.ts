// Excel · Word · PowerPoint attachments as text for the AI (10/1 owner «Unchore can't read Excel either — find why it isn't synced»).
// All three are zips of XML, so fflate (already here) opens them and only the words and tables come out. Parsing ported from AI Soul
// lib/office-preview.ts (its file preview); here the result goes to the AI as data. Runs in Node (upload) — no new dependency.
import { strFromU8, unzipSync } from "fflate";

export const MAX_ROWS = 2000;
export const MAX_COLS = 60;

const decode = (s: string) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
  e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&"
    : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
/** The text pieces <tag>…</tag> inside one block, joined (a run of text is often split into several pieces). */
const texts = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*[^/])?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => decode(m[1]!)).join("");
const blocks = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${tag}>)`, "g"))];
const attr = (tagText: string, name: string) => tagText.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Cap on the unpacked XML total — a tiny file that unpacks huge (zip bomb) or a giant sheet is refused «before» unpacking, from the size table (10/1 review P1). */
export const MAX_UNZIPPED = 150 * 1024 * 1024;
function files(buf: Uint8Array): Record<string, string> {
  let total = 0;
  const raw = unzipSync(buf, { filter: (f) => {
    if (!/\.xml$|\.rels$/.test(f.name)) return false;
    total += f.originalSize;
    if (total > MAX_UNZIPPED) throw new Error("too large when unpacked");
    return true;
  } });
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = strFromU8(v);
  return out;
}
/** Relationship id → file path. */
function rels(xml: string | undefined, base: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of (xml ?? "").matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(m[0], "Id"), t = attr(m[0], "Target");
    if (id && t) out[id] = t.startsWith("/") ? t.slice(1) : `${base}${t}`.replace(/[^/]+\/\.\.\//g, "");
  }
  return out;
}
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export type Sheet = { name: string; rows: string[][]; cut: boolean };
/** Each sheet's rows of cells (the file preview shows them as tables; xlsxText turns them into text for the AI). */
export function xlsxSheets(buf: Uint8Array): Sheet[] {
  const f = files(buf);
  const shared = blocks(f["xl/sharedStrings.xml"] ?? "", "si").map((m) => texts(m[1] ?? "", "t"));
  const r = rels(f["xl/_rels/workbook.xml.rels"], "xl/");
  const sheets = blocks(f["xl/workbook.xml"] ?? "", "sheet").map((m) => ({ name: decode(attr(m[0], "name") ?? ""), path: r[attr(m[0], "r:id") ?? ""] ?? "" }));
  return sheets.map(({ name, path }) => {
    const rows: string[][] = [];
    let cut = false;
    for (const row of blocks(f[path] ?? "", "row")) {
      if (rows.length >= MAX_ROWS) { cut = true; break; }
      const cells: string[] = [];
      for (const c of blocks(row[1] ?? "", "c")) {
        const ref = attr(c[0], "r"); const t = attr(c[0], "t"); const body = c[1] ?? "";
        const i = ref ? colIndex(ref) : cells.length;
        if (i >= MAX_COLS) { cut = true; continue; }
        const v = texts(body, "v");
        cells[i] = t === "s" ? (shared[Number(v)] ?? "") : t === "inlineStr" ? texts(body, "t") : t === "b" ? (v === "1" ? "TRUE" : "FALSE") : v;
      }
      const line = Array.from(cells, (x) => (x ?? "").replace(/[\t\n]/g, " "));
      if (line.join("").trim()) rows.push(line);
    }
    return { name, rows, cut };
  });
}

/** Each sheet as tab-separated rows under «## sheet name». */
export function xlsxText(buf: Uint8Array): string {
  return xlsxSheets(buf).map(({ name, rows, cut }) => `## ${name}\n${rows.map((r) => r.join("\t")).join("\n")}${cut ? "\n… (cut here)" : ""}`).join("\n\n");
}

/** Non-empty paragraphs in order. */
export function docxParagraphs(buf: Uint8Array): string[] {
  const doc = files(buf)["word/document.xml"] ?? "";
  return blocks(doc, "w:p").map((p) => texts(p[1] ?? "", "w:t")).filter((x) => x.trim() !== "");
}
/** Paragraphs, one per line. */
export const docxText = (buf: Uint8Array): string => docxParagraphs(buf).join("\n");

/** Each slide's non-empty text lines, slides in order. */
export function pptxSlides(buf: Uint8Array): string[][] {
  const f = files(buf);
  const r = rels(f["ppt/_rels/presentation.xml.rels"], "ppt/");
  let order = blocks(f["ppt/presentation.xml"] ?? "", "p:sldId").map((m) => r[attr(m[0], "r:id") ?? ""]).filter((x): x is string => !!x && !!f[x]);
  if (!order.length) order = Object.keys(f).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  return order.map((path) => blocks(f[path] ?? "", "a:p").map((p) => texts(p[1] ?? "", "a:t")).filter((t) => t.trim() !== ""));
}
/** Slides in order, each under «## Slide N». */
export const pptxText = (buf: Uint8Array): string => pptxSlides(buf).map((lines, i) => `## Slide ${i + 1}\n${lines.join("\n")}`).join("\n\n");

export { officeKind, type OfficeKind } from "./office-kind";
