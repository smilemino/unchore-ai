import { afterEach, describe, expect, it, vi } from "vitest";
import { Awake } from "../components/awake";

// Voice mode keeps the screen on (AI Soul voice-client Awake): asks once, asks again when the tab comes back, lets go on off.
function fake() {
  const handlers: Array<() => void> = [];
  const released: number[] = [];
  let asked = 0;
  const doc = { visibilityState: "visible", addEventListener: (_: string, f: () => void) => handlers.push(f), removeEventListener: (_: string, f: () => void) => { const i = handlers.indexOf(f); if (i >= 0) handlers.splice(i, 1); } };
  const nav = { wakeLock: { request: async () => { const n = ++asked; return { release: async () => { released.push(n); } }; } } };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", nav);
  return { handlers, released, asked: () => asked, doc };
}
afterEach(() => vi.unstubAllGlobals());

describe("keep the screen on in voice mode", () => {
  it("asks for the lock on, asks again when the tab is shown again, and lets go on off", async () => {
    const f = fake(); const a = new Awake();
    await a.on();
    expect(f.asked()).toBe(1);
    f.handlers.forEach((h) => h());
    await new Promise((r) => setTimeout(r, 0));
    expect(f.asked()).toBe(2);
    a.off();
    await new Promise((r) => setTimeout(r, 0));
    expect(f.released).toContain(2);
    expect(f.handlers).toHaveLength(0);
  });
  it("a second «on» while already on doesn't ask twice", async () => {
    const f = fake(); const a = new Awake();
    await a.on(); await a.on();
    expect(f.asked()).toBe(1);
    a.off();
  });
  it("does nothing on a device without a wake lock", async () => {
    vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal("navigator", {});
    const a = new Awake();
    await expect(a.on()).resolves.toBeUndefined();
    a.off();
  });
});
