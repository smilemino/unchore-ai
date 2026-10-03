// Night 2026-10-01 round 9: a turn with no read of its own (setting the reminder) said «the earlier figures were not checked live».
import { describe, expect, it } from "vitest";
import { EARLIER_LIVE } from "@/lib/live";

describe("earlier live values note", () => {
  it("tells the AI the earlier sourced numbers were read live, and not to call them unchecked", () => {
    expect(EARLIER_LIVE).toMatch(/read live/);
    expect(EARLIER_LIVE).toMatch(/Don't tell the member they weren't checked live/);
    expect(EARLIER_LIVE).not.toMatch(/[가-힣]/);
  });
});
