import { NextResponse } from "next/server";
import { z } from "zod";
import { cronOk } from "@/lib/api";
import { q } from "@/lib/db";

// The browser worker reports its own nightly recipe checks here.
const Body = z.object({ recipe: z.string().max(60), ok: z.boolean(), detail: z.string().max(500) });

export async function POST(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q("insert into recipe_health(recipe, ok, detail) values ($1, $2, $3)", [b.data.recipe, b.data.ok, b.data.detail]);
  return NextResponse.json({ ok: true });
}
