// A reminder's answer must not bury an earlier question the member hasn't answered (AI Soul lib/open-decision.ts · cc0ed68).
import { describe, expect, it } from "vitest";
import { aiWithdrew, openAsk, openAskNote, reminderKeepsAsk } from "@/lib/turn-mark";

const R = (text: string) => ({ role: "user", text, asks: null });
const A = (asks: boolean | null) => ({ role: "assistant", text: "…", asks });
describe("an open question survives reminder answers", () => {
  it("still open: only reminder prompts and their answers came after it", () => {
    expect(openAsk([R("⏰ Reminder (#2) — check BTC"), A(false), R("⏰ Reminder (#1) — check BTC"), A(true), R("which plan?")])).toBe(true);
  });
  it("answered: the member wrote after it", () => {
    expect(openAsk([R("⏰ Reminder — check BTC"), A(false), R("the first one"), A(true)])).toBe(false);
  });
  it("nothing asked before", () => { expect(openAsk([R("⏰ Reminder — x"), A(false), R("hi"), A(false)])).toBe(false); });
});

// The reminder's own answer takes the question back — then it no longer waits (AI Soul lib/open-decision.ts aiWithdrew · 2895875).
describe("an answer that takes the question back", () => {
  it("reads «nothing for you to do» in Korean and English", () => {
    expect(aiWithdrew("확인했습니다. 하실 일: 없습니다.")).toBe(true);    // the closing label line counts too (AI Soul WITHDRAW)
    expect(aiWithdrew("모두 끝났습니다. 지금 하실 일은 없습니다.")).toBe(true);
    expect(aiWithdrew("이 건은 더 여쭙지 않겠습니다.")).toBe(true);
    expect(aiWithdrew("All set — nothing for you to do.")).toBe(true);
    expect(aiWithdrew("No need to decide anything now.")).toBe(true);
    expect(aiWithdrew("네 가지를 올리고 있습니다 — 다르면 말씀만 주세요.")).toBe(true);   // done-then-tell (AI Soul 10/2)
    expect(aiWithdrew("Done — just let me know if you want it different.")).toBe(true);
  });
  it("leaves real questions alone", () => {
    expect(aiWithdrew("Which plan should I use?")).toBe(false);
    expect(aiWithdrew("어느 쪽으로 할까요?")).toBe(false);
  });
});

// A reminder's answer that marks the task done also closes the earlier question, whatever the words (AI Soul 93028744).
describe("reminder answer with a done mark", () => {
  it("keeps the question only when the answer neither takes it back nor marks it done", () => {
    expect(reminderKeepsAsk("Checked the inbox. Two new replies came in.", false)).toBe(true);
    expect(reminderKeepsAsk("Checked the inbox. Two new replies came in.", true)).toBe(false);
    expect(reminderKeepsAsk("확인했습니다. 하실 일: 없습니다.", false)).toBe(false);
  });
});

// The AI is told about the buried question on the member's next turn (AI Soul lib/open-decision.ts openDecisionNote · 6219ecf).
describe("a line about the question buried under reminders", () => {
  const Q = (text: string, asks: boolean | null) => ({ role: "assistant", text, asks });
  it("names the question when reminder answers came after it", () => {
    const n = openAskNote([Q("Price checked.", true), R("⏰ Reminder — check BTC"), Q("Here is the draft.\n\nShall I send it to Mia now?", true), R("write to Mia")]);
    expect(n).toContain("«Shall I send it to Mia now?»");
  });
  it("reads a decide box", () => {
    const n = openAskNote([Q("Checked.", true), R("⏰ Reminder — x"), Q("Two ways.\n```decide\nKeep the old plan or switch?\n```", true), R("plan")]);
    expect(n).toContain("«Keep the old plan or switch?»");
  });
  it("nothing when the last answer is the question itself, the member wrote after it, or it was taken back", () => {
    expect(openAskNote([Q("Shall I send it?", true), R("write to Mia")])).toBeNull();
    expect(openAskNote([Q("Price checked.", false), R("⏰ Reminder — x"), Q("Got it.", false), R("the first one"), Q("Which one?", true)])).toBeNull();
    expect(openAskNote([Q("Nothing for you to do.", false), R("⏰ Reminder — x"), Q("Shall I send it?", true), R("hi")])).toBeNull();
  });
});
