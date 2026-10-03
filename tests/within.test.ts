// Side jobs before an answer get a time limit (lib/within.ts — ported from AI Soul worker/answer.ts within).
import { describe, it, expect } from "vitest";
import { within } from "@/lib/within";

describe("within", () => {
  it("a job that never ends gives the fallback after the limit", async () => {
    const t0 = Date.now();
    expect(await within(new Promise<string | null>(() => {}), 50, null, "test")).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("a job that ends in time keeps its own value", async () => {
    expect(await within(Promise.resolve("done"), 1000, null, "test")).toBe("done");
  });
});
