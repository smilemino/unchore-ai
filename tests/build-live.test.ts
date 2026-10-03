// The «working» line above the chat input for an app build (lib/build-live.ts · AI Soul WindowBadge): which step, how long,
// «couldn't be finished» until the member writes again, «ready» for 15 minutes, nothing for stopped or refused builds.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLine, buildStateLine, buildsPromptNote, pollMs, type BuildLive } from "@/lib/build-live";

const T0 = Date.parse("2026-10-02T12:00:00Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const b = (p: Partial<BuildLive>): BuildLive => ({ title: "Water tracker", status: "queued", step: null, url: null, created_at: at(0), started_at: null, finished_at: null, ...p });

describe("build working line", () => {
  it("shows the step and the minutes while it works, and asks again soon", () => {
    expect(buildLine(b({}), T0 + 90_000)).toEqual({ mark: "working", step: "queued", min: 1 });
    const w = buildLine(b({ status: "running", step: "write:2", started_at: at(1) }), T0 + 4 * 60_000);
    expect(w).toEqual({ mark: "working", step: "write", tries: 2, min: 3 });
    expect(pollMs(w)).toBe(4000);
    for (const s of ["check", "browser", "deploy", "open"]) expect(buildLine(b({ status: "running", step: s, started_at: at(0) }), T0)?.step).toBe(s);
    expect(buildLine(b({ status: "running", step: null, started_at: at(0) }), T0)?.step).toBe("start");   // before the first step is written
    expect(buildLine(b({ status: "running", step: "weird", started_at: at(0) }), T0)?.step).toBe("start");
  });
  it("shows «ready» for 15 minutes after it finished, then nothing", () => {
    const done = b({ status: "done", url: "https://x.vercel.app", finished_at: at(5) });
    expect(buildLine(done, T0 + 8 * 60_000)).toEqual({ mark: "done", step: "done", min: 3 });
    expect(pollMs(buildLine(done, T0 + 8 * 60_000))).toBeNull();
    expect(buildLine(done, T0 + 21 * 60_000)).toBeNull();
  });
  it("a failed build waits for the member until they write again (or an hour)", () => {
    const failed = b({ status: "failed", finished_at: at(5) });
    expect(buildLine(failed, T0 + 10 * 60_000)?.mark).toBe("decision");
    expect(buildLine(failed, T0 + 10 * 60_000, at(2))?.mark).toBe("decision");   // the member's message before it failed doesn't count
    expect(buildLine(failed, T0 + 10 * 60_000, at(7))).toBeNull();
    expect(buildLine(failed, T0 + 70 * 60_000)).toBeNull();
  });
  it("stopped, refused and no build show nothing", () => {
    expect(buildLine(null, T0)).toBeNull();
    expect(buildLine(b({ status: "stopped", finished_at: at(1) }), T0 + 60_000)).toBeNull();
    expect(buildLine(b({ status: "refused", finished_at: at(1) }), T0 + 60_000)).toBeNull();
  });
  it("the build writes each step, the line sits above the input, and the column is added only", () => {
    const src = readFileSync("lib/build.ts", "utf8");
    for (const s of ["`write:${rounds + 1}`", '"check"', '"browser"', '"deploy"', '"open"']) expect(src).toContain(`await step(${s})`);
    expect(readFileSync("components/Chat.tsx", "utf8")).toMatch(/<BuildLine [^\n]*\n\s*<ConversationTasks /);
    expect(readFileSync("db/migrations/041_build_step.sql", "utf8")).toMatch(/alter table builds add column if not exists step text;/);
    // only this member's chat and build (a guessed chat id from someone else is «not found»)
    expect(readFileSync("app/api/conversations/[id]/build/route.ts", "utf8")).toMatch(/conversation_id = \$1 and user_id = \$2/);
  });
});

describe("the AI knows how its builds are going (AI Soul lib/voice-tasks.ts)", () => {
  it("says each build's state in plain words, from the record", () => {
    expect(buildStateLine(b({}), T0 + 2 * 60_000)).toBe("«Water tracker» — waiting to start (asked 2 min ago)");
    expect(buildStateLine(b({ status: "running", step: "write:2", started_at: at(1) }), T0 + 4 * 60_000)).toBe("«Water tracker» — being built now: writing the app (try 2 of 3), 3 min so far");
    expect(buildStateLine(b({ status: "running", step: "deploy", started_at: at(0) }), T0 + 30_000)).toContain("putting it online, just now");
    expect(buildStateLine(b({ status: "done", url: "https://w.vercel.app", finished_at: at(5) }), T0 + 70 * 60_000)).toBe("«Water tracker» — ready 1 h 5 min ago: https://w.vercel.app");
    expect(buildStateLine(b({ status: "stopped" }), T0)).toContain("stopped");
    expect(buildStateLine(b({ status: "failed" }), T0)).toContain("couldn't be finished");
  });
  it("adds a section only when the chat has builds, newest five, and never invents a link", () => {
    expect(buildsPromptNote([], T0)).toBe("");
    const note = buildsPromptNote(Array.from({ length: 7 }, (_, i) => b({ title: `App ${i}` })), T0);
    expect(note).toContain("measured just now");
    expect(note).toContain("App 4");
    expect(note).not.toContain("App 5");
    expect(note).toContain("Give a link only if it is listed here");
    expect(note).toContain("don't add a new <<<build>>> line");
  });
  it("is given to the AI with this member's chat only, last 12 hours", () => {
    const turn = readFileSync("lib/turn.ts", "utf8");
    expect(turn).toMatch(/BUILD_GUIDE\}\$\{await buildsNow\(u\.id, convId\)\}/);
    expect(turn).toMatch(/where user_id = \$1 and conversation_id = \$2 and created_at > now\(\) - interval '12 hours'/);
  });
});
