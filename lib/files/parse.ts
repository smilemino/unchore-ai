// Pulls the file blocks out of an answer. The block format is described in FILES_GUIDE (lib/files/index.ts).
import type { FileSpec, FileFormat } from "./types";

const FENCE = /```(?:unchore-file|soul-file)\s*\n([\s\S]*?)\n```/g;
const FORMATS = new Set<FileFormat>(["xlsx", "docx", "pptx", "pdf"]);

export interface Parsed { specs: FileSpec[]; text: string; bad: string[] }

function toSpec(raw: unknown): FileSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const format = String(o.format ?? "").toLowerCase() as FileFormat;
  if (!FORMATS.has(format)) return null;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : `unchore.${format}`;
  if (format === "xlsx") {
    const sheets = Array.isArray(o.sheets) ? o.sheets : [];
    const cleaned = sheets.filter((s): s is Record<string, unknown> => !!s && typeof s === "object").map((s) => ({
      name: typeof s.name === "string" ? s.name : undefined,
      rows: (Array.isArray(s.rows) ? s.rows : []).filter(Array.isArray).map((r) => (r as unknown[]).map((c) => (typeof c === "number" || typeof c === "string" ? c : c === null || c === undefined ? null : String(c)))),
    }));
    if (cleaned.length === 0) return null;
    return { format, name, sheets: cleaned };
  }
  if (format === "pptx") {
    const slides = (Array.isArray(o.slides) ? o.slides : []).filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({ title: String(s.title ?? ""), bullets: (Array.isArray(s.bullets) ? s.bullets : []).map(String) }));
    if (slides.length === 0) return null;
    return { format, name, slides };
  }
  const paras = (Array.isArray(o.paragraphs) ? o.paragraphs : []).map((p) => {
    if (typeof p === "string") return { text: p, style: "body" as const };
    const q = (p ?? {}) as Record<string, unknown>;
    const style: "title" | "heading" | "body" = q.style === "title" ? "title" : q.style === "heading" ? "heading" : "body";
    return { text: String(q.text ?? ""), style };
  }).filter((p) => p.text !== "" || p.style === "body");
  if (paras.length === 0) return null;
  return { format, name, paragraphs: paras };
}

/** 블록을 뽑고, 답 본문에서는 «내려받기» 한 줄로 바꿔 둔다(so the raw JSON never shows on the user's screen). */
export function parseAnswer(text: string): Parsed {
  const specs: FileSpec[] = [];
  const bad: string[] = [];
  const out = String(text).replace(FENCE, (_m, body: string) => {
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { bad.push("broken JSON"); return "(Could not make the file — the content was malformed.)"; }
    const spec = toSpec(raw);
    if (!spec) { bad.push("missing fields"); return "(Could not make the file — some fields were missing.)"; }
    specs.push(spec);
    return `📎 ${spec.name}`;
  });
  return { specs, text: out, bad };
}
