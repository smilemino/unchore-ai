import { NextResponse } from "next/server";
import { logMemory } from "@/lib/memory-log";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { blocked } from "@/lib/memory";
import { lock, unlock } from "@/lib/privacy";

export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const rows = await q<{ text: string }>("select id, text, created_at from memories where user_id = $1 order by created_at desc limit 500", [u.id]);
  return NextResponse.json(rows.map((r) => ({ ...r, text: unlock(r.text) })));
}
const Body = z.object({ text: z.string().trim().min(2).max(300) });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const why = blocked(b.data.text);
  if (why.length) return NextResponse.json({ error: "sensitive", why }, { status: 400 });
  const row = await one<{ id: string; created_at: string }>("insert into memories(user_id, text) values ($1, $2) returning id, created_at", [u.id, lock(b.data.text)]);
  await logMemory(u.id, "added", b.data.text, { memoryId: row?.id });
  return NextResponse.json({ ...row, text: b.data.text });
}
