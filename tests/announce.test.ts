import { describe, expect, it } from "vitest";
import { announceLine, announceOn, slowNoteOk } from "@/lib/voice/announce";

// A finished app build said aloud in voice mode: the first sentence only, never the link (AI Soul VoiceMode «띵» + one sentence).
describe("announce line", () => {
  it("speaks the first sentence without the link", () => {
    expect(announceLine("Your app is ready. Open it here: https://uc-abc.vercel.app\n\nIt saves to your phone.")).toBe("Your app is ready.");
    expect(announceLine("앱이 다 됐어요! 여기서 열어 보세요 https://uc-x.vercel.app")).toBe("앱이 다 됐어요!");
  });
  it("drops code and marks and keeps it short", () => {
    expect(announceLine("**Done** — `npm run dev`\n```js\nx()\n```")).toBe("Done — npm run dev");
    expect(announceLine("a".repeat(300)).length).toBe(140);
    expect(announceLine("https://only.link")).toBe("");
  });
  it("is on unless this device turned it off in Settings", () => {
    expect(announceOn(null)).toBe(true);
    expect(announceOn("1")).toBe(true);
    expect(announceOn("0")).toBe(false);
  });
  it("says «taking longer» only while the same question is still being answered and nobody is talking", () => {
    const base = { voice: true, busy: true, sameTurn: true, saying: false, holding: false, typed: "" };
    expect(slowNoteOk(base)).toBe(true);
    expect(slowNoteOk({ ...base, busy: false })).toBe(false);
    expect(slowNoteOk({ ...base, sameTurn: false })).toBe(false);
    expect(slowNoteOk({ ...base, saying: true })).toBe(false);
    expect(slowNoteOk({ ...base, holding: true })).toBe(false);
    expect(slowNoteOk({ ...base, typed: "and then" })).toBe(false);
  });
});

describe("a finished job's line waits for the pause (AI Soul 0b9715f)", () => {
  it("waits while talking, answering or holding «🎙»", async () => {
    const { announceWaits } = await import("../lib/voice/announce");
    expect(announceWaits({ saying: true, holding: false, busy: false })).toBe(true);
    expect(announceWaits({ saying: false, holding: true, busy: false })).toBe(true);
    expect(announceWaits({ saying: false, holding: false, busy: true })).toBe(true);
    expect(announceWaits({ saying: false, holding: false, busy: false })).toBe(false);
  });
});
