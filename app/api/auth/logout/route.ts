import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { GOOGLE_HINT_COOKIE } from "@/lib/google-hint";
import { endSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  await endSession();
  const res = NextResponse.redirect(`${appUrl(req)}/`, 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(GOOGLE_HINT_COOKIE);   // signed out on purpose: no quiet Google sign-in on this device (lib/google-hint.ts)
  return res;
}
