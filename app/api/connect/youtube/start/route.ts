import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { currentUser } from "@/lib/session";
import { token } from "@/lib/crypto";
import { googleClientId, googleOn } from "@/lib/google-env";
import { YT_SCOPE, isOwnerEmail } from "@/lib/youtube-connect";

// Owner only (lib/youtube-connect.ts). Comes back through the sign-in callback (state «y:…»), the one address Google knows.
export async function GET(req: Request) {
  const base = appUrl(req);
  const u = await currentUser();
  if (!u) return NextResponse.redirect(`${base}/login`);
  if (!googleOn() || !isOwnerEmail(u.email)) return NextResponse.redirect(`${base}/app`);
  const state = `y:${token(16)}`, verifier = token(32);
  const g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  g.searchParams.set("client_id", googleClientId());
  g.searchParams.set("redirect_uri", `${base}/api/auth/google/callback`);
  g.searchParams.set("response_type", "code");
  g.searchParams.set("scope", `openid email ${YT_SCOPE}`);
  g.searchParams.set("access_type", "offline");
  g.searchParams.set("prompt", "consent select_account");   // pick the «Unchore» brand channel
  g.searchParams.set("state", state);
  g.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  g.searchParams.set("code_challenge_method", "S256");
  const res = NextResponse.redirect(g.toString());
  const opt = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("uc_gs", state, opt);
  res.cookies.set("uc_gv", verifier, opt);
  return res;
}
