import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { unlock } from "@/lib/privacy";
import type { BuildLive } from "@/lib/build-live";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// This chat's newest app build and the member's last message time — the «working» line above the input (components/BuildLine.tsx)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await one("select 1 from conversations where id = $1 and user_id = $2", [id, u.id]))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = await one<BuildLive>(`select title, status, step, url, created_at, started_at, finished_at from builds
    where conversation_id = $1 and user_id = $2 order by created_at desc limit 1`, [id, u.id]);
  const last = await one<{ at: string }>("select max(created_at) as at from messages where conversation_id = $1 and role = 'user'", [id]);
  return NextResponse.json({ build: b ? { ...b, title: unlock(b.title) } : null, answeredAfter: last?.at ?? null });
}
