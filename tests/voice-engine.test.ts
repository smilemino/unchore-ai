// Voice mode shows which voice reads right now (natural Google voice or the device's own) and keeps a diagnostic line per
// piece on this device only — which voice, time to first sound (AI Soul 10/1 «is that really the natural voice?»).
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOG_KEY, Speaker, readVoiceLog, voiceLog } from "@/components/voice-out";

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
function fakeCtx() {
  return {
    state: "running", currentTime: 0, destination: {},
    resume: () => Promise.resolve(),
    createBuffer: (_c: number, n: number, rate: number) => ({ duration: n / rate, copyToChannel: () => {} }),
    createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {}, stop: () => {} }),
  };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("voice-out: which voice is reading", () => {
  it("keeps only the last 50 lines, on this device", () => {
    vi.stubGlobal("localStorage", store());
    for (let i = 0; i < 60; i++) voiceLog({ g: true, ms: i, why: "", n: 3 });
    const all = readVoiceLog();
    expect(all).toHaveLength(50);
    expect(all[0]!.ms).toBe(10);
    localStorage.setItem(LOG_KEY, "not json");
    expect(readVoiceLog()).toEqual([]);
  });

  it("phone voice: tells the screen «phone», logs each piece with the reason, clears when stopped", () => {
    vi.stubGlobal("localStorage", store());
    const synth = { speaking: false, pending: false, cancel: () => {}, resume: () => {}, getVoices: () => [], speak: () => {} };
    vi.stubGlobal("window", { speechSynthesis: synth });
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
    const sp = new Speaker("", "en", false);
    const seen: string[] = [];
    sp.onEngine = (e) => seen.push(e);
    sp.say("Hello there.");
    expect(seen).toEqual(["phone"]);
    expect(readVoiceLog().map((l) => [l.g, l.why])).toEqual([[false, "chosen"]]);
    sp.stop();
    expect(seen.at(-1)).toBe("");
  });

  it("Google voice: «google» on screen and the time to first sound in the line", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", store());
    vi.stubGlobal("fetch", () => new Promise((ok) => setTimeout(() => ok({ ok: true, status: 200, body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(480)); c.close(); } }) }), 1500)));
    const sp = new Speaker("v", "en", true);
    (sp as unknown as { ctx: unknown }).ctx = fakeCtx();
    const seen: string[] = [];
    sp.onEngine = (e) => seen.push(e);
    let done = false;
    sp.say("Hello there.", () => { done = true; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(done).toBe(true);
    expect(seen).toEqual(["google", ""]);
    const [line] = readVoiceLog();
    expect(line!.g).toBe(true);
    expect(line!.ms).toBeGreaterThanOrEqual(1500);
  });
});
