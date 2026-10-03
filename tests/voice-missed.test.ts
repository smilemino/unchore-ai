import { describe, it, expect } from "vitest";
import { missedFresh, MISSED_MS } from "../lib/voice/missed";

const NOW = 1_000_000_000;
describe("answer that came after voice mode closed", () => {
  it("is read when voice mode opens again in the same chat soon after", () => {
    expect(missedFresh({ text: "Here it is.", conv: "a", at: NOW - 60_000 }, "a", NOW)).toBe(true);
  });
  it("is not read in another chat, when stale, or when empty", () => {
    expect(missedFresh({ text: "Here it is.", conv: "a", at: NOW - 60_000 }, "b", NOW)).toBe(false);
    expect(missedFresh({ text: "Here it is.", conv: "a", at: NOW - MISSED_MS }, "a", NOW)).toBe(false);
    expect(missedFresh({ text: "  ", conv: "a", at: NOW }, "a", NOW)).toBe(false);
    expect(missedFresh(null, "a", NOW)).toBe(false);
  });
});
