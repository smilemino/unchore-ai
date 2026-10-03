import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { DRAIN_MAX_MS, drainDone, makeDrain } from "../worker/drain.mjs";

// A deploy used to cut every answer and app build running on the old worker; now it finishes them first.
describe("worker drain on deploy", () => {
  it("leaves when nothing runs, or once held past the limit", () => {
    expect(drainDone(0, 0, 1)).toBe(true);
    expect(drainDone(2, 0, DRAIN_MAX_MS)).toBe(false);
    expect(drainDone(2, 0, DRAIN_MAX_MS + 1)).toBe(true);
  });
  it("waits for running requests, then exits once", () => {
    const t = 1000;
    const exits: number[] = [];
    const d = makeDrain({ exit: (c: number) => exits.push(c), now: () => t, everyMs: 60_000 });
    const a = new EventEmitter(), b = new EventEmitter();
    d.track(a); d.track(b);
    expect(d.draining).toBe(false);
    d.start();
    expect(d.draining).toBe(true);
    a.emit("close");
    expect(exits).toEqual([]);
    b.emit("close");
    expect(exits).toEqual([0]);
    d.start();
    expect(exits).toEqual([0]);
  });
  it("exits at once when idle", () => {
    const exits: number[] = [];
    makeDrain({ exit: (c: number) => exits.push(c) }).start();
    expect(exits).toEqual([0]);
  });
  it("gives up waiting after the limit", async () => {
    let t = 1;
    const exits: number[] = [];
    const d = makeDrain({ exit: (c: number) => exits.push(c), now: () => t, maxMs: 100, everyMs: 5 });
    d.track(new EventEmitter());
    d.start();
    t = 200;
    await new Promise((r) => setTimeout(r, 30));
    expect(exits).toEqual([0]);
  });
});
