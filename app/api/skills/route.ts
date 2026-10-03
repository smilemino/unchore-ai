import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { unlock } from "@/lib/privacy";
import { deleteSkill, listSkills, slugOf } from "@/lib/skills";

// Settings → Memory → «My skills» (lib/skills.ts): see what the AI saved and delete any of them. ?slug= opens one.
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json(await listSkills(u.id));
  const r = await one<{ body: string }>("select body from member_skills where user_id = $1 and slug = $2", [u.id, slugOf(slug)]);
  return r ? NextResponse.json({ body: unlock(r.body) }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const ok = await deleteSkill(u.id, new URL(req.url).searchParams.get("slug") ?? "");
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
