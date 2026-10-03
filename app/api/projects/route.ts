import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";

export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  return NextResponse.json(await q("select p.id, p.name, p.instructions, p.sort, p.default_model, p.archived, (select count(*)::int from files f where f.project_id = p.id) as files, (select count(*)::int from conversations c where c.project_id = p.id) as chats from projects p where p.user_id = $1 order by p.archived, p.sort, p.created_at", [u.id]));
}

const Body = z.object({ name: z.string().trim().min(1).max(80), instructions: z.string().max(20000).optional(), default_model: z.string().max(80).nullable().optional() });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const n = await one<{ n: number }>("select count(*)::int as n from projects where user_id = $1", [u.id]);
  if ((n?.n ?? 0) >= 100) return NextResponse.json({ error: "too_many" }, { status: 400 });
  return NextResponse.json(await one("insert into projects(user_id, name, instructions, sort, default_model) values ($1, $2, $3, $4, $5) returning id, name, instructions, sort, default_model, archived", [u.id, b.data.name, b.data.instructions ?? "", n?.n ?? 0, b.data.default_model ?? null]));
}
