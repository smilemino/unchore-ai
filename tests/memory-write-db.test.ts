// «Let the AI add new memories» (AI Soul «대화에서 기억을 스스로 적기») on a real Postgres: on by default for every member;
// off keeps saved memories but the AI writes nothing after an answer. Skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("memory write switch (database)", () => {
  let db: typeof import("@/lib/db");
  let mem: typeof import("@/lib/memory");
  let uid = "";
  beforeAll(async () => {
    const name = `uc_memw_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    mem = await import("@/lib/memory");
    uid = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`m-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("is on for every member by default", async () => {
    expect((await db.one<{ memory_write: boolean }>("select memory_write from users where id = $1", [uid]))?.memory_write).toBe(true);
  });

  it("off: the AI adds nothing after an answer, and asks no AI to (memories stay as they were)", async () => {
    await db.q("update users set memory_write = false where id = $1", [uid]);
    await db.q("insert into memories(user_id, text) values ($1, 'likes short answers')", [uid]);
    const r = await mem.updateMemory(uid, randomUUID(), "I moved to Busan last week", "Noted!", { anthropic: "sk-not-called" });
    expect(r).toBeNull();
    expect((await db.one<{ n: number }>("select count(*)::int as n from memories where user_id = $1", [uid]))?.n).toBe(1);
  });
});
