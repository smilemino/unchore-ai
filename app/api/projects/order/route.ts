import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";

// Order of projects, dragged by hand — the same «sort» every device reads.
const Body = z.object({ ids: z.array(z.string().uuid()).max(500) });
export async function PUT(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q(`update projects p set sort = o.n from unnest($2::uuid[]) with ordinality as o(id, n) where p.id = o.id and p.user_id = $1`, [u.id, b.data.ids]);
  return NextResponse.json({ ok: true });
}
