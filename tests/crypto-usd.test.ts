import { describe, expect, it } from "vitest";
import { getRecipe } from "../lib/recipes";

// Night test 2026-09-30: CoinGecko's free endpoint answers 403 → Coinbase's public spot price first, CoinGecko as backup.
const fake = (routes: Record<string, { status: number; body: unknown }>) => (async (url: string) => {
  const host = new URL(url).host; const r = routes[host] ?? { status: 404, body: {} };
  return new Response(JSON.stringify(r.body), { status: r.status });
}) as unknown as typeof fetch;
const run = (f: typeof fetch) => getRecipe("crypto")!.run({ coin: "btc", vs: "USD" }, { lang: "en", tz: "UTC", fetch: f } as never);

describe("crypto in USD", () => {
  it("reads Coinbase", async () => {
    const r = await run(fake({ "api.coinbase.com": { status: 200, body: { data: { amount: "83516.52", base: "BTC", currency: "USD" } } } }));
    expect(r).toMatchObject({ ok: true, value: 83516.52 });
    expect(JSON.stringify(r)).toContain("(Coinbase)");
  });
  it("falls back to CoinGecko when Coinbase fails", async () => {
    const r = await run(fake({ "api.coinbase.com": { status: 500, body: {} }, "api.coingecko.com": { status: 200, body: { bitcoin: { usd: 83000 } } } }));
    expect(r).toMatchObject({ ok: true, value: 83000 });
  });
  it("both down → a clear failure, no guess", async () => {
    await expect(run(fake({ "api.coingecko.com": { status: 403, body: {} } }))).rejects.toThrow(/403/);
  });
});
