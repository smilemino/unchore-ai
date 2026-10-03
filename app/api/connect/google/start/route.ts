import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { isResp, requireUser } from "@/lib/api";
import { token } from "@/lib/crypto";
import { connectUrl, isService } from "@/lib/google-connect";
import { googleOn } from "@/lib/google-env";

// «Connect Google» → Google's consent page for just the services picked. Comes back through the sign-in callback (state «c:…»).
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const base = appUrl(req);
  const services = (new URL(req.url).searchParams.get("s") ?? "").split(",").filter(isService);
  if (!googleOn() || !services.length) return NextResponse.redirect(`${base}/app/settings?tab=ai&google=off`);
  const state = `c:${token(16)}`, verifier = token(32);
  const res = NextResponse.redirect(connectUrl(`${base}/api/auth/google/callback`, services, state, createHash("sha256").update(verifier).digest("base64url"), u.email));
  const opt = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("uc_gs", state, opt);
  res.cookies.set("uc_gv", verifier, opt);
  return res;
}
