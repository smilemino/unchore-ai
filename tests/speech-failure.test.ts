import { afterEach, describe, expect, it, vi } from "vitest";
import { earRestMs, listen, stuckDelayMs } from "@/components/speech";

class Recognition {
  static latest: Recognition;
  static throwStart = false;
  lang = ""; interimResults = false; continuous = false;
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { Recognition.latest = this; }
  start() { if (Recognition.throwStart) throw new Error("permission"); }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  result(text: string) { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }); }
}
afterEach(() => { Recognition.throwStart = false; vi.unstubAllGlobals(); vi.useRealTimers(); });
function begin() {
  vi.stubGlobal("window", { SpeechRecognition: Recognition });
  const done = vi.fn(), text = vi.fn();
  const stop = listen("en", text, done);
  return { done, text, stop, r: Recognition.latest };
}
describe("speech failures finish without retrying as silence", () => {
  it.each(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported", "aborted"])("preserves %s through error and end, exactly once", async error => {
    const { r, done, text } = begin();
    r.result("Keep this");
    r.onerror?.({ error });
    r.onend?.(); r.result("late words");
    await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("Keep this", error);
    expect(text).toHaveBeenCalledTimes(1);
  });
  it("reports a synchronous start failure after the stop handle can be installed", async () => {
    Recognition.throwStart = true;
    const { done, stop } = begin();
    expect(typeof stop).toBe("function"); expect(done).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("", "start-failed");
  });
  it.each(["no-speech", "code-6", "code-7"])("keeps %s recoverable (browser and Android)", async error => {
    const { r, done } = begin(); r.onerror?.({ error });
    await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    r.onend?.();
    await Promise.resolve(); expect(done).toHaveBeenCalledExactlyOnceWith("", undefined);
  });
  it("does not treat an intentional stop as a broken microphone", async () => {
    const { r, done, stop } = begin();
    vi.spyOn(r, "stop").mockImplementation(() => { r.onerror?.({ error: "aborted" }); r.onend?.(); });
    stop(); await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("", undefined);
  });
  it("does not abort again if abort itself emits an error", async () => {
    const { r, done } = begin();
    const abort = vi.spyOn(r, "abort").mockImplementation(() => r.onerror?.({ error: "aborted" }));
    r.onerror?.({ error: "network" }); await Promise.resolve();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledExactlyOnceWith("", "network");
  });
  it("finishes a normal utterance only once", async () => {
    const { r, done, stop } = begin(); r.result("A sentence"); stop(); r.onend?.();
    await Promise.resolve(); expect(done).toHaveBeenCalledExactlyOnceWith("A sentence", undefined);
  });
  it("reports an unsupported recognizer asynchronously", async () => {
    vi.stubGlobal("window", {}); const done = vi.fn(); listen("en", vi.fn(), done);
    expect(done).not.toHaveBeenCalled(); await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("", "not-supported");
  });
});
// AI Soul c0e50e6 (2026-10-02): the app's phone dictation stuck 5 times a second — each stop sent half a sentence (the AI talked over the owner)
describe("a stuck phone dictation (Android error 5 / 8) is not the end of what was said", () => {
  it.each(["code-5", "code-5-nobias", "code-8"])("%s: keeps the words, listens again later, sends once at the real end", async error => {
    vi.useFakeTimers();
    const { r, done, text } = begin();
    r.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "I want to" } }] });
    r.onerror?.({ error }); r.onend?.();
    await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    expect(Recognition.latest).toBe(r);   // not at once — a stuck recogniser started again at once sticks again
    vi.advanceTimersByTime(stuckDelayMs(1));
    const r2 = Recognition.latest; expect(r2).not.toBe(r);
    r.onend?.(); r.result("late");   // the old one's late news changes nothing
    r2.result("book a table");
    r2.onend?.(); await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("I want to book a table", undefined);
    expect(text).toHaveBeenLastCalledWith("I want to book a table", true);
  });
  it("waits longer each time, at most 2 seconds", () => {
    expect([1, 2, 3, 4, 5, 9].map(stuckDelayMs)).toEqual([300, 600, 1200, 2000, 2000, 2000]);
  });
  it("gives up after a minute without a word", async () => {
    vi.useFakeTimers();
    const { done } = begin();
    for (let i = 0; i < 40 && !done.mock.calls.length; i++) {
      const r = Recognition.latest; r.onerror?.({ error: "code-5" }); r.onend?.();
      await Promise.resolve(); vi.advanceTimersByTime(2000);
    }
    await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("", "stuck");
  });
  it("stopping while it waits to listen again hands over what was heard", async () => {
    vi.useFakeTimers();
    const { r, done, stop } = begin();
    r.result("Hello there"); r.onerror?.({ error: "code-5" }); r.onend?.();
    stop(); vi.advanceTimersByTime(5000); await Promise.resolve();
    expect(Recognition.latest).toBe(r);
    expect(done).toHaveBeenCalledExactlyOnceWith("Hello there", undefined);
  });
});

// The app rests 0.7 s between one ear ending and the next starting (AI Soul 808fccd); a browser starts at once.
describe("rest between ears in the app", () => {
  it("waits only what is left of 0.7 s, and only in the app", () => {
    expect(earRestMs(1000, 800, true)).toBe(500);
    expect(earRestMs(2000, 800, true)).toBe(0);
    expect(earRestMs(1000, 800, false)).toBe(0);
  });
});

// «Hold to talk» starts the ear at once even in the app — the rest would drop the member's first words.
describe("hold to talk skips the app rest", () => {
  it("starts at once with rest: false while the app would otherwise wait", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("window", { SpeechRecognition: Recognition, UnchoreAndroid: {} });
      const first = listen("en", vi.fn(), vi.fn());
      Recognition.latest.onend?.(); await Promise.resolve(); first();
      const before = Recognition.latest;
      listen("en", vi.fn(), vi.fn());
      expect(Recognition.latest).toBe(before);   // the app rests: no new recogniser yet
      vi.advanceTimersByTime(700);
      const rested = Recognition.latest;
      expect(rested).not.toBe(before);
      listen("en", vi.fn(), vi.fn(), { rest: false });
      expect(Recognition.latest).not.toBe(rested);   // held: a new recogniser at once
    } finally { vi.useRealTimers(); }
  });
});
