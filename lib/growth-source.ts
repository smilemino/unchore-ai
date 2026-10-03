// Growth wheel (plan v11 §13 A·B): where a new member came from, and «send to a friend».
// The browser keeps the first touch in the uc_src cookie (components/SourceMark.tsx); the server writes it once, when the account is made.
import { randomBytes } from "node:crypto";
import { one, q } from "./db";

export const SOURCE_COOKIE = "uc_src";
const CODE = /^[a-z2-9]{6,12}$/;

/** Only «ref:<code>», «utm:<source>/<campaign>» or «site:<host>» — short, plain characters, nothing else survives. */
export function cleanSource(raw: string | null | undefined): string | null {
  let s = (raw ?? "").trim();
  try { s = decodeURIComponent(s); } catch { return null; }
  const m = /^(ref|utm|site):([A-Za-z0-9._\-/]{1,80})$/.exec(s);
  if (!m) return null;
  if (m[1] === "ref" && !CODE.test(m[2]!)) return null;
  return `${m[1]}:${m[2]}`;
}

/** 8 letters from a–z and 2–9 (no 0/1/o/l to misread). */
export function newRefCode(): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...randomBytes(8)].map((b) => abc[b % abc.length]).join("");
}

/** Right after a new account is made: remember where it came from and, for a friend link, who sent it (never yourself). */
export async function applySource(uid: string, raw: string | null | undefined): Promise<void> {
  const src = cleanSource(raw);
  if (!src) return;
  const code = src.startsWith("ref:") ? src.slice(4) : null;
  await q(
    `update users set source = coalesce(source, $2),
       ref_by = coalesce(ref_by, (select r.id from users r where $3::text is not null and r.ref_code = $3 and r.id <> $1))
     where id = $1`, [uid, src, code]);
}

/** This member's share code (made once, kept). Runs as the member — it only touches their own row. */
export async function myRefCode(uid: string): Promise<string> {
  const have = await one<{ ref_code: string | null }>("select ref_code from users where id = $1", [uid]);
  if (have?.ref_code) return have.ref_code;
  for (let i = 0; i < 5; i++) {
    const code = newRefCode();
    try {
      const row = await one<{ ref_code: string }>("update users set ref_code = coalesce(ref_code, $2) where id = $1 returning ref_code", [uid, code]);
      if (row?.ref_code) return row.ref_code;
    } catch { /* taken by someone else — try another */ }
  }
  throw new Error("no ref code");
}

/** The link a friend opens: who sent it, and which recipe to set up (no one's own settings travel with it). */
export function shareUrl(code: string, recipe: string): string {
  const u = new URL("https://unchore.ai/");
  u.searchParams.set("ref", code);
  if (/^[a-z_]{2,40}$/.test(recipe)) u.searchParams.set("try", recipe);
  return u.toString();
}
