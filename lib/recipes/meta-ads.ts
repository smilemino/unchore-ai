import { k } from "@/lib/i18n";
import { tr } from "@/lib/i18n-server";
import { z } from "zod";
import type { Recipe, RecipeResult, RunCtx } from "./types";
import { fmt } from "./util";

// Meta ads recipes (benchmark 2026-09-30: two Korean founders run their Meta ads with «rules on an AI» — pause losers every hour,
// report every morning). The member's own Meta token (vault META_ADS_TOKEN, ad account META_ADS_ACCOUNT) — the AI never sees it:
// it only picks the recipe and the numbers; this code does the reading and the pausing.
// Money rule: pausing only ever lowers spend, so the guard does it by itself. Raising a budget spends money — the recipe never does it;
// it only lists candidates, and a «Yes» card (lib/meta-act.ts) does it after the member presses it.

export const GRAPH = "https://graph.facebook.com/v24.0";
export const TOKEN = "META_ADS_TOKEN";
export const ACCOUNT = "META_ADS_ACCOUNT";

// Currencies Meta counts in whole units (no cents) — every other currency's budgets are in cents.
const WHOLE = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
export const minorPerUnit = (currency: string) => (WHOLE.has(currency.toUpperCase()) ? 1 : 100);

// Which actions count as a «result» for each goal.
const RESULT: Record<string, string[]> = {
  purchase: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "onsite_web_purchase"],
  lead: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  signup: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration", "omni_complete_registration"],
  link_click: ["link_click"],
};
type Goal = keyof typeof RESULT;

type Action = { action_type: string; value: string };
export type Row = { spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string; actions?: Action[]; purchase_roas?: Action[] };

/** The count for a goal — the largest of its action types (Meta reports the same purchase under several names). */
export function results(row: Row, goal: Goal): number {
  const want = RESULT[goal] ?? [];
  return Math.max(0, ...(row.actions ?? []).filter((a) => want.includes(a.action_type)).map((a) => Number(a.value) || 0));
}

export type Creds = { token: string; account: string };
export async function creds(ctx: RunCtx): Promise<Creds | { why: string }> {
  const token = (await ctx.secret?.(TOKEN))?.trim();
  if (!token) return { why: `needs_secret:${TOKEN}` };
  const raw = (await ctx.secret?.(ACCOUNT))?.trim() ?? "";
  const digits = raw.replace(/^act_/, "").replace(/\D/g, "");
  if (!digits) return { why: `needs_secret:${ACCOUNT}` };
  return { token, account: `act_${digits}` };
}

export async function graph<T>(path: string, c: Creds, ctx: RunCtx, init?: { method?: string; body?: Record<string, string> }): Promise<T> {
  const f = ctx.fetch ?? fetch;
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}/${path.replace(/^\//, "")}`);
  const opts: RequestInit = { method: init?.method ?? "GET", signal: AbortSignal.timeout(30_000) };
  if (init?.body) opts.body = new URLSearchParams({ ...init.body, access_token: c.token });
  else url.searchParams.set("access_token", c.token);
  const res = await f(url, opts);
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  // Meta's own message, without the token (it is never in their error text, but keep it out of our logs anyway).
  if (!res.ok || j.error) throw new Error(`Meta: ${(j.error?.message ?? `HTTP ${res.status}`).replaceAll(c.token, "…").slice(0, 160)}`);
  return j;
}

const money = (v: number, cur: string, lang: RunCtx["lang"]) => (cur === "KRW" ? `₩${fmt(v, lang, 0)}` : `${fmt(v, lang, WHOLE.has(cur) ? 0 : 2)} ${cur}`);
const goalWord = (goal: Goal, lang: RunCtx["lang"]) => tr(lang, goal === "purchase" ? "purchases" : goal === "lead" ? "leads" : goal === "signup" ? "sign-ups" : "link clicks");

// ── Scorecard: yesterday's (or the last 7 days') spend, clicks and results in one line — the «agency report card». ──
const report: Recipe<{ period?: "yesterday" | "today" | "last_7d"; goal?: Goal }> = {
  id: "meta_ads_report",
  needs: [TOKEN, ACCOUNT],
  title: { en: k("Meta ads report card") },
  catalog: 'meta_ads_report(period, goal) — one line of the member\'s OWN Meta (Facebook/Instagram) ad account: spend, impressions, clicks, CTR, cost per click, results and cost per result, plus the top 3 ads. period = "yesterday" (default, for a morning report) | "today" | "last_7d"; goal = "purchase" (default) | "lead" | "signup" | "link_click". Needs their Meta token saved as META_ADS_TOKEN and ad account id as META_ADS_ACCOUNT (ask with the secret field if missing). Also the «agency report card»: a daily check on what an ad agency is doing with their money.',
  where: "server",
  args: z.object({ period: z.enum(["yesterday", "today", "last_7d"]).optional(), goal: z.enum(["purchase", "lead", "signup", "link_click"]).optional() }),
  async run(a, ctx) {
    const c = await creds(ctx);
    if ("why" in c) return { ok: false, why: c.why };
    const period = a.period ?? "yesterday", goal = a.goal ?? "purchase";
    const acct = await graph<{ currency: string; name: string }>(`${c.account}?fields=currency,name`, c, ctx);
    const cur = acct.currency;
    const fields = "spend,impressions,clicks,ctr,cpc,actions,purchase_roas";
    const tot = (await graph<{ data: Row[] }>(`${c.account}/insights?level=account&date_preset=${period}&fields=${fields}`, c, ctx)).data[0];
    const when = tr(ctx.lang, period === "today" ? "Today" : period === "last_7d" ? "Last 7 days" : "Yesterday");
    if (!tot || !Number(tot.impressions)) return { ok: true, value: 0, line: tr(ctx.lang, "{when}: no ad delivery in {account}", { when, account: acct.name }), url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.account.slice(4)}` };
    const spend = Number(tot.spend) || 0, res = results(tot, goal);
    const roas = Number(tot.purchase_roas?.[0]?.value) || 0;
    const parts = [
      `${when} ${tr(ctx.lang, "spend")} ${money(spend, cur, ctx.lang)}`,
      `${tr(ctx.lang, "impressions")} ${fmt(Number(tot.impressions), ctx.lang, 0)}`,
      `${tr(ctx.lang, "clicks")} ${fmt(Number(tot.clicks) || 0, ctx.lang, 0)} (CTR ${fmt(Number(tot.ctr) || 0, ctx.lang, 2)}%)`,
      tot.cpc ? `${tr(ctx.lang, "per click")} ${money(Number(tot.cpc), cur, ctx.lang)}` : "",
      `${goalWord(goal, ctx.lang)} ${fmt(res, ctx.lang, 0)}${res ? ` (${tr(ctx.lang, "each")} ${money(spend / res, cur, ctx.lang)})` : ""}`,
      roas ? `ROAS ${fmt(roas, ctx.lang, 2)}` : "",
    ].filter(Boolean);
    const ads = (await graph<{ data: (Row & { ad_name?: string })[] }>(`${c.account}/insights?level=ad&date_preset=${period}&fields=ad_name,${fields}&sort=spend_descending&limit=3`, c, ctx)).data;
    const items = ads.map((r) => {
      const s = Number(r.spend) || 0, n = results(r, goal);
      return `${(r.ad_name ?? "").slice(0, 50)} — ${money(s, cur, ctx.lang)} · ${goalWord(goal, ctx.lang)} ${n}${n ? ` (${money(s / n, cur, ctx.lang)})` : ""}`;
    });
    return { ok: true, value: spend, line: parts.join(" · ") + ` (Meta · ${acct.name})`, items, url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.account.slice(4)}` };
  },
};

// ── Guard: pause live ads that spent enough and still cost too much; list ad sets doing well as budget «candidates» (never raise). ──
type GuardArgs = { min_spend: number; max_cpc?: number; max_cost_per_result?: number; goal?: Goal; max_pauses?: number };
type AdRow = { id: string; name: string; adset_id: string; insights?: { data: Row[] } };

export type Verdict = { pause: { id: string; name: string; why: string }[]; raise: { adset: string; name: string; perResult: number }[] };
/** The rule itself (pure — tested). An ad is judged only after it spent min_spend today. */
export function judge(ads: AdRow[], a: GuardArgs): Verdict {
  const goal = a.goal ?? "purchase";
  const out: Verdict = { pause: [], raise: [] };
  const good = new Map<string, { name: string; perResult: number }>();
  for (const ad of ads) {
    const r = ad.insights?.data[0];
    const spend = Number(r?.spend) || 0;
    if (!r || spend < a.min_spend) continue;
    const cpc = Number(r.cpc) || 0, n = results(r, goal);
    const per = n ? spend / n : Infinity;
    if (a.max_cpc && cpc > a.max_cpc) out.pause.push({ id: ad.id, name: ad.name, why: `CPC ${Math.round(cpc)} > ${a.max_cpc}` });
    else if (a.max_cost_per_result && per > a.max_cost_per_result) out.pause.push({ id: ad.id, name: ad.name, why: n ? `${Math.round(per)}/${goal} > ${a.max_cost_per_result}` : `${Math.round(spend)} spent, 0 ${goal}` });
    else if (a.max_cost_per_result && n && per <= a.max_cost_per_result / 2) {
      const g = good.get(ad.adset_id);
      if (!g || per < g.perResult) good.set(ad.adset_id, { name: ad.name, perResult: per });
    }
  }
  out.pause = out.pause.slice(0, a.max_pauses ?? 20);
  out.raise = [...good].map(([adset, g]) => ({ adset, ...g })).sort((x, y) => x.perResult - y.perResult).slice(0, 3);
  return out;
}

const guard: Recipe<GuardArgs> = {
  id: "meta_ads_guard",
  needs: [TOKEN, ACCOUNT],
  title: { en: k("Meta ads guard") },
  catalog: 'meta_ads_guard(min_spend, max_cpc, max_cost_per_result, goal) — watches the member\'s OWN live Meta ads (run it hourly): an ad that spent at least min_spend today and has cost per click above max_cpc, or cost per result above max_cost_per_result (or no result at all after spending that much), is PAUSED automatically. It never raises a budget: ad sets doing twice as well as the target are listed as candidates, and raising one needs the member\'s «Yes» (a meta card). Amounts in the ad account\'s currency, e.g. {"min_spend":10000,"max_cost_per_result":30000,"goal":"purchase"}. Needs META_ADS_TOKEN and META_ADS_ACCOUNT (ask with the secret field if missing).',
  where: "server",
  args: z.object({
    min_spend: z.number().positive(), max_cpc: z.number().positive().optional(), max_cost_per_result: z.number().positive().optional(),
    goal: z.enum(["purchase", "lead", "signup", "link_click"]).optional(), max_pauses: z.number().int().min(1).max(50).optional(),
  }).refine((x) => x.max_cpc || x.max_cost_per_result, "a limit"),
  async run(a, ctx): Promise<RecipeResult> {
    const c = await creds(ctx);
    if ("why" in c) return { ok: false, why: c.why };
    const acct = await graph<{ currency: string; name: string }>(`${c.account}?fields=currency,name`, c, ctx);
    const filter = encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]));
    const ads = (await graph<{ data: AdRow[] }>(`${c.account}/ads?fields=id,name,adset_id,insights.date_preset(today){spend,clicks,cpc,actions}&filtering=${filter}&limit=200`, c, ctx)).data;
    const v = judge(ads, a);
    const paused: string[] = [];
    for (const p of v.pause) {
      if (ctx.dry) { paused.push(`${p.name} (${p.why})`); continue; }   // a preview shows what it would do and touches nothing
      const ok = await graph<{ success?: boolean }>(p.id, c, ctx, { method: "POST", body: { status: "PAUSED" } }).then((r) => r.success !== false).catch(() => false);
      if (ok) paused.push(`${p.name} (${p.why})`);
    }
    const items = paused.map((x) => `⏸ ${x}`);
    for (const r of v.raise) {
      const s = await graph<{ name: string; daily_budget?: string }>(`${r.adset}?fields=name,daily_budget`, c, ctx).catch(() => null);
      if (!s?.daily_budget) continue;   // lifetime or campaign budget — not something a card can raise safely
      const daily = Number(s.daily_budget) / minorPerUnit(acct.currency);
      items.push(`↑ ${tr(ctx.lang, "budget candidate")}: ${s.name} (ad set ${r.adset}) · ${tr(ctx.lang, "daily")} ${money(daily, acct.currency, ctx.lang)} · ${tr(ctx.lang, "each")} ${money(r.perResult, acct.currency, ctx.lang)}`);
    }
    const line = paused.length
      ? tr(ctx.lang, ctx.dry ? "Would pause {n} of {total} live ads" : "Paused {n} of {total} live ads", { n: paused.length, total: ads.length })
      : tr(ctx.lang, "{total} live ads checked — nothing to pause", { total: ads.length });
    return { ok: true, value: paused.length, line: `${line} (Meta · ${acct.name})`, items, url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${c.account.slice(4)}` };
  },
};

export const META_RECIPES = [report, guard];
