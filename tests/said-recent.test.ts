import { describe, expect, it } from "vitest";
import { askedTimedRecent, saidRecently, SAID_WINDOW_MS } from "../lib/reminders";

const NOW = Date.parse("2026-10-03T00:30:00Z");

describe("earlier messages lend time words only within 12 hours", () => {
  it("keeps a message from an hour ago", () => {
    expect(saidRecently(new Date(NOW - 3600_000).toISOString(), NOW)).toBe(true);
  });
  it("drops a message from two days ago", () => {
    expect(saidRecently(new Date(NOW - 2 * 86400_000), NOW)).toBe(false);
  });
  it("the edge is 12 hours", () => {
    expect(saidRecently(new Date(NOW - SAID_WINDOW_MS), NOW)).toBe(true);
    expect(saidRecently(new Date(NOW - SAID_WINDOW_MS - 1000), NOW)).toBe(false);
  });
  it("a message with no time keeps working as before", () => {
    expect(saidRecently(undefined, NOW)).toBe(true);
    expect(saidRecently("not a date", NOW)).toBe(true);
  });
  it("an old «매일 8시에 알려 줘» no longer turns today's «그거 켜 줘» into a reminder", () => {
    const rows = [{ content: "매일 아침 8시에 알려 주면 좋겠어요", at: new Date(NOW - 3 * 86400_000) }];
    const said = [...rows.filter((m) => saidRecently(m.at, NOW)).map((m) => m.content), "그거 지금 켜 주세요"];
    expect(askedTimedRecent(said)).toBe(false);
    const fresh = [...rows.map((m) => m.content), "그거 지금 켜 주세요"];
    expect(askedTimedRecent(fresh)).toBe(true);
  });
});
