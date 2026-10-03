import { NextResponse } from "next/server";
import { asMember } from "@/lib/db";
import { computerFromToken, nextJob, pollWait } from "@/lib/computers";

// The member's computer asks for work (public/unchore-computer.mjs). Answers at once — the program waits «wait» seconds before
// asking again (quick while the member is working with it, slower when nobody is), so nothing is held open on our side.
export async function GET(req: Request) {
  let info: Record<string, unknown> | null = null;
  try { const h = req.headers.get("x-unchore-computer"); info = h ? JSON.parse(h) as Record<string, unknown> : null; } catch { info = null; }
  const c = await computerFromToken(req.headers.get("authorization"), info);
  if (!c) return NextResponse.json({ error: "unknown_computer" }, { status: 401 });
  return asMember(c.user_id, async () => {
    const job = await nextJob(c.id);
    return NextResponse.json({ name: c.name, job, wait: job ? 0 : await pollWait(c.id) }, { headers: { "Cache-Control": "no-store" } });
  });
}
