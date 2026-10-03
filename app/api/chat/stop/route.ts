import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";

// ■ Stop (and «stop to add what I just said»): the answer runs on even when the page is gone, so the screen names the turn to stop.
// The running answer checks this every 2 s (lib/turn.ts watchStop).
const Body = z.object({ turn: z.string().uuid() });

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q("update users set stop_turn = $2 where id = $1", [u.id, b.data.turn]);
  return NextResponse.json({ ok: true });
}
