// «Edit and ask again» (AI Soul /api/messages/{id}/edit, 2026-10-01): the edited question and everything after it are set aside —
// kept in the chat, greyed, out of the AI's context — and the old-chat summary is dropped. Real Postgres; skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("edit and ask again (database)", () => {
  let db: typeof import("@/lib/db");
  let turn: typeof import("@/lib/turn");
  let uid = "";

  beforeAll(async () => {
    const name = `uc_eq_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin if not exists (select 1 from pg_roles where rolname = 'unchore_member') then create role unchore_member nologin; end if; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    turn = await import("@/lib/turn");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'Asia/Seoul', now()) returning id", [`eq-${randomUUID()}@t.test`]))!.id;
  }, 60_000);

  it("sets the edited question and what follows aside, keeps what came before, and drops the summary", async () => {
    const c = (await db.one<{ id: string }>("insert into conversations(user_id, title, summary, summary_upto) values ($1, 'x', 's', 3) returning id", [uid]))!.id;
    const ids: string[] = [];
    for (const [role, mins] of [["user", 40], ["assistant", 39], ["user", 30], ["assistant", 29], ["user", 20], ["assistant", 19]] as const)
      ids.push((await db.one<{ id: string }>("insert into messages(conversation_id, role, content, created_at) values ($1, $2, 'x', now() - make_interval(mins => $3)) returning id", [c, role, mins]))!.id);

    expect(await turn.setAside(c, ids[2]!)).toBe(true);
    const rows = await db.q<{ id: string; superseded: boolean }>("select id, superseded from messages where conversation_id = $1 order by created_at", [c]);
    expect(rows.map((r) => r.superseded)).toEqual([false, false, true, true, true, true]);
    const conv = await db.one<{ summary: string | null; summary_upto: number }>("select summary, summary_upto from conversations where id = $1", [c]);
    expect(conv).toEqual({ summary: null, summary_upto: 0 });
  });

  it("refuses an answer, a set-aside question, or another chat's message", async () => {
    const c = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'y') returning id", [uid]))!.id;
    const q1 = (await db.one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'user', 'q') returning id", [c]))!.id;
    const a1 = (await db.one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'assistant', 'a') returning id", [c]))!.id;
    const other = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'z') returning id", [uid]))!.id;
    expect(await turn.setAside(c, a1)).toBe(false);
    expect(await turn.setAside(other, q1)).toBe(false);
    expect(await turn.setAside(c, q1)).toBe(true);
    expect(await turn.setAside(c, q1)).toBe(false);
  });
});
