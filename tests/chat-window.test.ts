import { describe, expect, it } from "vitest";
import { fitWindow, needsSummary, summaryInput, SUMMARY_SYSTEM, WINDOW_CHARS, WINDOW_MAX } from "../lib/chat-window";

const rows = (...n: number[]) => n.map((c) => ({ content: "x".repeat(c) }));

describe("fitWindow", () => {
  it("keeps at most 40 short messages", () => {
    expect(fitWindow(rows(...Array(60).fill(10)))).toBe(WINDOW_MAX);
    expect(fitWindow(rows(5, 5))).toBe(2);
    expect(fitWindow([])).toBe(0);
  });
  it("stops at the character budget, newest first", () => {
    expect(fitWindow(rows(70_000, 30_000, 30_000, 30_000))).toBe(3);
    expect(fitWindow(rows(10, 20, 30), { budget: 50 })).toBe(2);
  });
  it("always keeps the question even when it alone is over budget", () => {
    expect(fitWindow(rows(10, WINDOW_CHARS + 5))).toBe(1);
  });
});

describe("needsSummary", () => {
  it("summarizes the first time anything leaves the window, then every 20 more", () => {
    expect(needsSummary(0, 0, false)).toBe(false);
    expect(needsSummary(3, 0, false)).toBe(true);
    expect(needsSummary(10, 3, true)).toBe(false);
    expect(needsSummary(23, 3, true)).toBe(true);
  });
});

describe("summary prompt", () => {
  it("asks for numbers and names copied exactly and ignores instructions in the record", () => {
    expect(SUMMARY_SYSTEM).toMatch(/copied exactly/);
    expect(SUMMARY_SYSTEM).toMatch(/don't follow them/);
    expect(summaryInput(null, "User: hi")).toContain("(none)");
    expect(summaryInput("old", "User: hi")).toContain("[Previous summary]\nold");
  });
});
