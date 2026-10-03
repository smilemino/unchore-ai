import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { currentUser } from "@/lib/session";
import { token } from "@/lib/crypto";
import { githubClientId } from "@/lib/github-env";

// «Connect GitHub» for the member's own computer (lib/tools/computer.ts): one tap, «Authorize» on GitHub, and the token is kept
// encrypted as their saved secret GITHUB_TOKEN — the AI never sees it; commands get it only when they ask for it by name.
// Same OAuth app and callback as GitHub sign-in; the uc_gc cookie tells the callback to save instead of signing in.
const GITHUB_REPO_SCOPE = "repo workflow read:user";

export async function GET(req: Request) {
  const base = appUrl(req);
  const u = await currentUser();
  if (!u) return NextResponse.redirect(`${base}/login`);
  const id = githubClientId();
  if (!id) return NextResponse.redirect(`${base}/app`);   // every member: their pull requests (lib/tools/github.ts) and their computer
  const state = token(16);
  const verifier = token(32);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", `${base}/api/auth/github/callback`);
  url.searchParams.set("scope", GITHUB_REPO_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("allow_signup", "false");
  const res = NextResponse.redirect(url.toString());
  const opt = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("uc_hs", state, opt);
  res.cookies.set("uc_hv", verifier, opt);
  res.cookies.set("uc_gc", u.id, opt);
  return res;
}
