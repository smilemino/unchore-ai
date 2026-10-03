import { one } from "./db";
import { open, seal } from "./crypto";

// Quiet Google sign-in again (AI Soul lib/server/google.ts sealHint · report 113): a device that came in with Google keeps a sealed note
// of that sign-in (which session, which address — 400 days). When that sign-in ended *by itself* (30 days unused), the login page asks
// Google again without a prompt and the member is back in without pressing anything. «Sign out», a device sign-out and «Sign out
// everywhere» delete the session row and drop the note, so a lost phone does not come back in on its own.
export const GOOGLE_HINT_COOKIE = "uc_gh";
export const GOOGLE_SILENT_COOKIE = "uc_gsil";   // this Google trip was the quiet one — an error from Google means «show the button»
const HINT_DAYS = 400;
export type GoogleHint = { sid: string; email: string; exp: number };
export const hintCookieOpt = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: HINT_DAYS * 86400 };

/** The note to keep on the device: the session's key (a hash, as stored), the address, and when the note runs out. */
export function sealGoogleHint(sid: string, email: string, now = Date.now()): string {
  return Buffer.from(seal(JSON.stringify({ sid, email, exp: now + HINT_DAYS * 86400_000 }))).toString("base64url");
}
/** Reads the note back; anything changed, broken or run out reads as none. */
export function openGoogleHint(v: string | undefined, now = Date.now()): GoogleHint | null {
  if (!v) return null;
  try {
    const h = JSON.parse(open(Buffer.from(v, "base64url").toString("utf8"))) as Partial<GoogleHint>;
    return typeof h.sid === "string" && typeof h.email === "string" && typeof h.exp === "number" && h.exp > now ? (h as GoogleHint) : null;
  } catch { return null; }
}
/** That sign-in ran out by itself (its row is still there, past its end). A signed-out one has no row; a live one hasn't ended. */
export async function hintLapsed(h: GoogleHint): Promise<boolean> {
  return Boolean(await one<{ x: number }>("select 1 as x from sessions where id = $1 and expires_at <= now()", [h.sid]).catch(() => null));
}
