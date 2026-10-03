import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { openGoogleHint, sealGoogleHint } from "../lib/google-hint";

// Quiet Google sign-in again (AI Soul sealHint/openHint): the note opens only untouched and before it runs out.
beforeAll(() => { process.env.UNCHORE_SECRET_KEY ??= randomBytes(32).toString("base64"); });
describe("Google sign-in note", () => {
  it("opens what it sealed, cookie-safe", () => {
    const v = sealGoogleHint("a".repeat(64), "me@example.com", 1_000);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(openGoogleHint(v, 2_000)).toEqual({ sid: "a".repeat(64), email: "me@example.com", exp: 1_000 + 400 * 86400_000 });
  });
  it("reads a changed, broken, missing or run-out note as none", () => {
    const v = sealGoogleHint("b".repeat(64), "me@example.com", 1_000);
    const flipped = v.slice(0, -2) + (v.at(-2) === "A" ? "B" : "A") + v.at(-1);
    expect(openGoogleHint(flipped, 2_000)).toBeNull();
    expect(openGoogleHint("not-a-note", 2_000)).toBeNull();
    expect(openGoogleHint(undefined, 2_000)).toBeNull();
    expect(openGoogleHint(v, 1_000 + 401 * 86400_000)).toBeNull();
  });
});
