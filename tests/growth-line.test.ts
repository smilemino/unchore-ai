import { describe, expect, it } from "vitest";
import { growthLine } from "../lib/metrics";

describe("growth scoreboard line (owners' nightly mail, plan §13 C)", () => {
  it("shows weekly users, new members, friend-link signups and sources, biggest source first", () => {
    expect(growthLine({ wau: 3, signups7: 5, friends7: 1, bySource: { "utm:threads": 1, "ref:ab12cd34": 1, unknown: 3 } }))
      .toBe("Growth (7 days, real members): used Unchore 3 · new 5 · from a friend's link 1 · came from: unknown 3, utm:threads 1, ref:ab12cd34 1");
  });
  it("says — when nobody came", () => {
    expect(growthLine({ wau: 0, signups7: 0, friends7: 0, bySource: {} })).toContain("came from: —");
  });
});
