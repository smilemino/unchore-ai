import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FIRST_OUTPUT_MS, TOTAL_MS, answerClock } from "@/lib/answer-clock";
import { canFallBack, AiError } from "@/lib/ai";

describe("answer clock (AI Soul worker/answer.ts first-output and total limits)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("cuts an AI that shows no sign of life in time", () => {
    const c = answerClock({ parent: new AbortController().signal, firstMs: 1000, endAt: Date.now() + 10_000 });
    vi.advanceTimersByTime(999);
    expect(c.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(c.signal.aborted).toBe(true);
    expect(c.cut()).toBe("first");
  });

  it("a first word stops the first-word timer, the whole-answer limit still holds", () => {
    const c = answerClock({ parent: new AbortController().signal, firstMs: 1000, endAt: Date.now() + 5000 });
    vi.advanceTimersByTime(500); c.alive();
    vi.advanceTimersByTime(4000);
    expect(c.signal.aborted).toBe(false);
    vi.advanceTimersByTime(500);
    expect(c.cut()).toBe("total");
  });

  it("■ Stop is not a time cut, and end() leaves the call alone", () => {
    const stop = new AbortController();
    const c = answerClock({ parent: stop.signal, firstMs: 1000, endAt: Date.now() + 5000 });
    stop.abort();
    expect(c.signal.aborted).toBe(true);
    vi.advanceTimersByTime(6000);
    expect(c.cut()).toBeNull();
    const d = answerClock({ parent: new AbortController().signal, firstMs: 1000, endAt: Date.now() + 5000 });
    d.end(); vi.advanceTimersByTime(6000);
    expect(d.signal.aborted).toBe(false);
  });

  it("a deadline already past cuts at once", () => {
    const c = answerClock({ parent: new AbortController().signal, firstMs: 1000, endAt: Date.now() - 1 });
    vi.advanceTimersByTime(0);
    expect(c.cut()).toBe("total");
  });

  it("limits fit the chat route, and a missing first word moves to the member's next AI", () => {
    const route = readFileSync("app/api/chat/route.ts", "utf8");
    const max = Number(/maxDuration = (\d+)/.exec(route)![1]) * 1000;
    expect(TOTAL_MS).toBeLessThan(max - 20_000);
    expect(FIRST_OUTPUT_MS).toBeLessThan(TOTAL_MS);
    expect(canFallBack(new AiError(504, "no first output in time"))).toBe(true);
    const turn = readFileSync("lib/turn.ts", "utf8");
    expect(turn).toContain("signal: clock.signal");
    expect(turn).toContain('cut === "first" ? new AiError(504');
  });
});
