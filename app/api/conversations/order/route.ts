import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";

// Order of pinned chats, dragged by hand (components/drag-sort.ts) — kept on the server so every device shows the same order.
const Body = z.object({ ids: z.array(z.string().uuid()).max(500) });
export async function PUT(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q(`update conversations c set pin_sort = o.n from unnest($2::uuid[]) with ordinality as o(id, n) where c.id = o.id and c.user_id = $1`, [u.id, b.data.ids]);
  return NextResponse.json({ ok: true });
}
