// Long reminders (args.job — the build diary moved from AI Soul, 2026-10-03): the minute timer's run stops at 300 s and a reminder answer
// at 240 s, so such a reminder starts a background job (13 min) instead; every other reminder answer is cut before the 300 s, never after.
// On a real Postgres; skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

const turns: Array<{ d: { text: string }; o?: { endBy?: number } }> = [];
vi.mock("@/lib/turn", () => ({
  runTurn: async (_u: unknown, d: { text: string; conversationId: string }, o?: { endBy?: number }) => {
    turns.push({ d, o });
    const { one } = await import("@/lib/db"); const { lock } = await import("@/lib/privacy");
    const m = await one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'assistant', $2) returning id", [d.conversationId, lock("Done.")]);
    return { conversationId: d.conversationId, messageId: m!.id, model: "x" };
  },
}));
const pushed = vi.fn(async () => 1), mailed = vi.fn(async () => true);
vi.mock("@/lib/push", () => ({ pushUser: pushed }));
vi.mock("@/lib/mail", async (orig) => ({ ...(await orig<typeof import("@/lib/mail")>()), sendMail: mailed }));
vi.mock("@/lib/tools/computer", async (orig) => ({ ...(await orig<typeof import("@/lib/tools/computer")>()), computerFor: () => true, runGate: async () => ({ skip: false, out: "diary: not posted today" }) }));

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("long reminders run as a background job (database)", () => {
  let db: typeof import("@/lib/db");
  let auto: typeof import("@/lib/automation");
  let privacy: typeof import("@/lib/privacy");
  let uid = "", conv = "";
  beforeAll(async () => {
    const name = `uc_remjob_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    delete process.env.CRON_SECRET;   // the job is only written down here (kickJob needs the secret); the minute timer would start it
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db"); auto = await import("@/lib/automation"); privacy = await import("@/lib/privacy");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at, notify_email) values ($1, 'Asia/Seoul', now(), true) returning id", [`rj-${randomUUID()}@t.test`]))!.id;
    conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'x') returning id", [uid]))!.id;
  }, 30_000);
  const make = async (job: boolean) => (await db.one<import("@/lib/automation").Automation>(
    `insert into automations(user_id, title, recipe, args, schedule, status, next_run_at) values ($1, 'build diary', 'prompt', $2, 'daily@07:50', 'active', now())
     returning id, user_id, title, recipe, args, schedule, condition, status, last_value, last_line, fail_count`,
    [uid, JSON.stringify({ prompt: "Post today's build diary.", conversationId: conv, gate: { command: "diary replies --gate" }, ...(job ? { job: true } : {}) })]))!;

  it("args.job: one background job with the whole reminder and the check's findings; no answer here, nobody notified yet", async () => {
    const n = turns.length;
    const a = await make(true);
    const r = await auto.runAutomation(a);
    expect(r.ok).toBe(true);
    expect(turns.length).toBe(n);
    expect(pushed).not.toHaveBeenCalled();
    expect(mailed).not.toHaveBeenCalled();
    const jobs = await db.q<{ title: string; prompt: string; status: string }>("select title, prompt, status from bg_jobs where user_id = $1 and parent_conversation_id = $2", [uid, conv]);
    expect(jobs.length).toBe(1);
    expect(jobs[0]!.status).toBe("queued");
    expect(privacy.unlock(jobs[0]!.title)).toBe("build diary");
    expect(privacy.unlock(jobs[0]!.prompt)).toContain("Post today's build diary.");
    expect(privacy.unlock(jobs[0]!.prompt)).toContain("diary: not posted today");
  });

  it("any other reminder answers here, cut within the minute timer's 300 s", async () => {
    const a = await make(false);
    const t0 = Date.now();
    await auto.runAutomation(a);
    const end = turns.at(-1)!.o?.endBy ?? 0;
    expect(end).toBeGreaterThan(t0 + 200_000);
    expect(end).toBeLessThanOrEqual(Date.now() + 290_000);
  });
});
