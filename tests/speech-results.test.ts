import { afterEach, describe, expect, it, vi } from "vitest";
import { listen } from "@/components/speech";

type Result = { isFinal: boolean; 0: { transcript: string } };
const result = (text: string, isFinal = true): Result => ({ isFinal, 0: { transcript: text } });
class Recognition {
  static latest: Recognition;
  onresult: ((e: { resultIndex: number; results: Result[] }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { Recognition.latest = this; }
  start() {}
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  emit(results: Result[], resultIndex = 0) { this.onresult?.({ resultIndex, results }); }
}
afterEach(() => vi.unstubAllGlobals());
function begin() {
  vi.stubGlobal("window", { SpeechRecognition: Recognition });
  const text = vi.fn(), done = vi.fn();
  listen("en", text, done);
  return { r: Recognition.latest, text, done };
}

describe("dictation rebuilds each result snapshot (Synced from AI Soul readSpoken)", () => {
  it("does not append two final results again when resultIndex repeats", async () => {
    const { r, text, done } = begin();
    const results = [result("First sentence."), result("Second sentence.")];
    r.emit(results); r.emit(results); r.emit(results);
    expect(text).toHaveBeenLastCalledWith("First sentence. Second sentence.", true);
    r.onend?.(); await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("First sentence. Second sentence.", undefined);
  });
  it("retains earlier finals when only a later result changes", async () => {
    const { r, text, done } = begin();
    r.emit([result("First sentence."), result("Second", false)]);
    r.emit([result("First sentence."), result("Second sentence.")], 1);
    expect(text).toHaveBeenLastCalledWith("First sentence. Second sentence.", true);
    r.onend?.(); await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("First sentence. Second sentence.", undefined);
  });
  it("keeps all interim slots and replaces them with the final version", async () => {
    const { r, text, done } = begin();
    r.emit([result("First."), result("Keep", false), result("both words", false)]);
    expect(text).toHaveBeenLastCalledWith("First. Keep both words", false);
    r.emit([result("First."), result("Keep both words.")], 1);
    r.onend?.(); await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("First. Keep both words.", undefined);
  });
  it("drops withdrawn interim words without touching the final text", () => {
    const { r, text } = begin();
    r.emit([result("First."), result("unconfirmed", false)]);
    r.emit([result("First.")], 1);
    expect(text).toHaveBeenLastCalledWith("First.", true);
  });
  it("replaces the app's single cumulative slot, including corrections", async () => {
    const { r, text, done } = begin();
    r.emit([result("Send the red file", false)]);
    r.emit([result("Send the red file")]);
    r.emit([result("Send the blue file")]);
    expect(text).toHaveBeenLastCalledWith("Send the blue file", true);
    r.onend?.(); await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("Send the blue file", undefined);
  });
  it("keeps existing cumulative-slot deduplication and ignores late events", async () => {
    const { r, text, done } = begin();
    r.emit([result("Please"), result("Please keep this sentence.")]);
    r.onend?.(); r.emit([result("late")]); await Promise.resolve();
    expect(text).toHaveBeenCalledExactlyOnceWith("Please keep this sentence.", true);
    expect(done).toHaveBeenCalledExactlyOnceWith("Please keep this sentence.", undefined);
  });
});
