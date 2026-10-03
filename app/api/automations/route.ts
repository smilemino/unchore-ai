import { asLang } from "@/lib/i18n";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { chooseModel, providerOf, userKeys } from "@/lib/ai";
import { runAutomation, type Automation } from "@/lib/automation";
import { one, q } from "@/lib/db";
import { recordEvent, unlock } from "@/lib/privacy";
import { normalizePlan, pickPlan, type Plan } from "@/lib/pick";
import { wordsRe } from "@/lib/words";
import W_BELOW from "@/lib/words/price_below.json";

const DROP_ANY = wordsRe(W_BELOW);   // «tell me when it gets cheaper» in every other language (lib/words)

export const maxDuration = 120;

export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  return NextResponse.json(await q(
    `select a.id, a.title, a.recipe, a.args, a.schedule, a.condition, a.status, a.last_line, a.last_value, a.last_run_at, a.next_run_at, a.fail_count, a.created_at, a.after_id,
       (select count(*)::int from runs r where r.automation_id = a.id) as runs,
       (select count(*)::int from runs r where r.automation_id = a.id and r.ok and r.started_at > now() - interval '30 days') as runs30
     from automations a where a.user_id = $1 order by a.created_at desc`, [u.id]));
}

const FromProposal = z.object({ proposalId: z.string().uuid() });
const Manual = z.object({ title: z.string().min(1).max(80), recipe: z.string(), args: z.record(z.string(), z.unknown()), schedule: z.string(), condition: z.object({ kind: z.string(), value: z.number().optional() }) });

// Accepting an offer: the AI picks a verified recipe + arguments, we save it as a draft and run it once so the user sees the real value first.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const raw = await req.json().catch(() => ({}));
  const lang = asLang(u.lang);
  let plan: Plan;
  let sourceMessage: string | null = null;
  let offerText = "";
  const fp = FromProposal.safeParse(raw);
  if (fp.success) {
    // The member's last few messages (oldest first) and the answer the card sat on: the time, days and price line
    // are usually spread over two or three turns («reminder» → «9pm» → «weekdays only»).
    const p = await one<{ offer: string; message_id: string; asked: string[] | null; answer: string | null }>(
      `select p.offer, p.message_id, am.content as answer,
          (select json_agg(s.content order by s.created_at) from (select qm.content, qm.created_at from messages qm
             where qm.conversation_id = am.conversation_id and qm.role = 'user' and qm.created_at <= am.created_at order by qm.created_at desc limit 4) s) as asked
       from proposals p join messages am on am.id = p.message_id where p.id = $1 and p.user_id = $2`, [fp.data.proposalId, u.id]);
    if (!p?.asked?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const question = p.asked.map((x) => unlock(x)).join("\n");
    const keys = await userKeys(u.id);
    const model = chooseModel(keys, u.default_model);
    if (!model) return NextResponse.json({ error: "no_key" }, { status: 400 });
    plan = await pickPlan({ model, key: keys[providerOf(model)]!, question, offer: p.offer, answer: p.answer ? unlock(p.answer) : "", lang, tz: u.tz })
      .catch(() => normalizePlan(null, question, lang));
    sourceMessage = p.message_id;
    offerText = p.offer;
    await q("update proposals set status = 'accepted' where id = $1", [fp.data.proposalId]);
  } else {
    const m = Manual.safeParse(raw);
    if (!m.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
    plan = normalizePlan(m.data as Partial<Plan>, m.data.title, lang);
  }
  const a = await one<Automation>(
    `insert into automations(user_id, title, recipe, args, schedule, condition, status, source_message_id)
     values ($1, $2, $3, $4, $5, $6, 'draft', $7)
     returning id, user_id, title, recipe, args, schedule, condition, status, last_value, last_line, fail_count`,
    [u.id, plan.title, plan.recipe, JSON.stringify(plan.args), plan.schedule, JSON.stringify(plan.condition), sourceMessage]);
  await recordEvent(u.id, fp.success ? "automation_from_offer" : "automation_manual");
  const preview = await runAutomation(a!, { dry: true });
  // Price watches: «tell me when it drops» → notify below the value we just read (the AI can't know today's price when it plans).
  const PRICE = ["danawa_lowest", "google_flights", "crypto", "fx", "stock_kr"];
  const wantsDrop = /내려|떨어|싸지|낮아|drop|cheaper|below|falls?/i.test(`${plan.title} ${offerText}`) || DROP_ANY.test(`${plan.title} ${offerText}`);
  if (preview.ok && typeof preview.value === "number" && PRICE.includes(plan.recipe) && (plan.condition.kind === "changed" || (plan.condition.kind === "always" && wantsDrop))) {
    plan.condition = { kind: "below", value: preview.value };
    a!.condition = plan.condition;
    await q("update automations set condition = $2 where id = $1", [a!.id, JSON.stringify(plan.condition)]);
  }
  await q("update automations set last_line = $2, last_value = $3 where id = $1", [a!.id, preview.ok ? preview.line : null, preview.ok ? preview.value ?? null : null]);
  return NextResponse.json({ automation: { ...a, last_line: preview.ok ? preview.line : null }, preview });
}
