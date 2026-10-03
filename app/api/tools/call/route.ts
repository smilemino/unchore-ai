import { NextResponse } from "next/server";
import { z } from "zod";
import { asMember, one } from "@/lib/db";
import { readTicket } from "@/lib/tools/token";
import { fence, runTool } from "@/lib/tools/run";
import { computerFor } from "@/lib/tools/computer";
import { isOwnerEmail } from "@/lib/youtube-connect";

// Tool calls from Claude-plan answers (worker/mcp.mjs). The signed turn ticket names the member and the chat; nothing else is trusted.
export const maxDuration = 800;
const Body = z.object({ name: z.string().max(40), args: z.record(z.string(), z.unknown()).optional() });

export async function POST(req: Request) {
  const t = readTicket((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!t) return NextResponse.json({ ok: false, text: "expired" }, { status: 401 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ ok: false, text: "bad input" }, { status: 400 });
  return asMember(t.u, async () => {
    const u = await one<{ tz: string; email: string }>("select tz, email from users where id = $1", [t.u]);
    if (!u) return NextResponse.json({ ok: false, text: "no member" }, { status: 404 });
    const r = await runTool({ userId: t.u, convId: t.c, lang: t.l, tz: u.tz, yes: t.y, computer: computerFor(u.email), owner: isOwnerEmail(u.email) }, b.data.name, b.data.args ?? {});
    return NextResponse.json({ ok: r.ok, text: fence(b.data.name, r.text) });
  });
}
