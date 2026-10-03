import { describe, expect, it } from "vitest";
import { strongFrom } from "../lib/jev";

describe("auto-pick step up (AI Soul bfd51cd)", () => {
  it("typed chat: unsure fast → strong", () => {
    expect(strongFrom({ choice: "fast", confidence: 0.4 }, false)).toBe(true);
  });
  it("voice mode: unsure fast stays fast", () => {
    expect(strongFrom({ choice: "fast", confidence: 0.4 }, true)).toBe(false);
  });
  it("strong is strong either way", () => {
    expect(strongFrom({ choice: "strong", confidence: 0.3 }, true)).toBe(true);
    expect(strongFrom({ choice: "strong", confidence: 0.9 }, false)).toBe(true);
  });
  it("sure fast is fast either way", () => {
    expect(strongFrom({ choice: "fast", confidence: 0.9 }, false)).toBe(false);
    expect(strongFrom({ choice: "fast", confidence: null }, true)).toBe(false);
  });
});
