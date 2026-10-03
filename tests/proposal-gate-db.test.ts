// No second switch-on card when the chat already set that reminder (lib/proposal-gate.ts), on a real Postgres. Skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("reminderJustSet (database)", () => {
  let db: typeof import("@/lib/db");
  let gate: typeof import("@/lib/proposal-gate");
  let uid = "";
  const turn = async (conv: string, remind: "prompt" | "nudge" | null) => {
    await db.q("insert into messages(conversation_id, role, content) values ($1, 'user', 'q')", [conv]);
    if (remind) await db.q("insert into automations(user_id, title, recipe, args, schedule, status) values ($1, 't', 'prompt', $2, 'daily@08:00', 'active')",
      [uid, JSON.stringify(remind === "nudge" ? { kind: "nudge", conversationId: conv, prompt: "x" } : { conversationId: conv, prompt: "x" })]);
    return (await db.one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'assistant', 'a') returning id", [conv]))!.id;
  };
  const conv = async () => (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 't') returning id", [uid]))!.id;

  beforeAll(async () => {
    const name = `uc_gate_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    gate = await import("@/lib/proposal-gate");
    uid = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'Asia/Seoul') returning id", [`g-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("true only for a chat reminder set in this very turn", async () => {
    const c = await conv();
    const set = await turn(c, "prompt");
    expect(await db.asMember(uid, () => gate.reminderJustSet(uid, set))).toBe(true);
    const next = await turn(c, null);   // a later turn in the same chat: the old reminder doesn't count
    expect(await db.asMember(uid, () => gate.reminderJustSet(uid, next))).toBe(false);
    const n = await turn(await conv(), "nudge");   // the daily note isn't the member's ask
    expect(await db.asMember(uid, () => gate.reminderJustSet(uid, n))).toBe(false);
  });
});
