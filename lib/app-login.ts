// Signing in from the Android app (android/unchore-app, owner 2026-09-30 «put Unchore on Google Play»).
// Google refuses sign-in inside an app's web view, so the app opens «Continue with Google» in the phone's browser (a Custom Tab)
// with ?app=1. The browser signs in as usual; at the end, instead of a session in the browser, we make a one-time link that works
// for 2 minutes (the same table as e-mail links) and hand it to the app through an intent that only our package can receive.
// The app opens that link in its own web view (/api/auth/email/verify), which sets the session there.
import { NextResponse } from "next/server";
import { esc } from "./mail";
import { sha256, token } from "./crypto";
import { q } from "./db";
import { tr } from "./i18n-server";

export const APP_PACKAGE = "ai.unchore.app";
// Signing prints the app may be signed with (/.well-known/assetlinks.json). The first is our upload key (/workspace/.secrets/unchore-app.jks).
// When Google Play signs the app with its own key, add Play's print too (Play Console → App integrity → App signing key certificate → SHA-256).
export const APP_CERTS = [
  "5F:4C:02:DC:1C:92:B6:82:89:71:D4:7F:07:05:A6:46:CB:13:62:B9:C1:D3:BA:CE:CA:B8:75:63:6D:5F:C2:7D",
];
export const APP_COOKIE = "uc_app";   // the app's nonce, set by /api/auth/{google,github}/start?app=1&n=… in the browser, read by the callback
export const APP_COOKIE_OPT = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };

const NONCE = /^[A-Za-z0-9]{16,64}$/;
/** The start request came from the app: ?app=1&n=<nonce>. The app made the nonce for this sign-in and takes the link back only
 *  with the same nonce — so a web page can't push someone else's sign-in link into the app (login forgery). Null otherwise. */
export function fromApp(req: Request): string | null {
  const sp = new URL(req.url).searchParams;
  const n = sp.get("n") ?? "";
  return sp.get("app") === "1" && NONCE.test(n) ? n : null;
}
/** The nonce the browser kept from the start (the callback reads the cookie). */
export const appNonce = (v: string | undefined): string | null => (v && NONCE.test(v) ? v : null);

/** The request came from the app's own web view (MainActivity adds «UnchoreApp/» to its user agent). */
export const inAppView = (req: Request): boolean => /\bUnchoreApp\//.test(req.headers.get("user-agent") ?? "");
/** A one-time sign-in link the app opens itself: /app… is an App Link (AndroidManifest.xml), so on a phone with the app
 *  the tap lands in the app's web view and signs in there — for members who sign in by e-mail or bring in a new device. */
export const appSignInUrl = (base: string, t: string): string => `${base}/app/signin?t=${encodeURIComponent(t)}`;

/** intent:// link that opens only our app (never another app claiming the same scheme). */
export function appIntent(t: string, nonce: string): string {
  return `intent://login?t=${encodeURIComponent(t)}&n=${encodeURIComponent(nonce)}#Intent;scheme=unchore;package=${APP_PACKAGE};end`;
}

/** Makes the one-time link and answers with a small page that opens the app (by itself, and with a button if the browser waits for a tap). */
export async function appHandoff(email: string, lang: string, tz: string | null, nonce: string): Promise<NextResponse> {
  const t = token(32);
  await q("insert into login_tokens(token_hash, email, expires_at, lang, tz) values ($1, $2, now() + interval '2 minutes', $3, $4)", [sha256(t), email.toLowerCase(), lang, tz]);
  const href = appIntent(t, nonce);
  const title = tr(lang, "Opening the Unchore app…");
  const btn = tr(lang, "Open the Unchore app");
  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unchore</title></head>`
    + `<body style="font-family:system-ui,sans-serif;background:#f7f6f2;color:#1f1f1f;display:flex;min-height:90vh;align-items:center;justify-content:center;text-align:center">`
    + `<div><p style="font-size:18px">${esc(title)}</p><p><a id="go" href="${esc(href)}" style="display:inline-block;padding:12px 20px;background:#1f1f1f;color:#fff;border-radius:10px;text-decoration:none">${esc(btn)}</a></p></div>`
    + `<script>location.href=document.getElementById("go").href</script></body></html>`;
  const res = new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  res.cookies.delete(APP_COOKIE);
  return res;
}
