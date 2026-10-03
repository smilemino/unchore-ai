// Batch 13 (2026-09-30 sync): the fixed front of the instructions is cached; the time moved below the boundary.
import { describe, expect, it } from "vitest";
import { systemPrompt } from "@/lib/persona";
import { PROMPT_BOUNDARY, anthropicSystem, stripPromptBoundary } from "@/lib/prompt-boundary";

describe("prompt cache boundary", () => {
  const a = systemPrompt("en", "America/New_York", { rules: "Always answer in bullet points", question: "hi" });
  it("keeps the time and the member's own rules below the boundary", () => {
    const [head, tail] = a.split(PROMPT_BOUNDARY);
    expect(head).not.toMatch(/Now: /);
    expect(tail).toMatch(/^\nNow: /);
    expect(tail).toContain("Always answer in bullet points");
  });
  it("the part above is identical for two members at different times and with different rules", () => {
    const b = systemPrompt("en", "Europe/London", { rules: "Be brief", question: "what's up" });
    expect(b.split(PROMPT_BOUNDARY)[0]).toBe(a.split(PROMPT_BOUNDARY)[0]);
  });
  it("Anthropic gets the fixed part marked for caching; others never see the marker", () => {
    const blocks = anthropicSystem(a);
    expect(blocks[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1]!.text.startsWith("Now: ")).toBe(true);
    expect(blocks.map((b) => b.text).join("")).not.toContain(PROMPT_BOUNDARY);
    expect(stripPromptBoundary(a)).not.toContain(PROMPT_BOUNDARY);
    expect(anthropicSystem("plain")).toEqual([{ type: "text", text: "plain" }]);
  });
});

import { AiError, canFallBack, fallbackModel } from "@/lib/ai";
import { SubError } from "@/lib/claude-sub";

describe("another connection when the first can't answer", () => {
  it("falls back only for «can't answer now» errors", () => {
    for (const s of [401, 402, 403, 429, 500, 529]) expect(canFallBack(new AiError(s, "x"))).toBe(true);
    expect(canFallBack(new AiError(400, "image input not supported"))).toBe(true);   // another connection may take it (AI Soul lib/routing.ts)
    expect(canFallBack(new AiError(404, "no such model"))).toBe(true);
    expect(canFallBack(new AiError(400, "prompt is too long: 250000 tokens"))).toBe(false);   // the same everywhere
    expect(canFallBack(new SubError("limit"))).toBe(true);
    expect(canFallBack(new SubError("blocked"))).toBe(true);   // company turned plan access off — try the next connection
    expect(canFallBack(new SubError("other"))).toBe(true);      // an unknown error may be this connection's own — try the next (AI Soul b41c6bf)
    expect(canFallBack(new SubError("worker_502"))).toBe(true);
    expect(canFallBack(new SubError("too_long"))).toBe(false);  // the question is too long — the same everywhere
    expect(canFallBack(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
  });
  it("picks the next connection not tried yet, in the member's order", () => {
    const keys = { claude_sub: "u", openai: "k", openrouter: "k" };
    expect(fallbackModel(keys, ["sub:opus"])).toBe("gpt-6-sol");
    expect(fallbackModel(keys, ["sub:opus", "gpt-6-sol"])).toBe("openrouter/auto");
    expect(fallbackModel(keys, ["sub:opus", "gpt-6-sol", "openrouter/auto"])).toBeNull();
    expect(fallbackModel({ openai: "k" }, ["gpt-6-luna"])).toBeNull();
  });
});
