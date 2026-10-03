import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { nextRun, validSchedule } from "@/lib/schedule";
import { MAX_ACTIVE, activeCount } from "@/lib/automation";

const Body = z.object({
  status: z.enum(["active", "paused"]).optional(),
  schedule: z.string().refine(validSchedule).optional(),
  title: z.string().min(1).max(80).optional(),
  condition: z.object({ kind: z.enum(["always", "below", "above", "changed"]), value: z.number().optional() }).optional(),
  afterId: z.string().uuid().nullable().optional(),   // skill chain: run right after that automation (null = back to its own schedule)
  prompt: z.string().trim().min(1).max(2000).optional(),   // a reminder's task text (recipe "prompt" only — lib/remind-edit.ts)
});

/** Would `afterId` make a loop (it, or anything it runs after, is `id`)? Walks up at most 10 steps. */
async function loops(id: string, afterId: string, userId: string): Promise<boolean> {
  let cur: string | null = afterId;
  for (let i = 0; cur && i < 10; i++) {
    if (cur === id) return true;
    const r: { after_id: string | null } | null = await one<{ after_id: string | null }>("select after_id from automations where id = $1 and user_id = $2", [cur, userId]);
    if (!r) return true;   // not theirs / gone
    cur = r.after_id;
  }
  return Boolean(cur);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const a = await one("select * from automations where id = $1 and user_id = $2", [id, u.id]);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const runs = await q("select started_at, ok, value, line, why, notified from runs where automation_id = $1 order by started_at desc limit 30", [id]);
  return NextResponse.json({ automation: a, runs });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const a = await one<{ schedule: string; recipe: string; status: string }>("select schedule, recipe, status from automations where id = $1 and user_id = $2", [id, u.id]);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (b.data.status === "active" && a.status !== "active" && await activeCount(u.id) >= MAX_ACTIVE) return NextResponse.json({ error: "limit", max: MAX_ACTIVE }, { status: 409 });
  if (b.data.prompt !== undefined && a.recipe !== "prompt") return NextResponse.json({ error: "not_a_reminder" }, { status: 400 });
  const schedule = b.data.schedule ?? a.schedule;
  const next = b.data.status === "active" || b.data.schedule ? nextRun(schedule, u.tz) : null;
  await q(
    `update automations set status = coalesce($3, status), schedule = $4, title = coalesce($5, title), condition = coalesce($6, condition),
       next_run_at = coalesce($7, next_run_at), fail_count = case when $3 = 'active' then 0 else fail_count end
     where id = $1 and user_id = $2`,
    [id, u.id, b.data.status ?? null, schedule, b.data.title ?? null, b.data.condition ? JSON.stringify(b.data.condition) : null, next]);
  // New task text: the price line read from the old text no longer applies, so it goes (each run asks the AI with the new text).
  if (b.data.prompt !== undefined) await q("update automations set args = jsonb_set(args - 'watch', '{prompt}', to_jsonb($3::text)) where id = $1 and user_id = $2", [id, u.id, b.data.prompt]);
  if (b.data.afterId !== undefined) {
    if (b.data.afterId && await loops(id, b.data.afterId, u.id)) return NextResponse.json({ error: "loop" }, { status: 400 });
    // chained → waits for its parent (no own next run); unchained → back on its own schedule
    await q("update automations set after_id = $3, next_run_at = case when $3::uuid is null then $4::timestamptz else null end where id = $1 and user_id = $2",
      [id, u.id, b.data.afterId, nextRun(schedule, u.tz)]);
  }
  return NextResponse.json({ ok: true, next_run_at: next });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  await q("delete from automations where id = $1 and user_id = $2", [id, u.id]);
  return NextResponse.json({ ok: true });
}
