import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { hint, seal } from "@/lib/crypto";
import { q } from "@/lib/db";

// Saved logins for sites your automations use. Stored encrypted; the value is never sent back to the browser.
const Body = z.object({ name: z.string().min(1).max(60).regex(/^[\w.@ -]+$/), value: z.string().min(1).max(2000) });

export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  return NextResponse.json(await q("select name, hint, updated_at from vault where user_id = $1 order by name", [u.id]));
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q("insert into vault(user_id, name, enc, hint) values ($1, $2, $3, $4) on conflict (user_id, name) do update set enc = excluded.enc, hint = excluded.hint, updated_at = now()",
    [u.id, b.data.name, seal(b.data.value), hint(b.data.value)]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  await q("delete from vault where user_id = $1 and name = $2", [u.id, new URL(req.url).searchParams.get("name") ?? ""]);
  return NextResponse.json({ ok: true });
}
