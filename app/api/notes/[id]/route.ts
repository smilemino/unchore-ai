import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { blocked } from "@/lib/memory";
import { BODY_MAX, TITLE_MAX } from "@/lib/notes";
import { lock } from "@/lib/privacy";

const Body = z.object({ title: z.string().trim().min(2).max(TITLE_MAX), body: z.string().trim().min(2).max(BODY_MAX) });
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  if (blocked(`${b.data.title}\n${b.data.body}`).length) return NextResponse.json({ error: "sensitive" }, { status: 400 });
  await q("update notes set title = $3, body = $4, updated_at = now() where id = $1 and user_id = $2", [id, u.id, lock(b.data.title), lock(b.data.body)]);
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  await q("delete from notes where id = $1 and user_id = $2", [id, u.id]);
  return NextResponse.json({ ok: true });
}
