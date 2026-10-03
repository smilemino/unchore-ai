import { describe, expect, it } from "vitest";
import { MODELS } from "@/lib/ai";
import { modelBlurb } from "@/lib/model-blurb";
import ko from "@/lib/locales/ko.json";

// Each AI in the pick list has a one-line «what it's good at» (ported from AI Soul's EnginePicker).
describe("model blurb", () => {
  it("every listed model has a line, and every line has Korean", () => {
    for (const m of Object.values(MODELS).flat()) {
      const b = modelBlurb(m.id);
      expect(b, m.id).toBeTruthy();
      expect((ko as Record<string, string>)[b!], b!).toBeTruthy();
    }
  });
  it("matches the right family through connection prefixes", () => {
    expect(modelBlurb("sub:opus")).toBe(modelBlurb("claude-opus-5-5"));
    expect(modelBlurb("cx:gpt-6-luna")).toBe(modelBlurb("gpt-6-luna"));
    expect(modelBlurb("deepseek:deepseek-reasoner")).toMatch(/step by step/);
    expect(modelBlurb("deepseek:deepseek-chat")).toMatch(/Everyday writing/);
    expect(modelBlurb("gemini:gemini-pro-latest")).toMatch(/long documents/);
    expect(modelBlurb("gemini:gemini-flash-latest")).toBe("Quick short answers");
    expect(modelBlurb("openrouter/auto")).toMatch(/OpenRouter picks/);
    expect(modelBlurb("some-new-model")).toBeNull();
  });
});
