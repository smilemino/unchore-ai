import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { runAutomation, type Automation } from "@/lib/automation";
import { one } from "@/lib/db";

export const maxDuration = 120;

// «Try it now»: one run to see the real value. Doesn't e-mail or move the schedule.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const a = await one<Automation>("select id, user_id, title, recipe, args, schedule, condition, status, last_value, last_line, fail_count from automations where id = $1 and user_id = $2", [id, u.id]);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await runAutomation(a, { dry: true }));
}
