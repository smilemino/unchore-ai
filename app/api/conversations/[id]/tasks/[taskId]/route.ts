import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { listEvents, memberDrop, memberInstruct } from "@/lib/conv-tasks-db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mine = async (id: string, uid: string) => UUID.test(id) && Boolean(await one("select 1 from conversations where id = $1 and user_id = $2", [id, uid]));

// One task opened — its history (made · progress · what the member said · lines not taken), in order
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; taskId: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id, taskId } = await ctx.params;
  if (!UUID.test(taskId) || !(await mine(id, u.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ events: await listEvents(id, taskId) });
}

const Body = z.discriminatedUnion("action", [z.object({ action: z.literal("instruct"), body: z.string().trim().min(1).max(4000) }), z.object({ action: z.literal("drop") })]);
// instruct — «Tell the AI about this task only» (the screen then sends the same words into the chat) · drop — «Drop this task»
export async function POST(req: Request, ctx: { params: Promise<{ id: string; taskId: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id, taskId } = await ctx.params;
  if (!UUID.test(taskId) || !(await mine(id, u.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const task = b.data.action === "instruct" ? await memberInstruct(u.id, id, taskId, b.data.body) : await memberDrop(u.id, id, taskId);
  return NextResponse.json({ ok: Boolean(task), task });
}
