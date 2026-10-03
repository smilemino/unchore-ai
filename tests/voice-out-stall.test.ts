// Voice mode must not freeze when the phone was away (AI Soul 9/30 «after the maps app it didn't hear me»):
// Google's audio that stops coming mid-answer is played up to where it stopped, and the phone's voice that went quiet
// without saying it ended counts as stuck.
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALL_SOUND_MS, Speaker } from "@/components/voice-out";

function fakeCtx() {
  return {
    state: "running", currentTime: 0, destination: {},
    resume: () => Promise.resolve(),
    createBuffer: (_c: number, n: number, rate: number) => ({ duration: n / rate, copyToChannel: () => {} }),
    createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {}, stop: () => {} }),
  };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("voice-out: no freeze after the phone was away", () => {
  it("plays what arrived when the audio stops coming mid-answer", async () => {
    vi.useFakeTimers();
    const sp = new Speaker("v", "ko", true);
    (sp as unknown as { ctx: unknown }).ctx = fakeCtx();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new Uint8Array(4800)); },   // 0.1 s of sound, then nothing — the connection dropped
      cancel() { cancelled = true; },
    });
    let ok: boolean | null = null;
    void (sp as unknown as { playBody: (b: ReadableStream<Uint8Array>, my: number) => Promise<boolean> }).playBody(body, 0).then((v) => { ok = v; });
    await vi.advanceTimersByTimeAsync(STALL_SOUND_MS - 100);
    expect(ok).toBeNull();                 // still waiting for more audio
    await vi.advanceTimersByTimeAsync(1000);
    expect(ok).toBe(true);                 // gave up on the rest and finished — voice mode can listen again
    expect(cancelled).toBe(true);
  });

  it("the phone's voice that went quiet is stuck; a new answer or stop clears it", () => {
    const synth = { speaking: false, pending: false };
    vi.stubGlobal("window", { speechSynthesis: synth });
    const sp = new Speaker("", "ko", false);
    expect(sp.stuck()).toBe(false);        // not reading at all
    (sp as unknown as { mode: string }).mode = "phone";
    synth.speaking = true;
    expect(sp.stuck()).toBe(false);        // really reading
    synth.speaking = false;
    expect(sp.stuck()).toBe(true);         // said nothing more and never ended
    (sp as unknown as { mode: string }).mode = "";
    expect(sp.stuck()).toBe(false);
  });
});

describe("voice-out: «🔇 Sound off» (AI Soul voice-mute)", () => {
  it("a muted speaker reads nothing and still says it's done, so voice mode listens again", async () => {
    let spoke = false;
    vi.stubGlobal("window", { speechSynthesis: { speaking: false, pending: false, cancel: () => {}, speak: () => { spoke = true; } } });
    const sp = new Speaker("", "ko", false);
    sp.muted = true;
    let done = 0;
    sp.say("안녕하세요. 오늘은 맑아요.", () => { done++; });
    await new Promise((r) => setTimeout(r, 5));
    expect(done).toBe(1);
    expect(spoke).toBe(false);
  });
});
