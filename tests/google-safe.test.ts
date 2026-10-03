import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "@/lib/ai";
import { googleSafe } from "@/lib/google-safe";

// Google data only to AIs that don't train on it (lib/google-safe.ts · Google's review 2026-10-02, Limited Use).
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
async function collect(g: AsyncGenerator<string>) { let s = ""; for await (const p of g) s += p; return s; }
afterEach(() => vi.unstubAllGlobals());

describe("which AIs may get Google data", () => {
  it("the paid APIs that don't train, OpenRouter and Unchore credit", () => {
    for (const m of ["claude-opus-5-5", "gpt-6-sol", "xai:grok-5", "openai/gpt-6-sol", "anthropic/claude-sonnet-5", "uc:anthropic/claude-sonnet-5"]) expect(googleSafe(m), m).toBe(true);
  });
  it("not consumer plans, Gemini, DeepSeek or Kimi", () => {
    for (const m of ["sub:opus", "cx:gpt-6", "gemini:gemini-3-pro", "deepseek:deepseek-chat", "kimi:kimi-k3"]) expect(googleSafe(m), m).toBe(false);
    expect(googleSafe(null)).toBe(false);
  });
});

describe("OpenRouter with Google data", () => {
  it("the member's own key asks only providers that neither store nor train (data_collection deny); without Google data it doesn't", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return sse([{ choices: [{ delta: { content: "ok" } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }]); }));
    expect(await collect(streamChat({ model: "openai/gpt-6-sol", key: "k", system: "S", messages: [{ role: "user", content: "my calendar" }], noTrain: true }))).toBe("ok");
    expect(bodies[0]!.provider).toEqual({ data_collection: "deny" });
    await collect(streamChat({ model: "openai/gpt-6-sol", key: "k", system: "S", messages: [{ role: "user", content: "hi" }] }));
    expect(bodies[1]!.provider).toBeUndefined();
  });
  it("OpenAI's own API gets no OpenRouter-only field", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return sse([{ choices: [{ delta: { content: "ok" } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }]); }));
    await collect(streamChat({ model: "gpt-6-sol", key: "k", system: "S", messages: [{ role: "user", content: "my calendar" }], noTrain: true }));
    expect(bodies[0]!.provider).toBeUndefined();
  });
});
