import { LANG_COOKIE } from "@/lib/i18n";
import { langCookie, langOfRequest } from "@/lib/i18n-server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TZ_COOKIE } from "@/lib/tz";
import { appUrl } from "@/lib/app-url";
import { sha256 } from "@/lib/crypto";
import { one } from "@/lib/db";
import { createSession, sessionCookie, upsertUser } from "@/lib/session";

export async function GET(req: Request) {
  const base = appUrl(req);
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const row = await one<{ email: string; lang: string | null; tz: string | null }>(
    "update login_tokens set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning email, lang, tz",
    [sha256(t)],
  );
  if (!row) return NextResponse.redirect(`${base}/login?e=link_expired`);
  const jar = await cookies();
  // This browser's own picks first; else what the browser that asked for the link had (lib/tz validates the zone).
  const lang = langOfRequest(req, jar.get(LANG_COOKIE)?.value ?? row.lang);
  const uid = await upsertUser(row.email, { lang, tz: jar.get(TZ_COOKIE)?.value ?? row.tz ?? null });
  const sid = await createSession(uid);
  const res = NextResponse.redirect(`${base}/app`);
  res.cookies.set(sessionCookie(sid));
  const saved = await one<{ lang: string }>("select lang from users where id = $1", [uid]);
  res.cookies.set(langCookie(saved?.lang ?? lang));   // the account's language wins over this browser's from now on
  return res;
}
