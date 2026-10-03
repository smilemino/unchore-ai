import { k } from "./i18n";

// Settings «Files» (owner 2026-10-03, with AI Soul's settings: «make files and devices easier on the brain — more tabs are fine»).
// Instead of one long list: kind chips (pick a group at a glance) and «when» groups (today · this week · earlier) — people
// recognise «it was a picture, this week» far more easily than they recall a file name. Pure helpers; the screen is Settings.tsx.

export type FileKind = "image" | "doc" | "sheet" | "media" | "other";
export const FILE_KINDS: ReadonlyArray<{ id: FileKind; en: string; icon: string }> = [
  { id: "image", en: k("Pictures"), icon: "🖼" },
  { id: "doc", en: k("Documents"), icon: "📄" },
  { id: "sheet", en: k("Sheets"), icon: "📊" },
  { id: "media", en: k("Audio & video"), icon: "🎬" },
  { id: "other", en: k("Other#files"), icon: "📦" },
];

/** A file's group — its type (mime) first, then the end of its name (.xlsx, .png …): a phone photo saved as «IMG_0412»
 *  or a voice memo without an ending still lands under Pictures / Audio & video (AI Soul 06406d5 fileKind). */
export function fileKind(name: string, mime?: string | null): FileKind {
  const m = (mime ?? "").toLowerCase();
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  if (m.startsWith("image/") || /^(png|jpe?g|gif|webp|heic|heif|bmp|svg|avif)$/.test(ext)) return "image";
  if (m.startsWith("audio/") || m.startsWith("video/") || /^(mp3|m4a|wav|ogg|webm|mp4|mov|avi|mkv|aac|flac)$/.test(ext)) return "media";
  if (/spreadsheet|excel|csv/.test(m) || /^(xlsx|xls|csv|tsv|ods)$/.test(ext)) return "sheet";
  if (m === "application/pdf" || m.startsWith("text/") || /word|presentation|powerpoint|hwp|rtf|opendocument\.text/.test(m)
    || /^(pdf|txt|md|doc|docx|hwp|hwpx|ppt|pptx|rtf|odt|json|html)$/.test(ext)) return "doc";
  return "other";
}

export type DayGroup = "today" | "week" | "older";
export const DAY_GROUPS: ReadonlyArray<{ id: DayGroup; en: string }> = [
  { id: "today", en: k("Today") }, { id: "week", en: k("This week") }, { id: "older", en: k("Earlier") },
];
/** Today (the member's own calendar day, in the browser's time zone) · the last 7 days · earlier. */
export function dayGroup(iso: string, now: number): DayGroup {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "older";
  if (new Date(t).toDateString() === new Date(now).toDateString()) return "today";
  return now - t < 7 * 86400_000 ? "week" : "older";
}

/** 1,234,567 → «1.2 MB» · 900 → «1 KB» (never «0 KB», which reads like an empty file). */
export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) { const mb = bytes / 1024 ** 2; return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`; }
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
