// Card numbers in uploaded files are masked the moment they arrive — only the last 4 digits stay (ported from AI Soul
// lib/card-mask.ts, 2026-09-30 sync). A card number here: 13–19 digits (spaces or hyphens allowed between), a card prefix
// (3, 4, 5, 6, 9 or 2221–2720), passes the Luhn check, and is not glued to other letters or digits.
// Digits, spaces and hyphens are single bytes, so the file is read and written as latin1 — no other character in any encoding
// (UTF-8, EUC-KR) is touched. Masked output has no card number left, so masking twice changes nothing.
// Zip files (xlsx/docx/pptx and plain .zip) are opened and every text entry inside is masked too; PDFs and images stay as sent.
import { unzipSync, zipSync, type Zippable } from "fflate";

const SEQ = /(?<![0-9A-Za-z])\d(?:[ -]?\d){12,18}(?![0-9A-Za-z])/g;
const PREFIX = /^(?:3[0-9]|4|5|6|9|22[2-9]\d|2[3-6]\d\d|27[01]\d|2720)/;

export function looksLikeCard(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19 || !PREFIX.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function maskRun(run: string): string {
  let keep = 4;
  const out = run.split("");
  for (let i = out.length - 1; i >= 0; i--) {
    if (!/\d/.test(out[i]!)) continue;
    if (keep > 0) keep--; else out[i] = "*";
  }
  return out.join("");
}

/** Mask card numbers in text; returns how many were masked. */
export function maskCardsInText(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(SEQ, (run) => {
    if (!looksLikeCard(run.replace(/\D/g, ""))) return run;
    count++;
    return maskRun(run);
  });
  return { text: out, count };
}

// Numeric Excel cells (<c><v>1234…</v></c>) would break with a «*» inside, so they become text cells (inlineStr).
function maskXlsxNumericCells(xml: string): { text: string; count: number } {
  let count = 0;
  const out = xml.replace(/<c((?:\s[^>]*?)?)>\s*<v>(\d{13,19})<\/v>\s*<\/c>/g, (all, attrs: string, num: string) => {
    if (/\st="/.test(attrs) || !looksLikeCard(num)) return all;
    count++;
    return `<c${attrs} t="inlineStr"><is><t>${maskRun(num)}</t></is></c>`;
  });
  return { text: out, count };
}

const TEXTY_ENTRY = /\.(xml|rels|txt|csv|tsv|json|md|markdown|html?|log|ya?ml|sql|ini|toml|js|ts|py|sh)$/i;
const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const looksText = (b: Buffer) => !b.subarray(0, 8000).includes(0);
/** Files larger than this are left as sent instead of being unpacked in memory. */
export const MASK_MAX_BYTES = 100 * 1024 * 1024;

/** Mask one uploaded file. Returns the same buffer when nothing changed (PDF, images and binaries are left as they are). */
export function maskCardsInFile(data: Buffer): { data: Buffer; count: number } {
  if (data.length === 0 || data.length > MASK_MAX_BYTES) return { data, count: 0 };
  if (isZip(data)) {
    let entries: Record<string, Uint8Array>;
    try { entries = unzipSync(new Uint8Array(data)); } catch { return { data, count: 0 }; }
    let count = 0;
    const next: Zippable = {};
    for (const [name, bytes] of Object.entries(entries)) {
      if (!TEXTY_ENTRY.test(name) || name.endsWith("/")) { next[name] = bytes; continue; }
      const buf = Buffer.from(bytes);
      if (!looksText(buf)) { next[name] = bytes; continue; }
      const a = /^xl\/worksheets\/.*\.xml$/i.test(name) ? maskXlsxNumericCells(buf.toString("latin1")) : { text: buf.toString("latin1"), count: 0 };
      const b = maskCardsInText(a.text);
      count += a.count + b.count;
      next[name] = a.count + b.count > 0 ? new Uint8Array(Buffer.from(b.text, "latin1")) : bytes;
    }
    if (count === 0) return { data, count: 0 };
    return { data: Buffer.from(zipSync(next, { level: 6 })), count };
  }
  if (!looksText(data) || data.subarray(0, 5).toString("latin1") === "%PDF-") return { data, count: 0 };
  const r = maskCardsInText(data.toString("latin1"));
  return r.count === 0 ? { data, count: 0 } : { data: Buffer.from(r.text, "latin1"), count: r.count };
}
