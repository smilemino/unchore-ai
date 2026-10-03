// «View summary» (lib/chat-summary.ts) on a real Postgres: the member's own chat only, the stored summary unlocked, none = null.
// Skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("long-chat summary (database)", () => {
  let db: typeof import("@/lib/db");
  let cs: typeof import("@/lib/chat-summary");
  let uid = "", other = "", conv = "", bare = "";
  beforeAll(async () => {
    const name = `uc_csum_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    cs = await import("@/lib/chat-summary");
    const { lock } = await import("@/lib/privacy");
    uid = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`s-${randomUUID()}@t.test`]))!.id;
    other = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`o-${randomUUID()}@t.test`]))!.id;
    conv = (await db.one<{ id: string }>("insert into conversations(user_id, title, summary, summary_upto) values ($1, $2, $3, 40) returning id", [uid, lock("t"), lock("- budget 120\n- meeting Tue")]))!.id;
    bare = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, $2) returning id", [uid, lock("t")]))!.id;
  });
  it("reads the member's own summary back as written", async () => {
    expect(await cs.chatSummary(conv, uid)).toEqual({ text: "- budget 120\n- meeting Tue", upto: 40 });
  });
  it("no summary yet → null; someone else's chat → not found", async () => {
    expect(await cs.chatSummary(bare, uid)).toEqual({ text: null, upto: 0 });
    expect(await cs.chatSummary(conv, other)).toBeUndefined();
  });
});
