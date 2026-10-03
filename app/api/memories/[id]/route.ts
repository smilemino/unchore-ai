import { NextResponse } from "next/server";
import { logMemory } from "@/lib/memory-log";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { blocked } from "@/lib/memory";
import { lock, unlock } from "@/lib/privacy";

const Body = z.object({ text: z.string().trim().min(2).max(300) });
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  if (blocked(b.data.text).length) return NextResponse.json({ error: "sensitive" }, { status: 400 });
  await q("update memories set text = $3 where id = $1 and user_id = $2", [id, u.id, lock(b.data.text)]);
  await logMemory(u.id, "updated", b.data.text, { memoryId: id });
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const gone = await q<{ text: string }>("delete from memories where id = $1 and user_id = $2 returning text", [id, u.id]);
  if (gone[0]) await logMemory(u.id, "removed", unlock(gone[0].text), { memoryId: id });
  return NextResponse.json({ ok: true });
}
