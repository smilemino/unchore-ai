// Batch 14 → 15 (2026-09-30 sync): unread answers per chat, kept on the server so every device agrees.
import { describe, expect, it } from "vitest";
import { seenToSend, unreadOf } from "@/lib/read-marks";

describe("unread answers", () => {
  it("new answers since last seen; the open chat shows none", () => {
    expect(unreadOf({ id: "a", ai_count: 7, seen_ai: 5 })).toBe(2);
    expect(unreadOf({ id: "a", ai_count: 7, seen_ai: 5 }, "a")).toBe(0);
    expect(unreadOf({ id: "a", ai_count: 3, seen_ai: 9 })).toBe(0);
    expect(unreadOf({ id: "a", ai_count: 3 })).toBe(0);   // an old server without the count shows nothing
  });
  it("the chat on screen sends its count once, only when it moved", () => {
    expect(seenToSend([{ id: "a", ai_count: 4, seen_ai: 2 }, { id: "b", ai_count: 9, seen_ai: 1 }], "a")).toEqual({ id: "a", seen: 4 });
    expect(seenToSend([{ id: "a", ai_count: 4, seen_ai: 4 }], "a")).toBeNull();
    expect(seenToSend([{ id: "a", ai_count: 4, seen_ai: 1 }], null)).toBeNull();
  });
});
