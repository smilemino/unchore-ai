import { describe, expect, it } from "vitest";
import { MERGE_MS, whileThinking } from "@/lib/voice/think-listen";

describe("voice mode listens while thinking", () => {
  it("words added soon after sending join that request", () => {
    expect(whileThinking(1000, 1000 + 3000)).toBe("merge");
    expect(whileThinking(1000, 1000 + MERGE_MS)).toBe("merge");
  });
  it("later words wait for this answer", () => {
    expect(whileThinking(1000, 1000 + MERGE_MS + 1)).toBe("queue");
    expect(whileThinking(0, 5000)).toBe("queue");
  });
});
