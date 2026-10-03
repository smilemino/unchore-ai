import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { SESSION_COOKIE, sessionKey } from "@/lib/session";

// Signed-in devices (ported from AI Soul «로그인한 기기»): name, when it signed in, when it was last used; sign out one device.
// The screen only ever sees a short fingerprint of each sign-in's database key (itself a hash of the cookie — lib/session.ts).
const FP = "left(encode(sha256(convert_to(id, 'UTF8')), 'hex'), 24)";

export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const sid = sessionKey((await cookies()).get(SESSION_COOKIE)?.value ?? "");   // requireUser has already moved an old sign-in to its hash
  const rows = await q<{ id: string; device: string | null; created_at: string; seen_at: string; current: boolean }>(
    `select ${FP} as id, device, created_at, coalesce(last_seen_at, created_at) as seen_at, (id = $2) as current
       from sessions where user_id = $1 and expires_at > now() order by (id = $2) desc, coalesce(last_seen_at, created_at) desc limit 50`, [u.id, sid]);
  return NextResponse.json(rows);
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const d = new URL(req.url).searchParams.get("d") ?? "";
  if (!/^[0-9a-f]{24}$/.test(d)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const sid = sessionKey((await cookies()).get(SESSION_COOKIE)?.value ?? "");   // requireUser has already moved an old sign-in to its hash
  // This device signs out with «Sign out», not here — the list would lose the row it is looking from.
  const gone = await q(`delete from sessions where user_id = $1 and ${FP} = $2 and id <> $3 returning 1`, [u.id, d, sid]);
  return NextResponse.json({ ok: gone.length > 0 });
}
