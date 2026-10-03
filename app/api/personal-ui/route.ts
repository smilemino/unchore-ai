import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { checkUI, claimTip, editUI, readUI } from "@/lib/personal-ui/store";
import { q } from "@/lib/db";
import { z } from "zod";
export async function GET() {
  const u = await requireUser(); if (isResp(u)) return u;
  return NextResponse.json(await readUI(u.id), { headers: { "cache-control": "no-store" } });
}
export async function POST(req: Request) {
  const u = await requireUser(); if (isResp(u)) return u;
  if (Number(req.headers.get("content-length") || 0) > 300_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const b = await req.json().catch(() => null);
  try {
    if (b?.action === "checked") {
      const v = z.object({ version: z.number().int().positive(), pass: z.boolean() }).parse(b);
      const changed = await checkUI(u.id, v.version, v.pass);
      return NextResponse.json({ ok: !!changed }, { status: changed ? 200 : 409 });
    }
    if (b?.action === "tip") return NextResponse.json({ show: await claimTip(u.id) });
    if (b?.action === "hide-tip") {
      await q("insert into personal_ui(user_id,tip_hidden) values($1,true) on conflict(user_id) do update set tip_hidden=true", [u.id]);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await editUI(u.id, b));
  } catch { return NextResponse.json({ error: "The screen changed or the request is invalid. Please try again." }, { status: 409 }); }
}
