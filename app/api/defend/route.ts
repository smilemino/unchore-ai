import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { userKeys } from "@/lib/ai";
import { memberFromToken } from "@/lib/api-tokens";
import { canSpend, charge, usd, wallet } from "@/lib/credits";
import { actAs, one } from "@/lib/db";
import { CHAIN, DEFAULT_ORDER, MAX_INPUT, defend } from "@/lib/defend";
import { tr } from "@/lib/i18n-server";
import { appUrl } from "@/lib/app-url";

export const maxDuration = 300;

const Body = z.object({
  question: z.string().min(1).max(MAX_INPUT),
  material: z.string().max(MAX_INPUT).optional(),
  chain: z.array(z.string()).max(4).optional(),
});

/** POST /api/defend — from the app (signed in) or a tool («Authorization: Bearer unc_…» from Settings → AI → Unchore credit). */
export async function POST(req: Request) {
  let member = await memberFromToken(req.headers.get("authorization"));
  if (member) actAs(member);
  else {
    const u = await requireUser();
    if (isResp(u)) return u;
    member = u.id;
  }
  const lang = (await one<{ lang: string }>("select lang from users where id = $1", [member]))?.lang ?? "en";
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input", message: tr(lang, "Send a question (and, if you like, the log or code to look at).") }, { status: 400 });
  const prompt = b.data.material ? `${b.data.question}\n\n--- material ---\n${b.data.material}` : b.data.question;
  if (prompt.length > MAX_INPUT) return NextResponse.json({ error: "too_long", message: tr(lang, "That is too long — send the part around the incident (up to {n} characters).", { n: MAX_INPUT }) }, { status: 413 });
  const picked = (b.data.chain ?? []).filter((x) => CHAIN[x]);
  const order = picked.length ? picked : DEFAULT_ORDER;

  // Unchore credit first; the member's own OpenRouter key when the credit is used up.
  const house = process.env.UNCHORE_HOUSE_OPENROUTER_KEY;
  const spend = house ? await canSpend(member) : ({ ok: false, why: "empty" } as const);
  let key: string | undefined, paidWith: "credit" | "own_key";
  if (house && spend.ok) { key = house; paidWith = "credit"; }
  else { key = (await userKeys(member)).openrouter; paidWith = "own_key"; }
  if (!key) {
    const dayCap = !spend.ok && spend.why === "day_cap";
    return NextResponse.json({
      error: dayCap ? "welcome_day_cap" : "no_credit",
      message: dayCap
        ? tr(lang, "Today's share of welcome credit is used up across Unchore. Top up, add your own OpenRouter key, or try again tomorrow.")
        : tr(lang, "No Unchore credit left. Top up, or add your own OpenRouter key in Settings → AI."),
      top_up: `${appUrl(req)}/app/settings?tab=ai`,
    }, { status: 402 });
  }

  const r = await defend(key, prompt, order, req.signal);
  let balance: number | null = null, charged = 0;
  if (paidWith === "credit") {
    if (r.cost > 0) ({ charged, micro: balance } = await charge(member, r.cost, `Defend · ${r.answered_by ?? "no answer"}`));
    else balance = (await wallet(member)).micro;
  }
  return NextResponse.json({
    answer: r.answer,
    answered_by: r.answered_by,
    model: r.model,
    masked: r.masked,
    tried: r.tried.map(({ ai, status, why }) => ({ ai, status, why })),
    paid_with: paidWith,
    charged_usd: paidWith === "credit" ? Number(usd(charged)) : 0,
    balance_usd: balance === null ? null : Number(usd(balance)),
    ...(r.answer ? {} : { message: tr(lang, "Every AI refused or failed. Nothing sensitive was sent unmasked.") }),
  }, { status: r.answer ? 200 : 502 });
}
