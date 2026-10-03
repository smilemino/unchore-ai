import { describe, expect, it } from "vitest";
import { fallbackModel, seesImages, visionModel } from "@/lib/ai";

// A picture sent to an AI that reads text only (DeepSeek, GLM) came back as an error and no answer (AI Soul lib/routing.ts).
describe("pictures go to an AI that can see them", () => {
  it("knows which models read text only", () => {
    for (const m of ["deepseek:deepseek-chat", "deepseek/deepseek-v4.1-flash", "uc:deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3", "uc:z-ai/glm-5.3"]) expect(seesImages(m)).toBe(false);
    for (const m of ["sub:opus", "claude-sonnet-5", "gpt-6-sol", "openrouter/auto", "uc:anthropic/claude-sonnet-5", "gemini:gemini-flash-latest"]) expect(seesImages(m)).toBe(true);
  });
  it("prefers a seeing model on the same connection, then the member's other ones", () => {
    expect(visionModel({ openrouter: "k" }, "z-ai/glm-5.3")).toBe("openrouter/auto");
    expect(visionModel({ credit: "m" }, "uc:deepseek/deepseek-v4.1-flash")).toBe("uc:anthropic/claude-sonnet-5");
    expect(visionModel({ deepseek: "k", gemini: "k" }, "deepseek:deepseek-chat")).toBe("gemini:gemini-pro-latest");
    expect(visionModel({ deepseek: "k" }, "deepseek:deepseek-reasoner")).toBeNull();
  });
  it("falls back past text-only connections when the chat has pictures", () => {
    expect(fallbackModel({ openai: "k", deepseek: "k", kimi: "k" }, ["gpt-6-sol"], true)).toBe("kimi:kimi-k3");
    expect(fallbackModel({ openai: "k", deepseek: "k" }, ["gpt-6-sol"], true)).toBeNull();
    expect(fallbackModel({ openai: "k", deepseek: "k" }, ["gpt-6-sol"])).toBe("deepseek:deepseek-chat");
  });
});
