import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { token } from "@/lib/crypto";
import { googleClientId } from "@/lib/google-env";
import { APP_COOKIE, APP_COOKIE_OPT, fromApp } from "@/lib/app-login";
import { cookies } from "next/headers";
import { GOOGLE_HINT_COOKIE, GOOGLE_SILENT_COOKIE, openGoogleHint } from "@/lib/google-hint";

export async function GET(req: Request) {
  const id = googleClientId();
  if (!id) return NextResponse.redirect(`${appUrl(req)}/login?e=google_off`);
  // ?silent=1 — the login page asks Google again without a prompt (lib/google-hint.ts); only with this device's own note
  const silent = new URL(req.url).searchParams.get("silent") === "1";
  const hint = silent ? openGoogleHint((await cookies()).get(GOOGLE_HINT_COOKIE)?.value) : null;
  if (silent && !hint) return NextResponse.redirect(`${appUrl(req)}/login?e=silent`);
  const state = token(16);
  const verifier = token(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", `${appUrl(req)}/api/auth/google/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", hint ? "none" : "select_account");
  if (hint) u.searchParams.set("login_hint", hint.email);
  const res = NextResponse.redirect(u.toString());
  const opt = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("uc_gs", state, opt);
  res.cookies.set("uc_gv", verifier, opt);
  if (hint) res.cookies.set(GOOGLE_SILENT_COOKIE, "1", opt); else res.cookies.delete(GOOGLE_SILENT_COOKIE);
  const nonce = fromApp(req);
  if (nonce) res.cookies.set(APP_COOKIE, nonce, APP_COOKIE_OPT);   // the Android app opened this in the phone's browser (lib/app-login.ts)
  else res.cookies.delete(APP_COOKIE);
  return res;
}
