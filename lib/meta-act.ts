import { z } from "zod";

// «Yes» cards for Meta ads (lib/recipes/meta-ads.ts): raising a budget spends money, so the answer only proposes it with a
// <<<meta {json}>>> line; the screen shows a card and /api/connect/meta/act does it only after the member presses «Yes», once.
export const MetaAction = z.object({
  do: z.literal("budget"),
  adset: z.string().regex(/^\d{5,25}$/),
  name: z.string().max(200).optional(),
  daily: z.number().positive(),          // new daily budget, in the ad account's currency (whole units, e.g. 50000 = ₩50,000)
  from: z.number().positive().optional(), // today's daily budget, for the card
});
export type MetaActionT = z.infer<typeof MetaAction>;

const MARK = /<<<meta (\{[^\n]*\})>>>/g;
export function readMetaActions(text: string): MetaActionT[] {
  const out: MetaActionT[] = [];
  for (const m of text.matchAll(MARK)) { try { const r = MetaAction.safeParse(JSON.parse(m[1]!)); if (r.success) out.push(r.data); } catch { /* not JSON */ } }
  return out;
}
export const hideMetaMarks = (text: string) => text.replace(/<<<meta \{[^\n]*\}>>>/g, "").replace(/<<<meta[^\n]*$/, "").trimEnd();

/** A raise is capped: at most double today's budget in one «Yes» (a typo of one zero must not become 10×). */
export const MAX_STEP = 2;

export const META_GUIDE = [
  "## Their Meta ad account is connected (META_ADS_TOKEN saved)",
  "Recipes: meta_ads_report (report card — read only) and meta_ads_guard (pauses losing ads by itself — pausing only lowers spend).",
  "Raising a budget spends their money: never say it's done and never put it in an automation. Propose it and put ONE line at the very end — the app shows a card with a «Yes» button and does it only when they press it:",
  '<<<meta {"do":"budget","adset":"(the ad set id from the guard/report lines)","name":"(ad set name)","from":(today\'s daily budget),"daily":(new daily budget, at most 2× today\'s)}>>>',
  "Amounts are in the ad account's currency, whole units (₩50,000 → 50000). Only for an ad set id you actually saw in a reading.",
].join("\n");
