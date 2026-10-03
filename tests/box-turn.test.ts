import { describe, expect, it } from "vitest";
import { answerAsks, hasDecisionBox } from "@/lib/turn-mark";

const box = "Two ways to price it.\n\n```decide\nShall we start at $49 a month?\n```\n\n⏳ Waiting for the supplier's reply.";
describe("an answer with a decide box is the member's turn", () => {
  it("the box counts even when the question is only inside it and a waiting line follows", async () => {
    expect(hasDecisionBox(box)).toBe(true);
    expect(await answerAsks(box, { judge: false, model: null, keys: {} })).toBe(true);
  });
  it("a copy box or an empty box is not a decision", () => {
    expect(hasDecisionBox("```copy\nHello\n```")).toBe(false);
    expect(hasDecisionBox("```decide\n\n```")).toBe(false);
  });
});
