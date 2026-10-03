import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { SESSION_COOKIE, liveSessionKey, sessionCookie } from "@/lib/session";

// Push a live sign-in's end date 30 days out (components/SessionRefresh.tsx). Only an unexpired session can extend itself.
export async function POST() {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const key = await liveSessionKey(sid);
  if (!sid || !key) return NextResponse.json({ ok: false }, { status: 401 });
  const rows = await q<{ id: string }>("update sessions set expires_at = now() + interval '30 days', last_seen_at = now() where id = $1 and expires_at > now() returning id", [key]);
  if (!rows.length) return NextResponse.json({ ok: false }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(sid));
  return res;
}
