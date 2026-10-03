import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { judge, minorPerUnit, results, creds } from "../lib/recipes/meta-ads";
import { MAX_STEP, readMetaActions } from "../lib/meta-act";
import { hideMarks } from "../lib/chat-setup";
import { RECIPES, getRecipe, runRecipe } from "../lib/recipes";
import { RECIPE_TITLES, SKILL_BRANCHES } from "../lib/recipe-titles";
import { PICKS, WORK_DUMP_GUIDE } from "../lib/face";
import { parseAdLibrary } from "../worker/recipes.mjs";
import { diff } from "../components/ShowTeach";

// Benchmark batch 2026-09-30 (four YouTube talks on AI-run ads → Unchore).
const ad = (id: string, adset: string, spend: number, cpc: number, purchases = 0) => ({
  id, name: `ad ${id}`, adset_id: adset,
  insights: { data: [{ spend: String(spend), cpc: String(cpc), actions: purchases ? [{ action_type: "purchase", value: String(purchases) }, { action_type: "omni_purchase", value: String(purchases) }] : [] }] },
});

describe("Meta ads guard — the rule", () => {
  it("pauses only ads that spent enough and still cost too much; never judges a young ad", () => {
    const v = judge([ad("1", "s1", 5000, 900), ad("2", "s1", 20000, 900), ad("3", "s2", 20000, 100, 2), ad("4", "s3", 40000, 100)], { min_spend: 10000, max_cpc: 500, max_cost_per_result: 15000 });
    expect(v.pause.map((p) => p.id)).toEqual(["2", "4"]);   // 1 spent too little to judge · 3 is fine (₩10,000 per purchase) · 4 spent ₩40,000 with no purchase
    expect(v.pause[1]!.why).toMatch(/0 purchase/);
  });
  it("lists ad sets doing twice as well as the target as budget candidates — and nothing else", () => {
    const v = judge([ad("1", "s1", 20000, 100, 4), ad("2", "s2", 20000, 100, 2)], { min_spend: 10000, max_cost_per_result: 12000 });
    expect(v.pause).toEqual([]);
    expect(v.raise.map((r) => r.adset)).toEqual(["s1"]);   // ₩5,000 each ≤ half of ₩12,000; s2 (₩10,000) is fine but not a candidate
  });
  it("counts the same purchase once (Meta repeats it under several names) and caps pauses per run", () => {
    expect(results({ actions: [{ action_type: "purchase", value: "3" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" }] }, "purchase")).toBe(3);
    const many = Array.from({ length: 30 }, (_, i) => ad(String(i), "s", 20000, 999));
    expect(judge(many, { min_spend: 1, max_cpc: 1, max_pauses: 5 }).pause).toHaveLength(5);
  });
  it("whole-unit currencies (KRW) vs cents", () => {
    expect(minorPerUnit("KRW")).toBe(1);
    expect(minorPerUnit("usd")).toBe(100);
  });
  it("needs the member's own token and account — says which one is missing", async () => {
    expect(await creds({ lang: "en", tz: "UTC", secret: async () => null })).toEqual({ why: "needs_secret:META_ADS_TOKEN" });
    expect(await creds({ lang: "en", tz: "UTC", secret: async (n) => (n === "META_ADS_TOKEN" ? "tok" : "act_123") })).toEqual({ token: "tok", account: "act_123" });
    expect(await runRecipe("meta_ads_report", {}, { lang: "en", tz: "UTC" })).toEqual({ ok: false, why: "needs_secret:META_ADS_TOKEN" });
  });
  it("a preview (dry) guard run pauses nothing", async () => {
    const calls: string[] = [];
    const fake = (async (url: URL | string, init?: RequestInit) => {
      const u = String(url); calls.push(`${init?.method ?? "GET"} ${u.split("?")[0]}`);
      const body = u.includes("/ads?") ? { data: [ad("9", "s", 50000, 5000)] } : { currency: "KRW", name: "Mine" };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const r = await runRecipe("meta_ads_guard", { min_spend: 10000, max_cpc: 1000 }, { lang: "en", tz: "UTC", dry: true, fetch: fake, secret: async (n) => (n === "META_ADS_TOKEN" ? "tok" : "act_1") });
    expect(r.ok && r.line).toMatch(/Would pause 1 of 1/);
    expect(calls.some((c) => c.startsWith("POST"))).toBe(false);
  });
});

describe("Meta budget «Yes» card", () => {
  it("reads only well-formed cards, and the app hides the mark", () => {
    const text = 'Ad set A does well.\n<<<meta {"do":"budget","adset":"120210000000001","name":"A","from":30000,"daily":50000}>>>\n<<<meta {"do":"budget","adset":"x","daily":1}>>>';
    expect(readMetaActions(text)).toEqual([{ do: "budget", adset: "120210000000001", name: "A", from: 30000, daily: 50000 }]);
    expect(hideMarks(text)).toBe("Ad set A does well.");
    expect(MAX_STEP).toBe(2);
  });
});

describe("Competitor ads (Meta Ad Library page)", () => {
  it("reads advertisers, first lines and start dates from a saved page", () => {
    const r = parseAdLibrary(readFileSync("tests/fixtures/adlib-ko.txt", "utf8"));
    expect(r.total).toBe(5000);
    expect(r.ads[0]).toEqual({ id: "550761987620789", since: "2025-04-11", who: "청월당", first: "아니..귀인도 없고, 연애운도 없어?ㅠㅠ" });
    expect(r.ads.length).toBeGreaterThan(3);
  });
  it("is a browser recipe the web app only knows by shape", () => {
    expect(getRecipe("meta_ad_library")?.where).toBe("browser");
  });
});

describe("Skill tree and first-day «all my work»", () => {
  it("every skill in the tree is a real recipe with a title", () => {
    const ids = new Set(RECIPES.map((r) => r.id));
    for (const s of SKILL_BRANCHES.flatMap((b) => b.skills)) { expect(ids.has(s.recipe)).toBe(true); expect(RECIPE_TITLES[s.recipe]).toBeTruthy(); }
  });
  it("the seventh first-chat pick starts the four-box sort", () => {
    expect(PICKS.at(-1)!.en).toMatch(/list all my work/);
    expect(WORK_DUMP_GUIDE).toMatch(/four boxes/);
  });
  it("show and teach: a new screenshot only when the screen really changed", () => {
    const a = new Uint8ClampedArray(64 * 36 * 4).fill(100);
    expect(diff(null, a)).toBe(255);
    expect(diff(a, a)).toBe(0);
    expect(diff(a, new Uint8ClampedArray(64 * 36 * 4).fill(130))).toBe(30);
  });
});
