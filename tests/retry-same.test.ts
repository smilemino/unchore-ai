import { describe, expect, it } from "vitest";
import { AiError, canRetrySame } from "@/lib/ai";
import { SubError } from "@/lib/claude-sub";

// No other connection: a passing hiccup is asked once more instead of «please send again» (2026-10-02 member case).
describe("one more try on the same connection", () => {
  it("retries passing hiccups only", () => {
    expect(canRetrySame(new SubError("other"))).toBe(true);
    expect(canRetrySame(new SubError("busy"))).toBe(true);
    expect(canRetrySame(new SubError("worker_502"))).toBe(true);
    expect(canRetrySame(new AiError(529, "overloaded"))).toBe(true);
    expect(canRetrySame(new AiError(429, "rate"))).toBe(true);
  });
  it("does not retry limits, sign-outs, refusals or bad requests", () => {
    for (const w of ["limit", "signed_out", "blocked", "too_long"]) expect(canRetrySame(new SubError(w))).toBe(false);
    for (const s of [400, 401, 402, 403]) expect(canRetrySame(new AiError(s, "x"))).toBe(false);
    expect(canRetrySame(new Error("x"))).toBe(false);
  });
});
