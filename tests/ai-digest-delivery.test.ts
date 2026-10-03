import { describe, expect, it } from "vitest";
import { getRecipe } from "../lib/recipes";

// Night test 2026-09-30: the daily brief's first run said «I can't send this every day» — the AI must know it is the delivery.
describe("ai_digest — the AI is told this text is the scheduled delivery", () => {
  it("prompt frames it as today's delivery, not a chat", async () => {
    let asked = "";
    const r = await getRecipe("ai_digest")!.run({ prompt: "수능 영어 단어 10개" }, { lang: "ko", tz: "Asia/Seoul", ai: async (p: string) => { asked = p; return "1. assume — 가정하다"; } } as never);
    expect(asked).toContain("scheduled delivery");
    expect(asked).toContain("no «I can't send daily»");
    expect(r.ok).toBe(true);
  });
});
