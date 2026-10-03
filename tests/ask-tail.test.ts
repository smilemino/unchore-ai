// «Your turn» looks at the answer's last 2,500 characters, not 400 (AI Soul lib/ask-judge.ts): a question asked mid-answer and followed
// by a long report still makes the small AI look, and the AI sees the same part.
import { describe, expect, it, vi } from "vitest";

const seen: string[] = [];
vi.mock("@/lib/ai", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai")>()),
  complete: vi.fn(async (o: { messages: { content: string }[] }) => { seen.push(o.messages[0]!.content); return "yes"; }),
}));

const { ASK_TAIL, answerAsks, judgeInput, mayAsk } = await import("@/lib/turn-mark");

const report = "The build finished and all twelve pages loaded without errors. ".repeat(16).trim();   // ~1,000 characters
const midAsk = `Should I move the meeting to Friday?\n\n${report}\n\nI'll report back when the rest is done.`;

describe("ask tail", () => {
  it("a question 1,000 characters before the end is a hint", () => {
    expect(report.length).toBeGreaterThan(400);
    expect(mayAsk(midAsk)).toBe(true);
  });
  it("a question further back than the window is not", () => {
    expect(mayAsk(`Should I move the meeting to Friday?\n\n${"Plain report line without asking. ".repeat(100)}`)).toBe(false);
  });
  it("the small AI gets the same 2,500 characters, a cut start marked", async () => {
    const long = `${"x".repeat(3000)}\n${midAsk}`;
    expect(judgeInput(long)).toBe(`…${long.slice(-ASK_TAIL)}`);
    expect(judgeInput(midAsk)).toBe(midAsk);
    expect(await answerAsks(midAsk, { judge: true, model: "claude-haiku-4-5", keys: { anthropic: "k" } })).toBe(true);
    expect(seen.at(-1)).toContain("Should I move the meeting to Friday?");
  });
});
