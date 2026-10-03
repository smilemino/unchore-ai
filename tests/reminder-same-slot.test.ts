import { describe, expect, it } from "vitest";
import { extractReminders, replacedFrom, replacesSame } from "../lib/reminders";

// AI Soul 2026-10-01: setting the same daily reminder again in one chat nearly made it run twice — daily/weekday ones replace.
describe("same-time daily reminder replaces", () => {
  it("daily and weekday reminders replace the one at the same time; repeats and one-offs add", () => {
    const { proposals } = extractReminders("<<<remind daily=04:30>>>\nnight review\n<<<end>>>\n<<<remind days=12345@09:00>>>\nx\n<<<end>>>\n<<<remind every=30m>>>\ny\n<<<end>>>\n<<<remind after=10m>>>\nz\n<<<end>>>");
    expect(proposals.map(replacesSame)).toEqual([true, true, false, false]);
  });
});

describe("replaced reminder note says what it was", () => {
  it("names the old job only when it changed", () => {
    expect(replacedFrom("night review", "night review + report")).toBe("«night review» → ");
    expect(replacedFrom("night review", "night review")).toBe("");
  });
});
