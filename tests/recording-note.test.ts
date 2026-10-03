// Recording → note (lib/recording-note.ts): what is kept from the AI's summary, the second check on «important» lines,
// and which AI does that check.
import { describe, expect, it } from "vitest";
import { checkModel, confirmedLines, readRecording, recordingBody, recordingNote } from "@/lib/recording-note";

const raw = JSON.stringify({
  title: "Vendor call", summary: "We agreed on the spring order.",
  points: ["Order 300 units", "Ship by April 10", "account number 110-234-567890 at the bank"],
  todo: ["Send the contract draft"], important: ["Deadline is April 10", "Price is $12 a unit"], tags: ["#vendor", "orders"],
});

describe("what is kept from the summary", () => {
  it("reads the JSON (fenced too) and drops sensitive lines", () => {
    const r = readRecording("```json\n" + raw + "\n```")!;
    expect(r.title).toBe("Vendor call");
    expect(r.points).toEqual(["Order 300 units", "Ship by April 10"]);
    expect(r.tags).toEqual(["vendor", "orders"]);
    expect(r.important).toHaveLength(2);
  });
  it("broken JSON, no title or no points → nothing", () => {
    expect(readRecording("not json")).toBeNull();
    expect(readRecording(JSON.stringify({ title: "X", points: ["a point"] }))).toBeNull();
    expect(readRecording(JSON.stringify({ title: "Call", points: [] }))).toBeNull();
  });
});

describe("«important» is checked twice", () => {
  it("only numbers the check names, in range", () => {
    expect([...confirmedLines('{"confirmed":[1, 3, "2", 0, 9]}', 3)].sort()).toEqual([0, 1, 2]);
    expect(confirmedLines("I think both are right", 2).size).toBe(0);
  });
  it("an unconfirmed line is never shown as fact — it goes under «check against the recording»", () => {
    const r = readRecording(raw)!;
    const body = recordingBody(r, confirmedLines('{"confirmed":[1]}', 2), "call.m4a", "en");
    const [sure, check] = body.split("**Check against the recording — not confirmed**");
    expect(sure).toContain("**Important**\n- Deadline is April 10");
    expect(sure).not.toContain("$12");
    expect(check).toContain("- Price is $12 a unit");
    expect(body).toContain("- [ ] Send the contract draft");
    expect(body.startsWith("🎙 call.m4a\nWe agreed on the spring order.")).toBe(true);
  });
  it("headings in the member's language", () => {
    expect(recordingBody(readRecording(raw)!, new Set([0, 1]), "a.m4a", "ko")).toContain("**중요**");
  });
  it("the check runs on another of the member's AIs when there is one", () => {
    const first = checkModel({ gemini: "g" }, "x");
    expect(checkModel({ gemini: "g" }, first)).toBe(first);
    expect(checkModel({ gemini: "g", openai: "o" }, first)).not.toBe(first);
  });
});

describe("no AI of their own", () => {
  it("no key → no note, nothing throws, no Unchore-paid route", async () => {
    expect(await recordingNote("u", "c", ["f"], {}, "en")).toBeNull();
    expect(await recordingNote("u", "c", [], { gemini: "g" }, "en")).toBeNull();
  });
});
