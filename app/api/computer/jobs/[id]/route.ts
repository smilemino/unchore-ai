import { NextResponse } from "next/server";
import { z } from "zod";
import { asMember } from "@/lib/db";
import { computerFromToken, finishJob, reportJob } from "@/lib/computers";

// The member's computer reports on a job: more of the answer, what it is doing, its session — or that it ended.
// The answer says whether ■ Stop was pressed, so the program stops Claude Code on its side.
const Body = z.object({
  append: z.string().max(200_000).optional(),
  note: z.string().max(1000).optional(),
  session: z.string().max(200).optional(),
  finish: z.object({ status: z.enum(["done", "failed", "stopped"]), final: z.string().max(200_000).optional(), error: z.string().max(1000).optional() }).optional(),
});
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await computerFromToken(req.headers.get("authorization"));
  if (!c) return NextResponse.json({ error: "unknown_computer" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const d = b.data;
  return asMember(c.user_id, async () => {
    const r = await reportJob(c.id, id, { append: d.append, note: d.note, session: d.session });
    if (d.finish) {
      const ok = await finishJob(id, { ...d.finish, session: d.session }, c.id);
      return NextResponse.json({ ok, stop: false });
    }
    if (!r) return NextResponse.json({ error: "not_running", stop: true }, { status: 409 });
    return NextResponse.json({ ok: true, stop: r.stop });
  });
}
