// Think music: eight piano pieces in shuffled order, resumed where they stopped; chime when files can't load (synced from AI Soul).
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ThinkMusic } from "../components/think-music";

type Src = { buffer: { duration: number } | null; loop: boolean; started: number; stopped: number; when: number; off: number; onended: (() => void) | null; connect: () => void; start: (w?: number, o?: number) => void; stop: () => void };
function fakeCtx(decode: boolean) {
  const srcs: Src[] = []; let osc = 0;
  const gain = () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, connect(d: unknown) { return d; }, disconnect() {} });
  const ctx = {
    currentTime: 0, destination: {}, resume: () => Promise.resolve(), close: () => Promise.resolve(),
    createGain: gain,
    createOscillator: () => { osc++; return { type: "", frequency: { value: 0 }, connect(d: unknown) { return d; }, start() {}, stop() {} }; },
    createBufferSource: () => {
      const s: Src = { buffer: null, loop: true, started: 0, stopped: 0, when: -1, off: -1, onended: null, connect() {}, start(w = 0, o = 0) { s.started++; s.when = w; s.off = o; }, stop() { s.stopped++; } };
      srcs.push(s); return s;
    },
    // the piece number from the fetched URL becomes its length, so each piece can be told apart (01 → 81 s, 02 → 82 s …)
    ...(decode ? { decodeAudioData: (b: ArrayBuffer & { u?: string }, ok: (x: unknown) => void) => ok({ duration: 80 + Number(/(\d+)\.mp3$/.exec(b.u ?? "")?.[1] ?? 0) }) } : {}),
  };
  return { ctx, srcs, osc: () => osc };
}
const setWindow = (ctx: unknown) => vi.stubGlobal("window", { AudioContext: function () { return ctx; } });
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };
const okFetch = () => vi.fn(async (u: string, o?: { signal?: unknown }) => { void o; return { ok: true, arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { u }) }; });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("think music — several piano pieces played one after another", () => {
  it("plays one fetched piece without looping, fetches the next ahead, and stops", async () => {
    const f = fakeCtx(true); setWindow(f.ctx);
    const fetchFn = okFetch(); vi.stubGlobal("fetch", fetchFn);
    const m = new ThinkMusic(); m.unlock(); await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toMatch(/^\/sound\/piano\/0[1-8]\.mp3$/);
    expect(fetchFn.mock.calls[0]![1]).toEqual(expect.objectContaining({ signal: expect.anything() }));   // 8 s cap
    vi.useFakeTimers();
    m.start();
    expect(m.playing).toBe(true);
    expect(f.srcs).toHaveLength(1);
    expect(f.srcs[0]!.loop).toBe(false);
    expect(f.osc()).toBe(0);   // no chime
    expect(fetchFn).toHaveBeenCalledTimes(2);   // the next piece ahead
    expect(fetchFn.mock.calls[1]![0]).not.toBe(fetchFn.mock.calls[0]![0]);
    m.stop(); expect(m.playing).toBe(false);
    vi.advanceTimersByTime(500);
    expect(f.srcs[0]!.stopped).toBe(1);
  });
  it("after a piece ends another follows after a rest, and no piece repeats within eight", async () => {
    const f = fakeCtx(true); setWindow(f.ctx);
    vi.stubGlobal("fetch", okFetch());
    const m = new ThinkMusic(); m.unlock(); await flush();
    m.start(); await flush();
    const seen: number[] = [];
    for (let k = 0; k < 8; k++) {
      const s = f.srcs.at(-1)!;
      seen.push(s.buffer!.duration);
      f.ctx.currentTime += s.buffer!.duration + 2;
      s.onended!(); await flush();
    }
    expect(new Set(seen).size).toBe(8);
    expect(f.srcs.at(-1)!.when).toBe(f.ctx.currentTime + 1.5);   // 1.5 s rest between pieces
    expect(f.srcs.at(-1)!.off).toBe(0);
    expect(m.playing).toBe(true);
    m.stop();
  });
  it("restarting resumes where it stopped (near the end → next piece from the start)", async () => {
    const f = fakeCtx(true); setWindow(f.ctx);
    vi.stubGlobal("fetch", okFetch());
    const m = new ThinkMusic(); m.unlock(); await flush();
    m.start(); await flush();
    const first = f.srcs[0]!.buffer!.duration;
    f.ctx.currentTime = 30; m.stop();
    m.start();
    expect(f.srcs[1]!.buffer!.duration).toBe(first);
    expect(f.srcs[1]!.off).toBe(30);
    f.ctx.currentTime = first - 2; m.stop();   // 2 s before the end
    m.start();
    expect(f.srcs[2]!.buffer!.duration).not.toBe(first);
    expect(f.srcs[2]!.off).toBe(0);
    m.stop();
  });
  it("ignores a late ended event from a stopped piece", async () => {
    const f = fakeCtx(true); setWindow(f.ctx);
    vi.stubGlobal("fetch", okFetch());
    const m = new ThinkMusic(); m.unlock(); await flush();
    m.start(); await flush();
    const old = f.srcs[0]!; m.stop(); m.start();
    old.onended!();
    expect(f.srcs).toHaveLength(2);
    m.stop();
  });
  it("falls back to the chime when the file cannot be fetched", async () => {
    const f = fakeCtx(true); setWindow(f.ctx);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    vi.stubGlobal("setInterval", () => 1); vi.stubGlobal("clearInterval", () => {});
    const m = new ThinkMusic(); m.unlock(); await flush();
    m.start();
    expect(f.srcs).toHaveLength(0);
    expect(f.osc()).toBeGreaterThan(0);
    m.stop();
  });
  it("switches from the chime to the piano when the piece arrives", async () => {
    const f = fakeCtx(true); setWindow(f.ctx);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { await gate; return { ok: true, arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { u }) }; }));
    vi.stubGlobal("setInterval", () => 1); vi.stubGlobal("clearInterval", () => {});
    const m = new ThinkMusic(); m.unlock();
    m.start();
    expect(f.srcs).toHaveLength(0); expect(f.osc()).toBeGreaterThan(0);
    release(); await flush();
    expect(f.srcs).toHaveLength(1); expect(m.playing).toBe(true);
    m.stop();
  });
  it("does not fetch when the engine cannot decode", () => {
    const f = fakeCtx(false); setWindow(f.ctx);
    const fetchFn = vi.fn(); vi.stubGlobal("fetch", fetchFn);
    new ThinkMusic().unlock();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("all eight piano files exist, each over a minute and under 1 MB", () => {
    for (let i = 1; i <= 8; i++) {
      const b = readFileSync(path.join(__dirname, "..", "public", "sound", "piano", `${String(i).padStart(2, "0")}.mp3`));
      const id3 = b.toString("ascii", 0, 3) === "ID3";
      expect(id3 || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)).toBe(true);   // mp3 header
      expect(b.length).toBeLessThan(1_000_000);
      expect(b.length).toBeGreaterThan(60 * 64_000 / 8 * 0.9);   // over a minute at 64 kbps
    }
  });
});

describe("think music — turned down without stopping (AI Soul 31c841c)", () => {
  it("duck does nothing while silent, turns down and up while playing, and stop clears it", async () => {
    const f = fakeCtx(true); setWindow(f.ctx);
    vi.stubGlobal("fetch", okFetch());
    const m = new ThinkMusic(); m.unlock(); await flush();
    m.duck(true); expect(m.quiet).toBe(false);
    m.start(); m.duck(true);
    expect(m.playing).toBe(true); expect(m.quiet).toBe(true);
    expect(f.srcs).toHaveLength(1);   // the same piece keeps playing — nothing restarted
    m.duck(false); expect(m.quiet).toBe(false);
    m.duck(true); m.stop(); expect(m.quiet).toBe(false);
  });
});
