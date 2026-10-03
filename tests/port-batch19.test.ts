// Batch 19 (owner «yes» 2026-09-30 08:55): waiting messages kept on the server (AI Soul lib/server/queue.ts).
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;
describe.skipIf(!URL)("chat queue (database)", () => {
  let db: typeof import("@/lib/db");
  let qu: typeof import("@/lib/queue");
  let uid = "", conv = "";
  beforeAll(async () => {
    const name = `uc_b19_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    qu = await import("@/lib/queue");
    uid = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`q-${randomUUID()}@t.test`]))!.id;
    conv = (await db.one<{ id: string }>("insert into conversations(user_id) values ($1) returning id", [uid]))!.id;
  }, 30_000);

  it("a waiting message is taken once — the screen and the timer never both send it", async () => {
    const id = (await db.asMember(uid, () => db.one<{ id: string }>("insert into chat_queue(user_id, conversation_id, text) values ($1, $2, 'next') returning id", [uid, conv])))!.id;
    const first = await db.asMember(uid, () => db.q("delete from chat_queue where id = $1 and user_id = $2 returning 1", [id, uid]));
    const second = await db.asMember(uid, () => db.q("delete from chat_queue where id = $1 and user_id = $2 returning 1", [id, uid]));
    expect([first.length, second.length]).toEqual([1, 0]);
  });

  it("the timer leaves fresh and held ones alone; one it can't send (no AI) comes back held, not lost", async () => {
    await db.q("insert into chat_queue(user_id, conversation_id, text, created_at) values ($1, $2, 'fresh', now())", [uid, conv]);
    await db.q("insert into chat_queue(user_id, conversation_id, text, held, created_at) values ($1, $2, 'held', true, now() - interval '1 hour')", [uid, conv]);
    const old = (await db.one<{ id: string }>("insert into chat_queue(user_id, conversation_id, text, created_at) values ($1, $2, 'orphan', now() - interval '1 hour') returning id", [uid, conv]))!.id;
    expect(await qu.drainQueue()).toBe(0);   // no AI key → not sent
    const rows = await db.q<{ id: string; text: string; held: boolean }>("select id, text, held from chat_queue where conversation_id = $1 order by text", [conv]);
    expect(rows.map((r) => [r.text, r.held])).toEqual([["fresh", false], ["held", true], ["orphan", true]]);
    expect(rows.find((r) => r.text === "orphan")!.id).toBe(old);
  });

  it("another member can't see or take them", async () => {
    const other = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`o-${randomUUID()}@t.test`]))!.id;
    expect(await db.asMember(other, () => db.q("select 1 from chat_queue"))).toEqual([]);
  });
});
