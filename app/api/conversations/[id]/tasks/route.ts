import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { listTasks } from "@/lib/conv-tasks-db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// This chat's tasks (lib/conv-tasks.ts) — the bar above the input
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await one("select 1 from conversations where id = $1 and user_id = $2", [id, u.id]))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ tasks: await listTasks(id) });
}
