import { trFor } from "@/lib/i18n-server";
// Port batch 6 from AI Soul (2026-09-30 sync): very long pastes become a text attachment.
import { describe, expect, it } from "vitest";
import { MODELS, autoModel, chooseModel } from "@/lib/ai";
import { PASTE_ATTACH_CHARS, pasteFileName, shouldAttachPaste } from "@/lib/paste";

describe("long paste becomes a file", () => {
  it("only past 4,000 characters", () => {
    expect(shouldAttachPaste("a".repeat(PASTE_ATTACH_CHARS))).toBe(false);
    expect(shouldAttachPaste("a".repeat(PASTE_ATTACH_CHARS + 1))).toBe(true);
  });
  it("numbers the files in the member's language", () => {
    expect(pasteFileName([], trFor("en"))).toBe("Pasted text.txt");
    expect(pasteFileName(["Pasted text.txt", "photo.png"], trFor("en"))).toBe("Pasted text 2.txt");
    expect(pasteFileName([], trFor("ko"))).toBe("붙여넣은 글.txt");
  });
});

describe("DeepSeek and GLM on OpenRouter", () => {
  it("can be picked but «Auto» never picks them", () => {
    const ids = MODELS.openrouter.map((m) => m.id);
    expect(ids).toContain("deepseek/deepseek-v4.1-flash");
    expect(ids).toContain("z-ai/glm-5.3");
    const k = { openrouter: "x" };
    expect(chooseModel(k, "z-ai/glm-5.3")).toBe("z-ai/glm-5.3");
    for (const strong of [true, false]) expect(["deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3"]).not.toContain(autoModel(k, "hi", strong));
  });
});
