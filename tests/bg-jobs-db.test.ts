// Background jobs (lib/bg-jobs.ts — Claude Code subagents, Codex cloud tasks). On a real Postgres with a fake AI turn: several
// jobs start at once, each runs in its own new chat, the result comes back into the chat that started it as a note, a job can't
// start more jobs, at most 5 run at a time, «stop» stops one, the minute timer restarts lost starts and closes jobs that went
// quiet, and another member sees none of it. Skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({ pushUser: async () => 1 }));
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("background jobs (database)", () => {
  let db: typeof import("@/lib/db");
  let bj: typeof import("@/lib/bg-jobs");
  let unlock: (s: string | null | undefined) => string;
  let a = "", b = "", chat = "";
  beforeAll(async () => {
    const name = `uc_bj_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    bj = await import("@/lib/bg-jobs");
    unlock = (await import("@/lib/privacy")).unlock;
    await import("@/lib/i18n-server");   // loaded once up front, so the timing below measures the jobs, not this
    a = (await db.one<{ id: string }>("insert into users(email, tz, lang) values ($1, 'UTC', 'en') returning id", [`a-${randomUUID()}@t.test`]))!.id;
    b = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'UTC') returning id", [`b-${randomUUID()}@t.test`]))!.id;
    chat = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'main') returning id", [a]))!.id;
  }, 30_000);

  /** A fake chat turn: answers in the chat it was given, after `ms`, unless stopped. */
  const fakeTurn = (answer: string, ms = 50) => async (user: { id: string }, d: { conversationId: string | null; text: string }, o: { signal: AbortSignal }) => {
    await new Promise<void>((res, rej) => { const t = setTimeout(res, ms); o.signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("stopped")); }); });
    await db.q("insert into messages(conversation_id, role, content) values ($1, 'user', $2)", [d.conversationId, d.text]);
    const m = await db.one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'assistant', $2) returning id", [d.conversationId, answer]);
    return { conversationId: d.conversationId!, messageId: m!.id };
  };

  it("starts several at once, each in its own chat, and brings each result back as a note", async () => {
    const kicked: string[] = [];
    const r = await db.asMember(a, () => bj.jobsTool({ userId: a, convId: chat }, { action: "start", jobs: [{ title: "Compare prices", prompt: "Find the 3 cheapest…" }, { title: "Draft the email", prompt: "Write…" }] }, async (id) => { kicked.push(id); }));
    expect(r.ok).toBe(true);
    expect(r.text).toContain("Started 2 background job(s)");
    expect(kicked).toHaveLength(2);
    const raw = await db.one<{ prompt: string; title: string }>("select prompt, title from bg_jobs where id = $1", [kicked[0]]);
    expect(raw!.prompt.startsWith("enc:") && raw!.title.startsWith("enc:")).toBe(true);
    // both at the same time
    const t0 = Date.now();
    const out = await Promise.all(kicked.map((id, i) => bj.runJob(id, fakeTurn(`result ${i}`, 1500) as never)));
    expect(out).toEqual(["done", "done"]);
    expect(Date.now() - t0).toBeLessThan(2900);   // one after the other would take 3 s or more
    // a second start of the same job does nothing
    expect(await bj.runJob(kicked[0]!, fakeTurn("again") as never)).toBe("skipped");
    const jobs = await db.asMember(a, () => bj.listJobs(a));
    expect(jobs.map((j) => j.status)).toEqual(["done", "done"]);
    const child = jobs.find((j) => j.title === "Compare prices")!.conversation_id!;
    const ct = await db.one<{ title: string }>("select title from conversations where id = $1", [child]);
    expect(unlock(ct!.title)).toBe("⚙ Compare prices");
    const notes = (await db.q<{ content: string; asks: boolean }>("select content, asks from messages where conversation_id = $1 order by created_at", [chat])).map((m) => unlock(m.content));
    expect(notes.some((n) => n.includes("«Compare prices» is done") && n.includes("result 0") && n.includes(`/app?c=${child}`))).toBe(true);
    expect(notes.some((n) => n.includes("«Draft the email» is done") && n.includes("result 1"))).toBe(true);
  });

  it("a job's own chat can't start more jobs; at most 5 open at once", async () => {
    const child = (await db.asMember(a, () => bj.listJobs(a)))[0]!.conversation_id!;
    expect((await db.asMember(a, () => bj.startJobs({ userId: a, convId: child }, [{ title: "x", prompt: "y" }], async () => {}))).ok).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, prompt: "p" }));
    expect((await db.asMember(a, () => bj.startJobs({ userId: a, convId: chat }, six, async () => {}))).text).toContain("At most 5");
    expect((await db.asMember(a, () => bj.startJobs({ userId: a, convId: chat }, [{ title: "", prompt: "p" }], async () => {}))).ok).toBe(false);
  });

  it("stop stops a running job; the note says so", async () => {
    const ids: string[] = [];
    await db.asMember(a, () => bj.startJobs({ userId: a, convId: chat }, [{ title: "Long one", prompt: "slow" }], async (id) => { ids.push(id); }));
    const running = bj.runJob(ids[0]!, fakeTurn("never", 20_000) as never);
    await new Promise((r) => setTimeout(r, 300));
    // another member can't stop it
    expect((await db.asMember(b, () => bj.jobsTool({ userId: b, convId: chat }, { action: "stop", id: ids[0]! }))).ok).toBe(false);
    expect((await db.asMember(a, () => bj.jobsTool({ userId: a, convId: chat }, { action: "stop", id: ids[0]!.slice(0, 8) }))).ok).toBe(true);
    expect(await running).toBe("stopped");
    const last = await db.one<{ content: string }>("select content from messages where conversation_id = $1 order by created_at desc limit 1", [chat]);
    expect(unlock(last!.content)).toContain("«Long one» was stopped");
  }, 15_000);

  it("the minute timer restarts lost starts and closes jobs that went quiet", async () => {
    const ids: string[] = [];
    await db.asMember(a, () => bj.startJobs({ userId: a, convId: chat }, [{ title: "Lost", prompt: "p" }, { title: "Quiet", prompt: "p" }], async (id) => { ids.push(id); }));
    await db.q("update bg_jobs set created_at = now() - interval '2 minutes' where id = $1", [ids[0]]);
    await db.q("update bg_jobs set status = 'running', started_at = now() - interval '20 minutes' where id = $1", [ids[1]]);
    const kicked: string[] = [];
    expect(await bj.jobTick(async (id) => { kicked.push(id); })).toEqual({ kicked: 1, closed: 1 });
    expect(kicked).toEqual([ids[0]]);
    expect((await db.one<{ status: string }>("select status from bg_jobs where id = $1", [ids[1]]))!.status).toBe("failed");
  });

  it("a member with no AI connected gets a plain sentence, not an internal code", async () => {
    const ids: string[] = [];
    await db.asMember(a, () => bj.startJobs({ userId: a, convId: chat }, [{ title: "No AI", prompt: "p" }], async (id) => { ids.push(id); }));
    const noKey = async () => { throw new Error("no_key"); };
    expect(await bj.runJob(ids[0]!, noKey as never)).toBe("failed");
    const last = unlock((await db.one<{ content: string }>("select content from messages where conversation_id = $1 order by created_at desc limit 1", [chat]))!.content);
    expect(last).toContain("«No AI» couldn't finish: Connect your AI first in Unchore → Settings");
    expect(last).not.toContain("no_key");
  });

  it("another member sees none of it", async () => {
    expect(await db.asMember(b, () => bj.listJobs(b))).toEqual([]);
    expect(await db.asMember(b, () => db.q("select id from bg_jobs"))).toEqual([]);
    expect((await db.asMember(b, () => bj.jobsTool({ userId: b, convId: chat }, { action: "list" }))).text).toBe("No background jobs yet.");
  });
});
