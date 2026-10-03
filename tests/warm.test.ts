import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WarmPool, freeBytes } from "../worker/warm.mjs";

// A pretend program: alive until its input closes.
function fakeChild() {
  const c = new EventEmitter() as EventEmitter & { exitCode: number | null; signalCode: string | null; stdin: { end: () => void }; kill: () => void };
  c.exitCode = null; c.signalCode = null;
  const end = () => { if (c.exitCode === null) { c.exitCode = 0; c.emit("exit", 0); } };
  c.stdin = { end }; c.kill = end;
  return c;
}
const A = "0f8fad5b-d9cb-469f-a165-70867728950e", B = "1f8fad5b-d9cb-469f-a165-70867728950e";
const GB = 1024 ** 3;
const roomy = () => new WarmPool({ free: () => 8 * GB });

describe("warm pool (worker/warm.mjs)", () => {
  it("hands a member only their own program, and only in the exact shape", () => {
    const p = roomy();
    expect(p.warm(A, "k1", () => ({ child: fakeChild() }))).toBe("started");
    expect(p.take(B, "k1")).toBeNull();                     // another member never gets it
    expect(p.take(A, "k2")).toBeNull();                     // a different model/tools: closed, not used
    expect(p.report()).toMatchObject({ started: 1, used: 0, unused: 1, open: 0 });
    p.warm(A, "k1", () => ({ child: fakeChild() }));
    expect(p.warm(A, "k1", () => { throw new Error("must not start twice"); })).toBe("kept");
    expect(p.take(A, "k1")).not.toBeNull();
    expect(p.take(A, "k1")).toBeNull();                     // used once
    expect(p.report()).toMatchObject({ started: 2, used: 1, hitRate: 0.5 });
  });
  it("keeps one per member: a new shape replaces the old one", () => {
    const p = roomy();
    const first = fakeChild();
    p.warm(A, "k1", () => ({ child: first }));
    p.warm(A, "k2", () => ({ child: fakeChild() }));
    expect(first.exitCode).toBe(0);
    expect(p.report().open).toBe(1);
  });
  it("starts at most 4 on the worker and never pushes another member's out", () => {
    const p = roomy();
    for (const x of ["a", "b", "c", "d"]) expect(p.warm(x.repeat(8) + A.slice(8), "k", () => ({ child: fakeChild() }))).toBe("started");
    expect(p.warm(B, "k", () => ({ child: fakeChild() }))).toBe("full");
    expect(p.report()).toMatchObject({ open: 4, full: 1 });
  });
  it("starts none with under 1 GB free", () => {
    const p = new WarmPool({ free: () => GB - 1 });
    expect(p.warm(A, "k", () => ({ child: fakeChild() }))).toBe("low_memory");
    expect(p.report()).toMatchObject({ started: 0, lowMemory: 1, open: 0, hitRate: null });
  });
  it("closes one left unused for 3 minutes; typing again keeps it longer", () => {
    let now = 0;
    const p = new WarmPool({ free: () => 8 * GB, now: () => now });
    const c = fakeChild(), cleanup = vi.fn();
    p.warm(A, "k", () => ({ child: c, cleanup }));
    now = 150_000; p.warm(A, "k", () => ({ child: fakeChild() }));   // still typing
    now = 300_000; p.sweep();
    expect(c.exitCode).toBeNull();
    now = 331_000; p.sweep();
    expect(c.exitCode).toBe(0);
    expect(cleanup).toHaveBeenCalled();
    expect(p.report()).toMatchObject({ open: 0, unused: 1 });
  });
  it("does nothing when switched off", () => expect(new WarmPool({ on: false }).warm(A, "k", () => ({ child: fakeChild() }))).toBe("off"));
  it("reads the container's room under its limit when that is smaller", () => {
    const host = vi.spyOn(os, "freemem").mockReturnValue(8 * GB);
    try {
    const read = (f: string) => (f.endsWith("memory.max") ? String(2 * GB) : String(1.5 * GB));
    expect(freeBytes(read)).toBe(Math.min(os.freemem(), 0.5 * GB));
    expect(freeBytes(() => "max")).toBe(os.freemem());
    } finally { host.mockRestore(); }
  });
});

describe("Claude plan started ahead (worker/claude.mjs)", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "uc-warm-test-"));
  const argsLog = path.join(root, "args.log");
  let claude: typeof import("../worker/claude.mjs");
  beforeAll(async () => {
    vi.stubEnv("CLAUDE_BIN", path.resolve("tests/fixtures/fake-claude.mjs"));
    vi.stubEnv("CLAUDE_HOME_ROOT", root);
    vi.stubEnv("FAKE_ARGS_LOG", argsLog);
    mkdirSync(path.join(root, A));
    vi.resetModules();
    claude = await import("../worker/claude.mjs");
  });
  afterAll(() => vi.unstubAllEnvs());
  const ask = async (wp: WarmPool, body: Record<string, unknown>) => {
    let out = "";
    const r = await claude.chat(A, { system: "BE KIND", messages: [{ role: "user", content: "hi" }], ...body }, (t: string) => { out += t; }, undefined, wp);
    return { r, out };
  };

  it("answers with the program started ahead, its instructions sent in the set-up message", async () => {
    const wp = roomy();
    expect(claude.warm(A, { model: "opus" }, wp)).toBe("started");
    const { r, out } = await ask(wp, { model: "opus" });
    expect(r).toEqual({ ok: true });
    expect(out).toBe("SYS=BE KIND Q=hi");
    expect(wp.report()).toMatchObject({ started: 1, used: 1, hitRate: 1 });
    const started = readFileSync(argsLog, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]);
    expect(started).toHaveLength(1);
    expect(started[0]).not.toContain("--system-prompt-file");
  });
  it("starts fresh when the turn's shape differs (another model)", async () => {
    const wp = roomy();
    claude.warm(A, { model: "opus" }, wp);
    const { r, out } = await ask(wp, { model: "haiku" });
    expect(r).toEqual({ ok: true });
    expect(out).toBe("SYS=BE KIND Q=hi");
    expect(wp.report()).toMatchObject({ started: 1, used: 0, unused: 1 });
  });
  it("starts fresh when the one started ahead refuses the set-up", async () => {
    vi.stubEnv("FAKE_REFUSE_INIT", "1");
    const wp = roomy();
    claude.warm(A, { model: "opus" }, wp);
    vi.stubEnv("FAKE_REFUSE_INIT", "");
    const { r, out } = await ask(wp, { model: "opus" });
    expect(r).toEqual({ ok: true });
    expect(out).toBe("SYS=BE KIND Q=hi");
  });
  it("starts nothing for a member who never signed in", () => expect(claude.warm(B, { model: "opus" }, roomy())).toBe("signed_out"));
});
