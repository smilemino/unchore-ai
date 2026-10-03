import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { GLOSSARY_MAX, loadGlossary } from "@/lib/glossary";
import { lock } from "@/lib/privacy";

// «My words» (lib/glossary.ts): the list, add one by hand, remove one.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  return NextResponse.json(await loadGlossary(u.id));
}
const Body = z.object({ avoid: z.string().trim().min(1).max(60), use: z.string().trim().min(1).max(60) });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const n = await one<{ n: number }>("select count(*)::int as n from glossary where user_id = $1", [u.id]);
  if ((n?.n ?? 0) >= GLOSSARY_MAX) return NextResponse.json({ error: "too_many" }, { status: 400 });
  await q("insert into glossary(user_id, avoid, use_word) values ($1, $2, $3)", [u.id, lock(b.data.avoid), lock(b.data.use)]);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q("delete from glossary where id = $1 and user_id = $2", [id, u.id]);
  return NextResponse.json({ ok: true });
}
