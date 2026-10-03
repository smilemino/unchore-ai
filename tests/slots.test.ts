import { afterEach, describe, expect, it, vi } from "vitest";
import { Slots } from "../worker/slots.mjs";
import { chat as codexChat } from "../worker/chatgpt.mjs";

afterEach(() => vi.useRealTimers());

describe("plan answer seats (worker/slots.mjs)", () => {
  it("a turn past the seats waits in line and gets the next free seat, first come first served", async () => {
    const s = new Slots(1, 10_000);
    const r1 = await s.take();
    expect(r1).toBeTypeOf("function");
    const order: string[] = [];
    const p2 = s.take().then((r) => { order.push("b"); return r; });
    const p3 = s.take().then((r) => { order.push("c"); return r; });
    expect(s.report()).toEqual({ running: 1, waiting: 2, max: 1 });
    r1!();
    const r2 = await p2;
    expect(order).toEqual(["b"]);
    r2!(); r2!();                                     // releasing twice frees only one seat
    (await p3)!();
    expect(order).toEqual(["b", "c"]);
    expect(s.report()).toEqual({ running: 0, waiting: 0, max: 1 });
  });

  it("says busy (null) only after the wait runs out, and leaves the line", async () => {
    vi.useFakeTimers();
    const s = new Slots(1, 30_000);
    await s.take();
    const late = s.take();
    vi.advanceTimersByTime(29_000);
    expect(s.report().waiting).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(await late).toBeNull();
    expect(s.report()).toEqual({ running: 1, waiting: 0, max: 1 });
  });

  it("a member who goes away stops waiting at once", async () => {
    const s = new Slots(1, 30_000);
    await s.take();
    const ac = new AbortController();
    const p = s.take(ac.signal);
    ac.abort();
    expect(await p).toBeNull();
    expect(s.report().waiting).toBe(0);
  });

  it("side calls have their own seats: a title never holds an answer in line", async () => {
    const seats = { answer: new Slots(1, 0), side: new Slots(1, 0) };
    const held = await seats.side.take();             // a side call is running
    expect(held).toBeTypeOf("function");
    expect(seats.answer.report().running).toBe(0);    // the answer seat is still free
    // signed-out member: refused before any seat is taken, so nothing leaks
    const r = await codexChat("0f8fad5b-d9cb-469f-a165-70867728950e", { side: true }, () => {}, undefined, undefined, seats);
    expect(r).toEqual({ ok: false, why: "signed_out" });
    expect(seats.side.report()).toEqual({ running: 1, waiting: 0, max: 1 });
  });
});

describe("app side calls ask the worker for a side seat (lib/ai.ts completeSide)", () => {
  it("a title/memory call on a plan sends side: true; a member's answer does not", async () => {
    vi.stubEnv("BROWSER_WORKER_URL", "http://worker.test");
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response("ok");
    }));
    const { completeSide, complete } = await import("../lib/ai");
    const keys = { claude_sub: "0f8fad5b-d9cb-469f-a165-70867728950e" };
    await completeSide(keys, { model: "sub:haiku", system: "s", messages: [{ role: "user", content: "hi" }] });
    await complete({ model: "sub:sonnet", key: keys.claude_sub, system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(bodies[0]).toMatchObject({ side: true, model: "haiku" });
    expect(bodies[1]).not.toHaveProperty("side");
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });
});
