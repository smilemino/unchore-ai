import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { GOOGLE_HINT_COOKIE } from "@/lib/google-hint";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

// Sign out on every device (a lost phone, a shared computer) — ported from AI Soul components/LoginSettings.tsx «모든 기기에서 로그아웃».
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  await q("delete from sessions where user_id = $1", [u.id]);
  const res = NextResponse.redirect(`${appUrl(req)}/`, 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(GOOGLE_HINT_COOKIE);   // signed out on purpose: no quiet Google sign-in on this device (lib/google-hint.ts)
  return res;
}
