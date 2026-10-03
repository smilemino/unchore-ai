// Chat on Unchore credit (owner «yes» 2026-09-30): the member's own connections answer first, credit last; a call on credit
// runs on Unchore's OpenRouter key and charges what OpenRouter reported, also when the member presses Stop mid-answer.
import { afterEach, describe, expect, it, vi } from "vitest";

const charged: { member: string; cost: number }[] = [];
vi.mock("@/lib/credits", () => ({
  houseKey: () => "sk-or-house",
  creditReady: async () => true,
  charge: async (member: string, cost: number) => { charged.push({ member, cost }); return { charged: 0, micro: 0 }; },
}));

const { autoModel, chooseModel, fallbackModel, fastModel, providerOf, streamChat, AiError } = await import("@/lib/ai");

function sse(lines: object[]): Response {
  const body = lines.map((l) => `data: ${JSON.stringify(l)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

afterEach(() => { vi.unstubAllGlobals(); charged.length = 0; });

describe("choosing a model with Unchore credit", () => {
  it("reads the credit prefix", () => {
    expect(providerOf("uc:anthropic/claude-sonnet-5")).toBe("credit");
    expect(providerOf("anthropic/claude-sonnet-5")).toBe("openrouter");
  });
  it("uses credit only when nothing of the member's own is connected", () => {
    expect(chooseModel({ credit: "m1" })).toBe("uc:anthropic/claude-sonnet-5");
    expect(chooseModel({ openai: "sk-x", credit: "m1" })).toBe("gpt-6-sol");
    expect(fastModel({ credit: "m1" })).toBe("uc:anthropic/claude-haiku-4.5");
    expect(autoModel({ credit: "m1" }, "hi")).toBe("uc:anthropic/claude-haiku-4.5");
    expect(autoModel({ credit: "m1" }, "compare these two contracts")).toBe("uc:anthropic/claude-sonnet-5");
  });
  it("falls back to credit when the member's own AI can't answer", () => {
    expect(fallbackModel({ anthropic: "sk-ant", credit: "m1" }, ["claude-sonnet-5"])).toBe("uc:anthropic/claude-sonnet-5");
  });
});

describe("streaming on credit", () => {
  it("sends Unchore's key and the plain model id, then charges OpenRouter's cost to the member", async () => {
    const fetchMock = vi.fn(async () => sse([
      { choices: [{ delta: { content: "Hel" } }] },
      { choices: [{ delta: { content: "lo" } }] },
      { choices: [{ delta: {} }], usage: { cost: 0.0042 } },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    let out = "";
    for await (const p of streamChat({ model: "uc:anthropic/claude-haiku-4.5", key: "member-1", system: "s", messages: [{ role: "user", content: "hi" }] })) out += p;
    expect(out).toBe("Hello");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("openrouter.ai");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-house");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("anthropic/claude-haiku-4.5");
    expect(body.usage).toEqual({ include: true });
    expect(body.provider).toEqual({ data_collection: "deny" });
    expect(charged).toEqual([{ member: "member-1", cost: 0.0042 }]);
  });
  it("charges when the reader stops early (Stop) after the cost line arrived", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([{ choices: [{ delta: { content: "a" } }], usage: { cost: 0.001 } }, { choices: [{ delta: { content: "b" } }] }])));
    for await (const p of streamChat({ model: "uc:z-ai/glm-5.3", key: "member-2", system: "s", messages: [{ role: "user", content: "x" }] })) { if (p) break; }
    expect(charged).toEqual([{ member: "member-2", cost: 0.001 }]);
  });
  it("never charges a call on the member's own OpenRouter key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([{ choices: [{ delta: { content: "ok" } }], usage: { cost: 0.5 } }])));
    for await (const p of streamChat({ model: "anthropic/claude-haiku-4.5", key: "sk-or-own", system: "s", messages: [{ role: "user", content: "x" }] })) void p;
    expect(charged).toEqual([]);
  });
  it("Unchore's account out of money is not the member's «top up on the provider's site»", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 402 })));
    const run = async () => { for await (const p of streamChat({ model: "uc:anthropic/claude-haiku-4.5", key: "m", system: "s", messages: [{ role: "user", content: "x" }] })) void p; };
    await expect(run()).rejects.toBeInstanceOf(AiError);
    await expect(run()).rejects.toMatchObject({ status: 503 });
  });
});
