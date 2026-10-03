// Ported from AI Soul, 2026-09-30 sync batch 4: new-version notice rule and phone share text.
import { describe, expect, it } from "vitest";
import { versionAction } from "@/lib/new-version";
import { sharedText, SHARE_MAX } from "@/lib/share-in";

describe("new version notice", () => {
  const o = { base: "aaa1111", now: "bbb2222", hidden: false, voiceOpen: false, typing: false };
  it("does nothing when the version is the same or unknown", () => {
    expect(versionAction({ ...o, now: "aaa1111" })).toBe("none");
    expect(versionAction({ ...o, base: null })).toBe("none");
    expect(versionAction({ ...o, now: "dev" })).toBe("none");
  });
  it("reloads quietly only when hidden and not talking or typing", () => {
    expect(versionAction({ ...o, hidden: true })).toBe("reload");
    expect(versionAction({ ...o, hidden: true, voiceOpen: true })).toBe("banner");
    expect(versionAction({ ...o, hidden: true, typing: true })).toBe("banner");
    expect(versionAction(o)).toBe("banner");
  });
});

describe("phone share into a new chat", () => {
  it("joins title, text and link without repeats", () => {
    expect(sharedText({ title: "Deal", text: "50% off today", url: "https://x.test/a" })).toBe("Deal\n50% off today\nhttps://x.test/a");
    expect(sharedText({ title: "Deal", text: "Deal 50% off https://x.test/a", url: "https://x.test/a" })).toBe("Deal 50% off https://x.test/a");
    expect(sharedText({})).toBe("");
    expect(sharedText({ text: "x".repeat(SHARE_MAX + 50) }).length).toBe(SHARE_MAX);
  });
});
