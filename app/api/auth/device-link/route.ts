import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { appSignInUrl } from "@/lib/app-login";
import { sha256, token } from "@/lib/crypto";
import { one, q } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
// «Sign in on another device» (ported from AI Soul): a signed-in member makes a one-time link and opens it on the phone —
// the app opens and signs in, no e-mail or Google needed there. Shown only on this screen, never sent anywhere; once, 10 minutes.
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const recent = await one<{ n: number }>("select count(*)::int as n from login_tokens where email = $1 and expires_at > now() - interval '45 minutes'", [me.email]);
  if ((recent?.n ?? 0) >= 5) return NextResponse.json({ error: "too_many" }, { status: 429 });
  const t = token(32);
  await q("insert into login_tokens(token_hash, email, expires_at, lang, tz) values ($1, $2, now() + interval '10 minutes', $3, $4)", [sha256(t), me.email.toLowerCase(), me.lang ?? null, me.tz ?? null]);
  return NextResponse.json({ ok: true, url: appSignInUrl(appUrl(req), t) }, { headers: { "cache-control": "no-store" } });
}
