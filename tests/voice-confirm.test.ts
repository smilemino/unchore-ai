import { describe, expect, it } from "vitest";
import { UNCONFIRMED_NOTE, VOICE_CONFIRM_MS, confirmedTask, confirmedWork, isMoneyTask, readConfirm, voiceConfirmGuide } from "@/lib/voice/confirm";
import { readHandOff } from "@/lib/computers";

// Voice mode read-back (AI Soul 2619555): a step that can't be undone is read back first, and only a short «yes» to that
// very answer within 3 minutes hands it to the member's computer. Paying is never approved by voice.
const READ_BACK = "You want me to send the draft to Jane — right?\n[[confirm: Send the draft «Q3 plan» by email to jane@example.com]]";
const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

describe("voice read-back", () => {
  it("takes the [[confirm: …]] line out of the spoken answer and keeps the task", () => {
    const r = readConfirm(READ_BACK);
    expect(r.text).toBe("You want me to send the draft to Jane — right?");
    expect(r.confirm).toBe("Send the draft «Q3 plan» by email to jane@example.com");
    expect(readConfirm("Just talk.").confirm).toBeNull();
  });
  it("a read-back answer hands nothing over even if it also wrote [[computer: …]]", () => {
    const c = readConfirm(`${READ_BACK}\n[[computer: send it]]`);
    const h = readHandOff(c.text);
    expect(c.confirm).not.toBeNull();
    expect(h.task).toBe("send it");   // turn.ts: task = yesTo ?? (c.confirm ? null : h.task) — dropped
    expect(h.text).not.toContain("[[");
  });
  it("only a short yes to the read-back, within 3 minutes, approves it", () => {
    const last = { content: "You want me to send the draft to Jane — right?", voice_confirm: "Send the draft", created_at: at(30_000) };
    for (const y of ["yes", "Yes, go ahead", "네", "네 맞아요", "はい"]) expect(confirmedTask(last, y), y).toBe("Send the draft");
    for (const n of ["no", "아니요", "잠깐만", "wait, which draft?", "yes but send it to Tom instead and also cc my boss please"]) expect(confirmedTask(last, n), n).toBeNull();
  });
  it("a yes after 3 minutes, or to an answer without a read-back, approves nothing", () => {
    expect(confirmedTask({ content: "…right?", voice_confirm: "Send the draft", created_at: at(VOICE_CONFIRM_MS + 5_000) }, "yes")).toBeNull();
    expect(confirmedTask({ content: "Shall I tell you a joke?", voice_confirm: null, created_at: at(1_000) }, "yes")).toBeNull();
    expect(confirmedTask(null, "yes")).toBeNull();
  });
  it("paying, buying and refunds are never approved by voice", () => {
    for (const t of ["Pay the electricity bill", "Buy the cheapest AirPods on Amazon", "Refund order 123", "Send $50 to Tom"]) expect(isMoneyTask(t), t).toBe(true);
    for (const t of ["Send the draft to Jane", "Delete the folder old-photos", "Deploy the site to production"]) expect(isMoneyTask(t), t).toBe(false);
  });
  it("tells the computer what a spoken yes allows", () => {
    expect(confirmedWork("Send the draft", " 네 ")).toContain("said «네» — do exactly this step");
    expect(confirmedWork("Send the draft", "yes")).toContain("Never pay or spend money on a spoken yes");
    expect(UNCONFIRMED_NOTE).toMatch(/don't send, delete, publish, deploy or pay/);
  });
  it("the guide asks for a read-back, a number when unclear, and no payments by voice", () => {
    const g = voiceConfirmGuide("My Mac");
    expect(g).toContain("[[confirm:");
    expect(g).toContain("with numbers and ask which one");
    expect(g).toContain("never approved by voice");
  });
});
