import { afterEach, describe, expect, it, vi } from "vitest";
import { canWebSearch, streamChat } from "@/lib/ai";
import { eventSources, readEvent, searchRequest, sourcesFooter, sourcesLine } from "@/lib/key-search";

// 2026-10-02: a member's own Gemini, OpenAI or Grok key answered «I can't browse» with search on — now the company's own search runs.
const sse = (events: object[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200 });
const run = async (model: string) => { let out = ""; for await (const s of streamChat({ model, key: "k", system: "S", messages: [{ role: "user", content: "news?" }], webSearch: true })) out += s; return out; };
afterEach(() => vi.restoreAllMocks());

describe("web search on Gemini, OpenAI and Grok keys", () => {
  it("those keys can search; DeepSeek and Kimi still can't", () => {
    for (const m of ["gemini:gemini-pro-latest", "gpt-6-sol", "xai:grok-4.7"]) expect(canWebSearch(m)).toBe(true);
    for (const m of ["deepseek:deepseek-chat", "kimi:kimi-k3"]) expect(canWebSearch(m)).toBe(false);
  });
  it("Gemini asks Google Search through its own API, on the member's key", () => {
    const r = searchRequest("gemini", "KEY", "gemini-pro-latest", "sys", [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]);
    expect(r.url).toContain("/models/gemini-pro-latest:streamGenerateContent?alt=sse");
    expect(r.headers["x-goog-api-key"]).toBe("KEY");
    expect(r.body.tools).toEqual([{ google_search: {} }]);
    expect((r.body.contents as { role: string }[]).map((c) => c.role)).toEqual(["user", "model"]);
  });
  it("OpenAI and xAI use the Responses API web_search tool and keep nothing", () => {
    const o = searchRequest("openai", "KEY", "gpt-6-sol", "sys", [{ role: "user", content: "hi" }]);
    const x = searchRequest("xai", "KEY", "grok-4.7", "sys", [{ role: "user", content: "hi" }]);
    expect(o.url).toBe("https://api.openai.com/v1/responses");
    expect(x.url).toBe("https://api.x.ai/v1/responses");
    expect(o.body).toMatchObject({ model: "gpt-6-sol", store: false, tools: [{ type: "web_search" }] });
    expect(o.headers.Authorization).toBe("Bearer KEY");
  });
  it("reads text, sources and errors from each company's stream", () => {
    expect(readEvent("gemini", { candidates: [{ content: { parts: [{ text: "think", thought: true }, { text: "A" }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://x.test/a", title: "x.test" } }] } }] }))
      .toEqual({ text: "A", sources: [{ url: "https://x.test/a", title: "x.test" }] });
    expect(readEvent("openai", { type: "response.output_text.delta", delta: "B" }).text).toBe("B");
    expect(readEvent("xai", { type: "response.output_text.annotation.added", annotation: { type: "url_citation", url: "https://y.test", title: "Y" } }).sources).toHaveLength(1);
    expect(readEvent("openai", { type: "response.failed", response: { error: { message: "no" } } }).error).toBe("no");
  });
  it("sources: each address once, links only", () => {
    expect(sourcesLine([])).toBe("");
    expect(sourcesLine([{ url: "https://a.test/1", title: "A [1]" }, { url: "https://a.test/1", title: "A" }, { url: "javascript:x", title: "bad" }])).toBe("\n\n🔎 [A 1](https://a.test/1)");
  });
  it("streams the searched answer with its sources", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(sse([{ type: "response.output_text.delta", delta: "Hi" }, { type: "response.output_text.annotation.added", annotation: { type: "url_citation", url: "https://n.test", title: "N" } }]));
    expect(await run("xai:grok-4.7")).toBe("Hi\n\n🔎 [N](https://n.test)");
    expect(String(f.mock.calls[0]![0])).toBe("https://api.x.ai/v1/responses");
  });
  it("refused search → the usual answer, told it couldn't search (no silent «I searched»)", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("tool not supported", { status: 400 }))
      .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: "plain" } }] }]));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await run("gemini:gemini-flash-latest")).toBe("plain");
    const body = JSON.parse(String((f.mock.calls[1]![1] as RequestInit).body));
    expect(String(f.mock.calls[1]![0])).toContain("/openai/chat/completions");
    expect(body.messages[0].content).toMatch(/could not run/);
  });
});

// AI Soul worker/websearch.ts sourcesFooter: a searched answer that links none of its sources gets them listed under it.
describe("source links under Claude and OpenRouter searched answers", () => {
  const cite = { type: "content_block_delta", index: 0, delta: { type: "citations_delta", citation: { type: "web_search_result_location", url: "https://n.test/a", title: "News A" } } };
  it("reads Claude citations and OpenRouter annotations; lists them only when the answer has none of the links", () => {
    expect(eventSources(cite)).toEqual([{ url: "https://n.test/a", title: "News A" }]);
    expect(eventSources({ choices: [{ delta: { annotations: [{ type: "url_citation", url_citation: { url: "https://o.test/b", title: "B" } }] } }] })).toEqual([{ url: "https://o.test/b", title: "B" }]);
    expect(eventSources({ choices: [{ delta: { content: "x" } }] })).toEqual([]);
    expect(sourcesFooter("It rained.", [])).toBe("");
    expect(sourcesFooter("See https://n.test/a", [{ url: "https://n.test/a", title: "A" }])).toBe("");
    expect(sourcesFooter("It rained.", [{ url: "https://n.test/a", title: "A" }])).toBe("\n\n🔎 [A](https://n.test/a)");
  });
  it("a Claude key answer ends with the sources it cited", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(sse([
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "It rained." } }, cite]));
    expect(await run("claude-sonnet-5")).toBe("It rained.\n\n🔎 [News A](https://n.test/a)");
  });
  it("an OpenRouter answer that already links its source gets no second list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(sse([{ choices: [{ delta: { content: "Per [B](https://o.test/b).", annotations: [{ type: "url_citation", url_citation: { url: "https://o.test/b", title: "B" } }] } }] }]));
    expect(await run("anthropic/claude-sonnet-5")).toBe("Per [B](https://o.test/b).");
  });
});
