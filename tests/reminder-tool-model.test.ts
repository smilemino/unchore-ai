import { describe, expect, it } from "vitest";
import { fallbackModel, toolKeys, toolModel } from "../lib/ai";

// 2026-10-03 07:55: the build-diary reminder fell back from the Claude plan to the ChatGPT plan, which has no tool bridge, answered
// «the computer tool isn't connected» and posted nothing. A reminder or a background job gets an AI that takes tools.
describe("a turn nobody watches never answers on the ChatGPT plan", () => {
  const q = "언초어 개발 일기 스레드 게시 차례입니다.";
  it("the ChatGPT plan becomes the strong model of the first connection that takes tools", () => {
    expect(toolModel({ chatgpt_sub: "u", claude_sub: "u", openrouter: "k" }, "cx:gpt-6-sol", q)).toBe("sub:opus");
    expect(toolModel({ chatgpt_sub: "u", anthropic: "k", openrouter: "k" }, "cx:gpt-6-luna", q)).toBe("claude-opus-5-5");
    expect(toolModel({ chatgpt_sub: "u", openrouter: "k", credit: "u" }, "cx:gpt-6-sol", q)).toBe("anthropic/claude-sonnet-5");
    expect(toolModel({ chatgpt_sub: "u", credit: "u" }, "cx:gpt-6-sol", q)).toBe("uc:anthropic/claude-sonnet-5");
  });
  it("only the ChatGPT plan connected → it stays; any other pick stays as it is", () => {
    expect(toolModel({ chatgpt_sub: "u" }, "cx:gpt-6-sol", q)).toBe("cx:gpt-6-sol");
    expect(toolModel({ chatgpt_sub: "u", claude_sub: "u" }, "sub:haiku", q)).toBe("sub:haiku");
    expect(toolModel({ chatgpt_sub: "u", openrouter: "k" }, "openrouter/auto", q)).toBe("openrouter/auto");
  });
  it("when the Claude plan fails, the next try skips the ChatGPT plan (the owner's three connections, 2026-10-03)", () => {
    const keys = { claude_sub: "u", chatgpt_sub: "u", openrouter: "k" };
    expect(fallbackModel(keys, ["sub:opus"])).toBe("cx:gpt-6-sol");   // a chat someone watches: unchanged
    expect(fallbackModel(toolKeys(keys), ["sub:opus"])).toBe("openrouter/auto");
    expect(fallbackModel(toolKeys({ claude_sub: "u", chatgpt_sub: "u" }), ["sub:opus"])).toBeNull();   // no toolless answer — tried again later
    expect(toolKeys({ chatgpt_sub: "u" })).toEqual({ chatgpt_sub: "u" });
  });
});
