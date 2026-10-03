import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";

const Patch = z.object({ name: z.string().trim().min(1).max(80).optional(), instructions: z.string().max(20000).optional(), sort: z.number().int().min(0).max(1000).optional(), default_model: z.string().max(80).nullable().optional(), archived: z.boolean().optional() });
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const b = Patch.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const d = b.data;
  await q(`update projects set name = coalesce($3, name), instructions = coalesce($4, instructions), sort = coalesce($5, sort),
      default_model = case when $6::boolean then $7 else default_model end, archived = coalesce($8, archived) where id = $1 and user_id = $2`,
    [id, u.id, d.name ?? null, d.instructions ?? null, d.sort ?? null, d.default_model !== undefined, d.default_model ?? null, d.archived ?? null]);
  return NextResponse.json({ ok: true });
}
// Deleting a project keeps its chats (they move out of the project).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  await q("delete from projects where id = $1 and user_id = $2", [id, u.id]);
  return NextResponse.json({ ok: true });
}
