import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { token } from "@/lib/crypto";
import { githubClientId } from "@/lib/github-env";
import { APP_COOKIE, APP_COOKIE_OPT, fromApp } from "@/lib/app-login";

export async function GET(req: Request) {
  const id = githubClientId();
  if (!id) return NextResponse.redirect(`${appUrl(req)}/login?e=github_off`);
  const state = token(16);
  const verifier = token(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", `${appUrl(req)}/api/auth/github/callback`);
  u.searchParams.set("scope", "read:user user:email");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("allow_signup", "true");
  const res = NextResponse.redirect(u.toString());
  const opt = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("uc_hs", state, opt);
  res.cookies.set("uc_hv", verifier, opt);
  const nonce = fromApp(req);
  if (nonce) res.cookies.set(APP_COOKIE, nonce, APP_COOKIE_OPT);   // the Android app opened this in the phone's browser (lib/app-login.ts)
  else res.cookies.delete(APP_COOKIE);
  return res;
}
