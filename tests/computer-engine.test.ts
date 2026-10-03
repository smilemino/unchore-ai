import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Exercise the exact portable runner functions without its polling loop, saved credentials or an AI charge.
const source = readFileSync("public/unchore-computer.mjs", "utf8");
function engine(name: "Codex" | "Hermes", full = false) {
  let args: string[] = [], input = "", lowered = 0;
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { end: (s: string) => { input = s; } },
  });
  const from = source.indexOf(`function attempt${name}(`);
  const to = source.indexOf("\n/**", from);
  const fn = runInNewContext(`${source.slice(from, to)}\nattempt${name}`, {
    spawn: (_bin: string, a: string[]) => { args = a; return child; },
    conf: { full, dir: "/tmp/member-work", codex: "codex", hermes: "hermes" }, process: { env: {} }, lower: () => { lowered++; },
  });
  const st = { session: undefined as string | undefined, child: null, note: "", pending: "", worked: false };
  return { child, st, args: () => args, input: () => input, lowered: () => lowered,
    run: (session?: string) => fn({ system: "member instructions" }, "read hello.txt", session, st) };
}

describe("connected computer engines", () => {
  it("Codex resumes with sandbox on the parent command, closes stdin, and keeps the returned thread", async () => {
    const e = engine("Codex"); const answer = e.run("codex:thread-1");
    expect(e.args()).toEqual(["exec", "--sandbox", "workspace-write", "resume", "thread-1", "--json", "--skip-git-repo-check", "-"]);
    expect(e.input()).toBe("read hello.txt");
    e.child.stdout.emit("data", '{"type":"thread.started","thread_id":"thread-1"}\n{"type":"item.completed","item":{"type":"agent_message","text":"unchore"}}\n');
    e.child.emit("close", 0);
    expect(await answer).toMatchObject({ code: 0, final: "unchore", session: "codex:thread-1" });
  });
  it("a new Codex thread gets instructions and never resumes a different engine's session", async () => {
    const e = engine("Codex"); const answer = e.run("hermes:other");
    expect(e.args()).not.toContain("resume"); expect(e.args()).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(e.input()).toContain("member instructions"); e.child.emit("close", 0); await answer;
  });
  it("Hermes captures its session from stderr and resumes it on the next turn", async () => {
    const first = engine("Hermes"); const a = first.run();
    expect(first.args()).toContain("--pass-session-id");
    first.child.stderr.emit("data", "session_id: session-7\n"); first.child.stdout.emit("data", "made it\n"); first.child.emit("close", 0);
    expect(await a).toMatchObject({ final: "made it", session: "hermes:session-7" });
    const second = engine("Hermes"); const b = second.run(first.st.session);
    expect(second.args()).toContain("--resume"); expect(second.args()).toContain("session-7");
    expect(second.args()).not.toContain("--yolo"); second.child.stdout.emit("data", "unchore\n"); second.child.emit("close", 0);
    expect(await b).toMatchObject({ final: "unchore", session: "hermes:session-7" });
  });
});

// The agent steps back on the CPU so the member's own work on that computer stays quick.
function lowering(nice: number, fail = false) {
  const set: Array<[number, number]> = [], logs: string[] = [];
  const from = source.indexOf("let niceFailed");
  const fn = runInNewContext(`${source.slice(from, source.indexOf("\n/**", from))}\nlower`, {
    conf: { nice }, log: (s: string) => logs.push(s),
    setPriority: (pid: number, n: number) => { if (fail) throw Object.assign(new Error("no"), { code: "EACCES" }); set.push([pid, n]); },
  });
  return { set, logs, lower: (pid?: number) => fn({ pid }) };
}

describe("connected computer runs the agent at low priority", () => {
  it("lowers each agent it starts, and every engine calls it", async () => {
    const l = lowering(10); l.lower(41); l.lower(42); l.lower(undefined);
    expect(l.set).toEqual([[41, 10], [42, 10]]);
    for (const n of ["Codex", "Hermes"] as const) { const e = engine(n); const a = e.run(); expect(e.lowered()).toBe(1); e.child.emit("close", 0); await a; }
    expect(source.slice(source.indexOf("function attempt("), source.indexOf("function attemptCodex("))).toContain("lower(child)");
  });
  it("--nice 0 turns it off; where it isn't allowed the agent still runs and it is said once", () => {
    const off = lowering(0); off.lower(41); expect(off.set).toEqual([]);
    const no = lowering(10, true); no.lower(41); no.lower(42);
    expect(no.logs).toHaveLength(1); expect(no.logs[0]).toContain("normal priority");
  });
  it("the setting is 0–19, default 10", () => {
    const from = source.indexOf("const niceOf");
    const niceOf = runInNewContext(`${source.slice(from, source.indexOf("\n", from))}\nniceOf`, {});
    expect([undefined, "abc", "0", "5", "40", "-3"].map(niceOf)).toEqual([10, 10, 0, 5, 19, 0]);
  });
});
