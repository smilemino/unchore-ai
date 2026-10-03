import { describe, expect, it } from "vitest";
import { parseResetAt } from "../worker/reset-at.mjs";
import { liftTime, subMessage } from "../lib/claude-sub";

// A plan's limit: tell the member the exact time it lifts, read from the AI company's own words (AI Soul lib/limit-proof.ts).
const now = Date.parse("2026-10-03T01:00:00Z");   // 10:00 in Seoul
describe("when a plan's limit lifts", () => {
  it("reads the AI company's «resets …» words, with or without a date, in their time zone", () => {
    expect(parseResetAt("You've hit your weekly limit · resets Oct 5, 12pm (UTC)", now)).toBe("2026-10-05T12:00:00.000Z");
    expect(parseResetAt("Session limit reached ∙ resets 8:30pm (UTC)", now)).toBe("2026-10-03T20:30:00.000Z");
    expect(parseResetAt("resets 3:10am (Asia/Seoul)", now)).toBe("2026-10-03T18:10:00.000Z");   // already past today → tomorrow
  });
  it("reads nothing it can't be sure of", () => {
    expect(parseResetAt("usage limit reached, try later", now)).toBeNull();
    expect(parseResetAt("resets Foo 5, 12pm (UTC)", now)).toBeNull();
    expect(parseResetAt("resets 3pm (Not/AZone)", now)).toBeNull();
  });
  it("tells the time in the member's time zone, and keeps «soon» without one", () => {
    expect(liftTime("2026-10-05T12:00:00.000Z", "en", "Asia/Seoul")).toMatch(/Oct 5.*9:00/);
    expect(liftTime(undefined, "en", "Asia/Seoul")).toBeNull();
    expect(subMessage("limit", "en", "claude", { resetsAt: "2026-10-05T12:00:00.000Z", tz: "Asia/Seoul" })).toMatch(/use it again at Oct 5.*9:00/);
    expect(subMessage("limit", "en", "claude")).toContain("It resets soon");
    expect(subMessage("limit", "en", "chatgpt", { resetsAt: "2026-10-05T12:00:00.000Z", tz: "UTC" })).toMatch(/ChatGPT plan.*use it again at Oct 5.*12:00/);
  });
});
