import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("../lib/claude-sub", () => {
  class SubError extends Error { constructor(public why: string, public plan = "claude") { super(`${plan} plan: ${why}`); } }
  return {
    SubError,
    async *subChat(o: { plan?: string; model: string }) {
      calls.push(`${o.plan}:${o.model}`);
      if (o.plan === "claude") throw new SubError("limit");
      if (o.plan === "chatgpt" && o.model === "bad") throw new SubError("other", "chatgpt");
      yield "Short title";
    },
  };
});

const { completeSide, nextFastModel } = await import("../lib/ai");
const base = { system: "s", messages: [{ role: "user" as const, content: "q" }] };

describe("side jobs try the member's next connection once (AI Soul f7248c4)", () => {
  it("a limited Claude plan falls to the ChatGPT plan", async () => {
    calls.length = 0;
    const out = await completeSide({ claude_sub: "u1", chatgpt_sub: "u1" }, { ...base, model: "sub:haiku" });
    expect(out).toBe("Short title");
    expect(calls[0]).toBe("claude:haiku");
    expect(calls[1]?.startsWith("chatgpt:")).toBe(true);
  });
  it("with only one connection the error still comes back", async () => {
    await expect(completeSide({ claude_sub: "u1" }, { ...base, model: "sub:haiku" })).rejects.toThrow("limit");
  });
  it("never falls to Unchore credit", () => {
    expect(nextFastModel({ claude_sub: "u1", credit: "u1" }, ["sub:haiku"])).toBeNull();
  });
  it("picks the next connection's fast model", () => {
    expect(nextFastModel({ claude_sub: "u1", anthropic: "k" }, ["cx:gpt-6-sol"])).toBe("sub:haiku");
  });
});
