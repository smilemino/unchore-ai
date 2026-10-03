import { isLang } from "@/lib/i18n";
import { tr } from "@/lib/i18n-server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { sha256, token } from "@/lib/crypto";
import { q, one } from "@/lib/db";
import { esc, sendMail } from "@/lib/mail";
import { googleOn } from "@/lib/google-env";
import { cookies } from "next/headers";
import { TZ_COOKIE, validTz } from "@/lib/tz";
import { appSignInUrl, inAppView } from "@/lib/app-login";
import { LIMITS, clientIp, countAsks, placeKey, refuse } from "@/lib/login-limit";

const Body = z.object({ email: z.string().email().max(200), lang: z.string().refine(isLang).optional() });

export async function POST(req: Request) {
  if (googleOn()) return NextResponse.json({ error: "google_only" }, { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_email" }, { status: 400 });
  const email = b.data.email.toLowerCase();
  // At most 5 links per address per hour.
  const recent = await one<{ n: number }>("select count(*)::int as n from login_tokens where email = $1 and expires_at > now() - interval '45 minutes'", [email]);
  if ((recent?.n ?? 0) >= 5) return NextResponse.json({ error: "too_many" }, { status: 429 });
  // And once a minute from the same place, a few addresses an hour from one place, a ceiling for the whole site (lib/login-limit.ts).
  const from = placeKey(clientIp(req.headers));
  const no = refuse(await countAsks(from, email));
  if (no) return NextResponse.json({ error: no, ...(no === "wait" ? { retry_after: LIMITS.sameSec } : {}) }, { status: 429 });
  const t = token(32);
  // The link may be opened in another browser (a phone's mail app) that knows neither — keep this browser's language and time zone with it.
  const tz = validTz((await cookies()).get(TZ_COOKIE)?.value);
  await q("insert into login_tokens(token_hash, email, expires_at, lang, tz, requested_from) values ($1, $2, now() + interval '15 minutes', $3, $4, $5)", [sha256(t), email, b.data.lang ?? null, tz, from]);
  // Asked from inside the Android app: the link opens the app, not the phone's browser (lib/app-login.ts).
  const link = inAppView(req) ? appSignInUrl(appUrl(req), t) : `${appUrl(req)}/api/auth/email/verify?t=${t}`;
  const lang = b.data.lang ?? "en";
  const subject = tr(lang, "Your Unchore sign-in link");
  const line = tr(lang, "Click below to sign in. The link works once, for 15 minutes.");
  const btn = tr(lang, "Sign in to Unchore");
  const html = `<p>${esc(line)}</p><p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#1f1f1f;color:#fff;border-radius:8px;text-decoration:none">${esc(btn)}</a></p><p style="color:#888;font-size:12px">${tr(lang, "If you didn't ask for this, ignore this e-mail.")}</p>`;
  const sent = await sendMail(email, subject, html, `${line}\n${link}`);
  if (!sent) return NextResponse.json({ error: "mail_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
