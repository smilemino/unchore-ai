import { describe, expect, it } from "vitest";
import { splitForTelegram } from "@/lib/telegram";

describe("splitForTelegram", () => {
  it("keeps a short answer whole", () => { expect(splitForTelegram("hi")).toEqual(["hi"]); });
  it("cuts long answers at a line break, every part under the limit", () => {
    const parts = splitForTelegram(Array.from({ length: 300 }, (_, i) => `line ${i} ${"x".repeat(40)}`).join("\n"), 4000);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(4000);
  });
  it("never sends more than 4 parts", () => { expect(splitForTelegram("y".repeat(50_000), 4000)).toHaveLength(4); });
});
