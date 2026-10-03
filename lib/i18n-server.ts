// Server side of the app's languages: every translation file is loaded here (never in the browser bundle —
// a screen gets only its own language's dictionary through components/I18n.tsx).
import { headers, cookies } from "next/headers";
import { LANG_COOKIE, asLang, makeT, pickLang, type Dict, type Lang, type TFn, type Vars } from "./i18n";
import { LOCALES } from "./locales";

/** The dictionary for one language (English has none — its keys are the text). */
export const dictFor = (lang: string): Dict => (LOCALES as Record<string, Dict>)[asLang(lang)] ?? {};
/** Translator for one language: trFor("ko")("Sign out") → «로그아웃». */
export const trFor = (lang: string): TFn => makeT(dictFor(lang));
/** One-off: tr("ko", "Sign out"). */
export const tr = (lang: string, en: string, vars?: Vars): string => trFor(lang)(en, vars);
export type { Lang };

/** A visitor's language on a server page: their pick (cookie), then the browser's languages, then the country Vercel saw. */
export async function requestLang(): Promise<Lang> {
  const h = await headers();
  return pickLang(h.get("accept-language"), (await cookies()).get(LANG_COOKIE)?.value, h.get("x-vercel-ip-country"));
}
/** Same for a route handler that has the request. */
export const langOfRequest = (req: Request, cookie?: string | null): Lang => pickLang(req.headers.get("accept-language"), cookie, req.headers.get("x-vercel-ip-country"));
/** Remembered for a year so the first screen after sign-in (and the page's lang/dir) matches the account. */
export const langCookie = (lang: string) => ({ name: LANG_COOKIE, value: asLang(lang), path: "/", maxAge: 31_536_000, sameSite: "lax" as const });
