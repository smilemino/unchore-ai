import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HF_GUIDE, HF_SETUP_GUIDE, KEY_NAME, MAX_USD, hfBody, perSecondFrom, readHfAsks } from "../lib/hf-ask";
import { hideMarks } from "../lib/chat-setup";

// Images/videos on the member's own Higgsfield account (owner 2026-10-02).
// Higgsfield's real price sentence for Seedance 2.5 text-to-video, read 2026-10-02.
const DESC = "For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p. Billable video tokens = ceil(output height × output width × (input video duration + generated video duration) × 24 / 1024).";

describe("Higgsfield cards", () => {
  it("reads one card per line, fills the cheap defaults, skips broken ones", () => {
    const a = readHfAsks('Here it is.\n<<<hf {"kind":"video","prompt":"a dragon over a city"}>>>\n<<<hf {"kind":"image","prompt":"a swordsman","aspect":"9:16"}>>>\n<<<hf {"kind":"video","prompt":"x","res":"4K"}>>>');
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual({ kind: "video", prompt: "a dragon over a city", res: "480p", seconds: 5, aspect: "16:9" });
    expect(hfBody(a[0]!)).toEqual({ prompt: "a dragon over a city", resolution: "480p", duration: 5, aspect_ratio: "16:9" });
    expect(hfBody(a[1]!)).toEqual({ prompt: "a swordsman", aspect_ratio: "9:16" });
  });
  it("never lets a card ask for more than 15 seconds", () => {
    expect(readHfAsks('<<<hf {"kind":"video","prompt":"long one","seconds":60}>>>')).toEqual([]);
  });
  it("reads the per-second price from the price sentence only (not the token rates in the next one)", () => {
    expect(perSecondFrom(DESC)).toEqual({ "480p": 0.2056, "720p": 0.4622, "1080p": 1.1372 });
    expect(perSecondFrom("Token-metered pricing. Each 1,000 video tokens cost $0.0214 at 480p or 720p.")).toEqual({});   // no per-second sentence → unknown → not made
    expect(15 * perSecondFrom(DESC)["1080p"]!).toBeLessThan(MAX_USD);   // the biggest card allowed still fits under the cap
  });
  it("hides the card line from the answer text", () => {
    expect(hideMarks('Done.\n<<<hf {"kind":"image","prompt":"cat"}>>>')).toBe("Done.");
  });
  it("tells the AI the cheap order and how to connect, with the secret box", () => {
    expect(HF_GUIDE).toMatch(/480p test/);
    expect(HF_SETUP_GUIDE).toContain(`<<<secret name=${KEY_NAME}>>>`);
    expect(HF_SETUP_GUIDE).toMatch(/console\.higgsfield\.ai/);
  });
  it("the chat screen reads cards without server code", () => {
    expect(readFileSync("components/Chat.tsx", "utf8")).toMatch(/from "@\/lib\/hf-ask"/);
    expect(readFileSync("lib/hf-ask.ts", "utf8")).not.toMatch(/from "\.\/(db|vault|push)"/);
  });
});
