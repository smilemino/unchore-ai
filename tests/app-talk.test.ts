// The app speaks first (lib/app-talk.ts · android/unchore-app InboxJob): fresh «your work is done» notices are read aloud,
// only when the phone isn't silent; anything older than 10 minutes or of another kind is only shown.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_TALK_FRESH_MS, talkSay } from "@/lib/app-talk";

describe("the line the phone reads", () => {
  it("reads a fresh finished answer without the quote marks", () => {
    expect(talkSay({ title: "Unchore", body: "Your answer is ready: «weather in Paris…»", tag: "unchore-answer-c1", ageMs: 5_000 }))
      .toBe("Your answer is ready: weather in Paris");
    expect(talkSay({ title: "Your app is ready", body: "Todo app built", tag: "build", ageMs: 0 })).toBe("Your app is ready. Todo app built");
    expect(talkSay({ title: "Unchore", body: "«Laptop» finished the work", tag: "unchore-computer-c2", ageMs: 1 })).toBe("Laptop finished the work");
  });
  it("10 minutes or older, or a clock that went backwards: shown only", () => {
    const n = { title: "Unchore", body: "Your answer is ready: «x»", tag: "unchore-answer-c1" };
    expect(talkSay({ ...n, ageMs: APP_TALK_FRESH_MS - 1 })).not.toBeNull();
    expect(talkSay({ ...n, ageMs: APP_TALK_FRESH_MS })).toBeNull();
    expect(talkSay({ ...n, ageMs: -1 })).toBeNull();
    expect(talkSay({ ...n, ageMs: Number.NaN })).toBeNull();
  });
  it("other notices (reminders, tests, untagged) are not read", () => {
    expect(talkSay({ title: "⏰ Bitcoin", body: "price", tag: "unchore-rem-1", ageMs: 0 })).toBeNull();
    expect(talkSay({ title: "Unchore", body: "Notifications are on", tag: "unchore-test", ageMs: 0 })).toBeNull();
    expect(talkSay({ title: "Unchore", body: "x", tag: null, ageMs: 0 })).toBeNull();
    expect(talkSay({ title: "Unchore", body: "x", tag: "rebuild", ageMs: 0 })).toBeNull();
  });
});

describe("the app reads only when the phone would ring", () => {
  const src = readFileSync("android/unchore-app/src/ai/unchore/app/InboxJob.java", "utf8");
  const may = src.slice(src.indexOf("private boolean mayTalk()"), src.indexOf("private void speak("));
  it("silent / vibrate, a call, muted notifications and do-not-disturb all keep it quiet", () => {
    expect(may).toContain("getRingerMode() != AudioManager.RINGER_MODE_NORMAL");
    expect(may).toContain("getMode() != AudioManager.MODE_NORMAL");
    expect(may).toContain("STREAM_NOTIFICATION) == 0");
    expect(may).toContain("INTERRUPTION_FILTER_ALL");
  });
  it("speaks only after showing, never while the app is on screen", () => {
    expect(src).toMatch(/if \(items != null && !appVisible\) for/);
    expect(src).toContain("if (!say.isEmpty() && mayTalk()) speak(say,");
  });
});
