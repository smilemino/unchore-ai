// Shadow runs (moving AI Soul's reminders over, soul chat b83a 2026-10-03): while the old place still does the real work, the new
// reminder answers in its own shadow chat with read-only tools (lib/shadow.ts), notifies nobody, and keeps the answer locked for comparing.
// On a real Postgres; skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

const asked: string[] = [];
const turns: Array<{ shadow?: boolean; reminder?: boolean }> = [];
vi.mock("@/lib/turn", () => ({
  runTurn: async (_u: unknown, d: { text: string; shadow?: boolean; reminder?: boolean; conversationId: string }) => {
    asked.push(d.text); turns.push(d);
    const { one } = await import("@/lib/db"); const { lock } = await import("@/lib/privacy");
    const m = await one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'assistant', $2) returning id", [d.conversationId, lock("Would report: 2 new mails need a reply.")]);
    return { conversationId: d.conversationId, messageId: m!.id, model: "x" };
  },
}));
const pushed = vi.fn(async () => 1), mailed = vi.fn(async () => true);
vi.mock("@/lib/push", () => ({ pushUser: pushed }));
vi.mock("@/lib/mail", async (orig) => ({ ...(await orig<typeof import("@/lib/mail")>()), sendMail: mailed }));
let gate: { skip: true } | { skip: false; out: string } = { skip: false, out: "mail: 2 new" };
vi.mock("@/lib/tools/computer", async (orig) => ({ ...(await orig<typeof import("@/lib/tools/computer")>()), computerFor: () => true, runGate: async () => gate }));

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("shadow reminders (database)", () => {
  let db: typeof import("@/lib/db");
  let auto: typeof import("@/lib/automation");
  let privacy: typeof import("@/lib/privacy");
  let uid = "", conv = "";
  beforeAll(async () => {
    const name = `uc_shadow_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db"); auto = await import("@/lib/automation"); privacy = await import("@/lib/privacy");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at, notify_email) values ($1, 'Asia/Seoul', now(), true) returning id", [`sh-${randomUUID()}@t.test`]))!.id;
    conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'x') returning id", [uid]))!.id;
  }, 30_000);
  const make = async () => (await db.one<import("@/lib/automation").Automation>(
    `insert into automations(user_id, title, recipe, args, schedule, status, next_run_at) values ($1, 'mail check', 'prompt', $2, 'every:30m', 'active', now())
     returning id, user_id, title, recipe, args, schedule, condition, status, last_value, last_line, fail_count`,
    [uid, JSON.stringify({ prompt: "Tell me which mails need a reply.", conversationId: conv, shadow: true, gate: { command: "check-mail" } })]))!;
  const last = async (id: string) => (await db.one<{ s: { at: string; quiet: boolean; text: string } }>("select args->'shadow_last' as s from automations where id = $1", [id]))!.s;

  it("answers once in the shadow chat with the check's findings and notifies nobody", async () => {
    gate = { skip: false, out: "mail: 2 new" };
    const a = await make();
    const r = await auto.runAutomation(a);
    expect(r.ok).toBe(true);
    expect(asked.at(-1)).toContain("mail: 2 new");
    expect(turns.at(-1)).toMatchObject({ shadow: true, reminder: true });
    expect(pushed).not.toHaveBeenCalled();
    expect(mailed).not.toHaveBeenCalled();
    const s = await last(a.id);
    expect(s.quiet).toBe(false);
    expect(privacy.unlock(s.text)).toContain("2 new mails");
    expect((await db.one<{ n: number }>("select count(*)::int as n from runs where automation_id = $1 and ok", [a.id]))!.n).toBe(1);
  });

  it("«nothing to tell» from the check: no AI call at all, still recorded as a quiet shadow run", async () => {
    gate = { skip: true };
    const before = asked.length;
    const a = await make();
    await auto.runAutomation(a);
    expect(asked.length).toBe(before);
    const s = await last(a.id);
    expect(s.quiet).toBe(true);
    expect(s.text).toBe("");
    expect(pushed).not.toHaveBeenCalled();
  });
});
