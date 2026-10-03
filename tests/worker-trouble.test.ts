import { describe, expect, it } from "vitest";
import { canFallBack, canRetrySame } from "@/lib/ai";
import { SubError } from "@/lib/claude-sub";
import { errorWords } from "../worker/claude.mjs";

// 2026-10-03 01:27–01:29: the plan worker restarted under two reminders and both ended in «클로드 요금제로 답하지 못했어요»
// with no second try — the worker's trouble is not the plan's, so the next connection or one more try is used.
describe("plan worker trouble", () => {
  it("moves on or asks again when the worker can't be reached or restarts mid-answer", () => {
    for (const w of ["worker_unreachable", "worker_cut", "warm_init"]) {
      expect(canFallBack(new SubError(w))).toBe(true);
      expect(canRetrySame(new SubError(w))).toBe(true);
    }
  });
  it("still keeps a too-long question where it is", () => {
    expect(canFallBack(new SubError("too_long"))).toBe(false);
    expect(canRetrySame(new SubError("too_long"))).toBe(false);
  });
  it("logs Claude Code's error words without e-mails or long numbers", () => {
    const w = errorWords("API Error: 500 for  me@x.com\n request 1234567890 " + "y".repeat(300));
    expect(w).toContain("API Error: 500");
    expect(w).not.toContain("me@x.com");
    expect(w).not.toContain("1234567890");
    expect(w.length).toBeLessThanOrEqual(160);
  });
});
