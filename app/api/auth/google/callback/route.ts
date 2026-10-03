import { actAs, one } from "@/lib/db";
import { LANG_COOKIE } from "@/lib/i18n";
import { langCookie, langOfRequest } from "@/lib/i18n-server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/app-url";
import { createSession, sessionCookie, sessionKey, upsertUser } from "@/lib/session";
import { GOOGLE_HINT_COOKIE, GOOGLE_SILENT_COOKIE, hintCookieOpt, sealGoogleHint } from "@/lib/google-hint";
import { googleClientId, googleClientSecret } from "@/lib/google-env";
import { TZ_COOKIE } from "@/lib/tz";
import { currentUser } from "@/lib/session";
import { exchangeCode, saveConnection } from "@/lib/google-connect";
import { isOwnerEmail, saveYoutube } from "@/lib/youtube-connect";
import { APP_COOKIE, appHandoff, appNonce } from "@/lib/app-login";

type IdClaims = { iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string; exp?: number };

function decodeJwtPayload(jwt: string): IdClaims {
  const part = jwt.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as IdClaims;
}

export async function GET(req: Request) {
  const base = appUrl(req);
  const url = new URL(req.url);
  const jar = await cookies();
  const state = jar.get("uc_gs")?.value;
  const verifier = jar.get("uc_gv")?.value;
  const code = url.searchParams.get("code");
  // The quiet try (lib/google-hint.ts) came back with «needs you» (not signed in to Google, several accounts…): just show the buttons
  if (url.searchParams.get("error") && jar.get(GOOGLE_SILENT_COOKIE)?.value === "1") {
    const res = NextResponse.redirect(`${base}/login?e=silent`);
    res.cookies.delete("uc_gs"); res.cookies.delete("uc_gv"); res.cookies.delete(GOOGLE_SILENT_COOKIE);
    return res;
  }
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return NextResponse.redirect(`${base}/login?e=google_state`);
  // «Connect Google» for Calendar/Gmail/Drive (app/api/connect/google/start) comes back here too — same registered address.
  if (state.startsWith("c:")) {
    const me = await currentUser();
    const back = (r: string) => { const res = NextResponse.redirect(`${base}/app/settings?tab=ai&google=${r}`); res.cookies.delete("uc_gs"); res.cookies.delete("uc_gv"); return res; };
    if (!me) return back("login");
    const tok = await exchangeCode(code, verifier, `${base}/api/auth/google/callback`);
    if (!tok?.access_token) return back("failed");
    actAs(me.id);
    const got = await saveConnection(me.id, tok);
    return back(got.length ? "ok" : "none");
  }
  // Owner's «Connect YouTube» (app/api/connect/youtube/start) — Unchore's own channel for the growth loop's Shorts.
  if (state.startsWith("y:")) {
    const me = await currentUser();
    const back = (r: string) => { const res = NextResponse.redirect(`${base}/app?youtube=${r}`); res.cookies.delete("uc_gs"); res.cookies.delete("uc_gv"); return res; };
    if (!me || !isOwnerEmail(me.email)) return back("login");
    const tok = await exchangeCode(code, verifier, `${base}/api/auth/google/callback`);
    if (!tok?.access_token) return back("failed");
    actAs(me.id);
    return back((await saveYoutube(me.id, tok)) ? "ok" : "none");
  }
  // The token comes straight from Google over TLS (OIDC «code flow»), so the ID token's claims can be trusted after aud/iss checks.
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, code_verifier: verifier, grant_type: "authorization_code",
      client_id: googleClientId(), client_secret: googleClientSecret(),
      redirect_uri: `${base}/api/auth/google/callback`,
    }),
  }).catch(() => null);
  if (!r || !r.ok) return NextResponse.redirect(`${base}/login?e=google_token`);
  const tok = (await r.json()) as { id_token?: string };
  if (!tok.id_token) return NextResponse.redirect(`${base}/login?e=google_token`);
  const c = decodeJwtPayload(tok.id_token);
  const issOk = c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com";
  if (!issOk || !googleClientId() || c.aud !== googleClientId() || !c.email || !c.email_verified || !c.sub || (c.exp ?? 0) * 1000 < Date.now()) {
    return NextResponse.redirect(`${base}/login?e=google_claims`);
  }
  const lang = langOfRequest(req, jar.get(LANG_COOKIE)?.value);
  const uid = await upsertUser(c.email, { name: c.name ?? null, avatar: c.picture ?? null, googleSub: c.sub, lang, tz: jar.get(TZ_COOKIE)?.value ?? null });
  const nonce = appNonce(jar.get(APP_COOKIE)?.value);
  if (nonce) {   // started from the Android app: hand the sign-in to the app, not to this browser
    const res = await appHandoff(c.email, lang, jar.get(TZ_COOKIE)?.value ?? null, nonce);
    res.cookies.delete("uc_gs"); res.cookies.delete("uc_gv");
    return res;
  }
  const sid = await createSession(uid);
  const res = NextResponse.redirect(`${base}/app`);
  res.cookies.set(sessionCookie(sid));
  res.cookies.set(GOOGLE_HINT_COOKIE, sealGoogleHint(sessionKey(sid), c.email), hintCookieOpt);   // for a quiet sign-in after 30 unused days
  res.cookies.delete(GOOGLE_SILENT_COOKIE);
  const saved = await one<{ lang: string }>("select lang from users where id = $1", [uid]);
  res.cookies.set(langCookie(saved?.lang ?? lang));   // the account's language wins over this browser's from now on
  res.cookies.delete("uc_gs");
  res.cookies.delete("uc_gv");
  return res;
}
