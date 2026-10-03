import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";

// The page showed this chat's answer on screen — no «your answer is ready» notification for it (app/api/chat/route.ts).
const Body = z.object({ conversationId: z.string().uuid() });

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q("update conversations set got_at = now() where id = $1 and user_id = $2", [b.data.conversationId, u.id]);
  return NextResponse.json({ ok: true });
}
