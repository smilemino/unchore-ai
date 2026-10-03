import { describe, expect, it } from "vitest";
import { runRecipe } from "../lib/recipes";

const page = "<html><body><h1>AirPods Pro 3</h1><p>Active noise cancellation</p><p>Buy</p></body></html>";
const fake = (async () => new Response(page, { status: 200 })) as unknown as typeof fetch;
const ctx = { lang: "en" as const, tz: "UTC", dry: true, fetch: fake };

// Night 2026-10-03: the card asked for «AirPods Pro» + «₩», but the price is drawn by scripts and isn't in the page text — the first read failed and nothing switched on.
describe("page watch", () => {
  it("drops words that are nowhere on the page and watches the line with the rest", async () => {
    const r = await runRecipe("page_watch", { url: "https://www.apple.com/kr/airpods-pro/", must_words: ["AirPods Pro", "₩"] }, ctx);
    expect(r).toMatchObject({ ok: true, line: "AirPods Pro 3" });
  });
  it("still fails when none of the words are on the page", async () => {
    const r = await runRecipe("page_watch", { url: "https://www.apple.com/kr/airpods-pro/", must_words: ["Galaxy Buds"] }, ctx);
    expect(r.ok).toBe(false);
  });
  it("words on the page but never on one line still fail (no made-up line)", async () => {
    const r = await runRecipe("page_watch", { url: "https://www.apple.com/kr/airpods-pro/", must_words: ["AirPods Pro", "Buy"] }, ctx);
    expect(r.ok).toBe(false);
  });
});
