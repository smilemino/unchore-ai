import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { unlock } from "@/lib/privacy";
import { MAX_STEP, readMetaActions } from "@/lib/meta-act";
import { creds, graph, minorPerUnit } from "@/lib/recipes/meta-ads";
import { vaultSecret } from "@/lib/vault";

// The member pressed «Yes» on a Meta budget card: raise that one ad set's daily budget, once. Never more than 2× today's in one step.
const Body = z.object({ messageId: z.string().uuid(), i: z.number().int().min(0).max(20) });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const m = await one<{ content: string }>("select m.content from messages m join conversations c on c.id = m.conversation_id where m.id = $1 and c.user_id = $2 and m.role = 'assistant'", [b.data.messageId, u.id]);
  const act = m ? readMetaActions(unlock(m.content))[b.data.i] : undefined;
  if (!act) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ctx = { lang: "en" as const, tz: u.tz, secret: (n: string) => vaultSecret(u.id, n) };
  const c = await creds(ctx);
  if ("why" in c) return NextResponse.json({ error: "not_connected" }, { status: 400 });
  const claimed = await q("insert into meta_actions(user_id, message_id, idx) values ($1, $2, $3) on conflict do nothing returning 1", [u.id, b.data.messageId, b.data.i]);
  if (!claimed.length) return NextResponse.json({ already: true });
  try {
    // Read the ad set now (it must be in their account and have a daily budget) and check the step against today's real budget.
    const s = await graph<{ daily_budget?: string; account_id?: string }>(`${act.adset}?fields=daily_budget,account_id`, c, ctx);
    if (!s.daily_budget || `act_${s.account_id}` !== c.account) throw new Error("not_this_account");
    const acct = await graph<{ currency: string }>(`${c.account}?fields=currency`, c, ctx);
    const per = minorPerUnit(acct.currency);
    const now = Number(s.daily_budget) / per;
    if (act.daily > now * MAX_STEP) throw new Error("too_big");
    await graph(act.adset, c, ctx, { method: "POST", body: { daily_budget: String(Math.round(act.daily * per)) } });
    await q("update meta_actions set result = $3 where message_id = $1 and idx = $2", [b.data.messageId, b.data.i, `${now} → ${act.daily} ${acct.currency}`]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await q("delete from meta_actions where message_id = $1 and idx = $2", [b.data.messageId, b.data.i]);   // not done → can press again
    const why = (e as Error).message;
    return NextResponse.json({ error: why === "too_big" || why === "not_this_account" ? why : "failed" }, { status: 502 });
  }
}
