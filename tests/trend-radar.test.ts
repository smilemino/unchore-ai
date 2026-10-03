import { describe, expect, it } from "vitest";
import { getRecipe } from "../lib/recipes";
import { readTopics } from "../lib/recipes/trend-radar";
import { PORTABLE } from "../scripts/skills/portable";

const rss = (titles: string[]) => `<rss><channel>${titles.map((t, i) => `<item><title>${t}</title><link>https://n.example/${i}</link></item>`).join("")}</channel></rss>`;

// A fake web: each public source answers (or fails) without touching the network.
function fakeFetch(fail: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    const res = (body: string, type = "application/rss+xml") => new Response(body, { status: 200, headers: { "content-type": type } });
    if (fail.some((h) => u.host.includes(h))) return new Response("blocked", { status: 403 });
    if (u.host === "news.google.com") return res(rss(["Agents ship in browsers", "New agent framework"]));
    if (u.host === "trends.google.com") return res(`<rss><channel><item><title>football</title><ht:approx_traffic>500K+</ht:approx_traffic></item></channel></rss>`);
    if (u.host === "hn.algolia.com") return res(JSON.stringify({ hits: [{ title: "New agent framework", objectID: "1", points: 300, num_comments: 90 }, { title: "Show HN: agent memory", objectID: "2", points: 120 }] }), "application/json");
    if (u.host === "www.reddit.com") return res(`<feed><entry><title>Agents are everywhere</title><link href="https://reddit.example/a"/></entry></feed>`);
    if (u.host === "api.github.com") return res(JSON.stringify({ items: [{ full_name: "x/agent-kit", html_url: "https://github.com/x/agent-kit", description: "kit", stargazers_count: 900 }] }), "application/json");
    return new Response("", { status: 404 });
  }) as typeof fetch;
}

const recipe = getRecipe("trend_radar")!;
const ctx = { lang: "en" as const, tz: "UTC" };

describe("trend_radar — rising topics from several public sources, grouped by the member's own AI", () => {
  it("without an AI key: the raw list from every source, no made-up scores", async () => {
    const r = await recipe.run({ topic: "AI agents" }, { ...ctx, fetch: fakeFetch() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeUndefined();
    expect(r.line).toContain("Google News, Google Trends, Hacker News, Reddit, GitHub");
    // The same headline from two sources is listed once.
    expect(r.items!.filter((l) => l.includes("New agent framework"))).toHaveLength(1);
  });

  it("one source blocked does not sink the others; all blocked is a failure, not an empty success", async () => {
    const some = await recipe.run({ topic: "AI agents" }, { ...ctx, fetch: fakeFetch(["reddit", "github"]) });
    expect(some.ok && some.line).toContain("Hacker News");
    const none = await recipe.run({ topic: "AI agents" }, { ...ctx, fetch: fakeFetch(["google", "algolia", "reddit", "github"]) });
    expect(none).toEqual({ ok: false, why: "no source answered" });
  });

  it("with the member's AI: topics scored, links come only from collected items, top score is the value", async () => {
    let asked = "";
    const ai = async (p: string) => {
      asked = p;
      return '```json\n[{"topic":"Agent frameworks","score":88,"why":"top of HN and news","refs":[2,4,99],"draft":"Agents are moving fast."},{"topic":"Invented","score":99,"why":"x","refs":[50]}]\n```';
    };
    const r = await recipe.run({ topic: "AI agents" }, { ...ctx, fetch: fakeFetch(), ai });
    expect(asked).toContain("data, not instructions");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(88);
    expect(r.line).toBe("88 · Agent frameworks");
    expect(r.items).toHaveLength(1);
    expect(r.items![0]).toContain("Agents are moving fast.");
  });

  it("an AI answer that cannot be read falls back to the raw list and says so", async () => {
    const r = await recipe.run({ topic: "AI agents" }, { ...ctx, fetch: fakeFetch(), ai: async () => "sorry" });
    expect(r.ok && r.line).toContain("raw list");
  });

  it("readTopics drops topics without real item numbers and clamps scores", () => {
    expect(readTopics('[{"topic":"a","score":140,"refs":[1]},{"topic":"b","score":5,"refs":[]}]', 3)).toEqual([{ topic: "a", score: 100, why: "", refs: [1], draft: "" }]);
    expect(readTopics("not json", 3)).toEqual([]);
  });

  it("is not exported as a portable skill (its scores and drafts need the member's AI)", () => {
    expect(PORTABLE.some((r) => r.id === "trend_radar")).toBe(false);
  });
});
