import { describe, expect, it } from "vitest";
import { MIC_FATAL, joinSpoken, micTrouble } from "../lib/voice/dictation";

describe("manual dictation keeps the draft", () => {
  it("uses the original draft for each transcript revision", () => {
    const draft = "First, review the report.";
    expect(joinSpoken(draft, "Then")).toBe("First, review the report. Then");
    expect(joinSpoken(draft, "Then send it.")).toBe("First, review the report. Then send it.");
  });
  it("preserves the draft exactly when nothing was heard", () => {
    expect(joinSpoken("  Keep my spacing.\n", "")).toBe("  Keep my spacing.\n");
  });
  it("preserves existing separators and adds just one when needed", () => {
    expect(joinSpoken("A\n", "B")).toBe("A\nB");
    expect(joinSpoken("A  ", "B")).toBe("A  B");
    expect(joinSpoken("A", "B")).toBe("A B");
  });
  it("does not deduplicate words intentionally repeated after typed text", () => {
    expect(joinSpoken("yes", "yes please")).toBe("yes yes please");
  });
  it("starts normally on an empty composer, as voice mode already does", () => {
    expect(joinSpoken("", "Hello")).toBe("Hello");
    expect(joinSpoken(" \n", "Hello")).toBe("Hello");
  });
});

describe("microphone trouble is explained, not silent (AI Soul speech.ts FATAL·no-speech)", () => {
  it("names each browser error", () => {
    expect(micTrouble("not-allowed", "")).toBe("denied");
    expect(micTrouble("service-not-allowed", "")).toBe("blocked");
    expect(micTrouble("not-supported", "")).toBe("blocked");
    expect(micTrouble("audio-capture", "")).toBe("no-mic");
    expect(micTrouble("network", "")).toBe("offline");
    expect(micTrouble("language-not-supported", "")).toBe("no-lang");
    expect(micTrouble("start-failed", "")).toBe("failed");
    expect(micTrouble("stuck", "")).toBe("failed");
  });
  it("silence is told; heard words or the member's own stop are not", () => {
    expect(micTrouble(undefined, "  ")).toBe("silent");
    expect(micTrouble(undefined, "hello")).toBeNull();
    expect(micTrouble("aborted", "")).toBeNull();
  });
  it("hides 🎤 only when pressing it again can't help", () => {
    for (const w of ["denied", "blocked", "no-mic", "no-lang"] as const) expect(MIC_FATAL.has(w)).toBe(true);
    for (const w of ["offline", "failed", "silent"] as const) expect(MIC_FATAL.has(w)).toBe(false);
  });
});
