// Time zone for a new account: the one the browser reported at sign-in (cookie uc_tz), not a fixed Seoul default
// (AI Soul is Korea-only; Unchore is global — found by the sync check 2026-09-30).
export const TZ_COOKIE = "uc_tz";

/** A real IANA time zone name, or null. */
export function validTz(v: string | null | undefined): string | null {
  if (!v || v.length > 64 || !/^[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(v)) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: v }); return v; } catch { return null; }
}

/** Browser's zone if it is valid; otherwise Seoul only for Korean, UTC for everyone else. */
export function signupTz(fromBrowser: string | null | undefined, lang: string | null | undefined): string {
  return validTz(fromBrowser) ?? (lang === "ko" ? "Asia/Seoul" : "UTC");
}
