// Daily note on a real Postgres, fenced as the member (lib/nudge.ts + db/migrations/007). Skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("daily note (database)", () => {
  let db: typeof import("@/lib/db");
  let nudge: typeof import("@/lib/nudge");
  let uid = "";
  const me = () => db.one<{ nudge_level: number; nudge_at: string }>("select nudge_level, nudge_at from users where id = $1", [uid]);
  const auto = () => db.one<{ id: string; schedule: string; status: string; conv: string; prompt: string }>(
    "select id, schedule, status, args->>'conversationId' as conv, args->>'prompt' as prompt from automations where user_id = $1 and args->>'kind' = 'nudge'", [uid]);

  beforeAll(async () => {
    // Its own database: the member-lock test counts every row in the shared one, and CI runs test files side by side.
    const name = `uc_nudge_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    // The member role is cluster-wide and the member-lock test (run side by side) creates it; two creators at once collide.
    // Wait for it (≤5 s); running alone, make it here.
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    nudge = await import("@/lib/nudge");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'Asia/Seoul', now() - interval '10 days') returning id", [`n-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("starts once a day at 08:00 in its own chat, as the member", async () => {
    await db.asMember(uid, () => nudge.syncNudge(uid));
    await db.asMember(uid, () => nudge.syncNudge(uid));   // twice → still one
    const n = await db.one<{ n: number }>("select count(*)::int as n from automations where user_id = $1 and args->>'kind' = 'nudge'", [uid]);
    expect(n!.n).toBe(1);
    const a = (await auto())!;
    expect(a).toMatchObject({ schedule: "daily@08:00", status: "active" });
    expect(a.conv).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("the note's chat stays out of the list while empty; shows once it has a note; other empty chats still show", async () => {
    const hidden = (id: string) => db.one<{ h: boolean }>(`select ${nudge.EMPTY_NOTE_CHAT} as h from conversations c where c.id = $1`, [id]).then((r) => r!.h);
    const a = (await auto())!;
    const plain = (await db.one<{ id: string }>("insert into conversations(user_id) values ($1) returning id", [uid]))!.id;
    expect(await hidden(a.conv)).toBe(true);
    expect(await hidden(plain)).toBe(false);
    await db.q("insert into messages(conversation_id, role, content) values ($1, 'assistant', 'Morning!')", [a.conv]);
    expect(await hidden(a.conv)).toBe(false);
    await db.q("delete from messages where conversation_id = $1", [a.conv]);
    await db.q("delete from conversations where id = $1", [plain]);
  });
  it("changes when the user says so in words", async () => {
    const notes = await db.asMember(uid, () => nudge.applyNudgeMarks(uid, [{ kind: "at", at: "21:00" }], "ko"));
    expect(notes[0]).toContain("21:00");
    expect((await auto())!.schedule).toBe("daily@21:00");
    await db.asMember(uid, () => nudge.applyNudgeMarks(uid, [{ kind: "less" }], "en"));
    expect((await me())!.nudge_level).toBe(2);
    expect((await auto())!.schedule).toBe("every:2880m");
    await db.asMember(uid, () => nudge.applyNudgeMarks(uid, [{ kind: "off" }], "en"));
    expect((await auto())!.status).toBe("paused");
    await db.asMember(uid, () => nudge.applyNudgeMarks(uid, [{ kind: "more" }], "en"));   // «more» after off → back on, at the lowest step
    expect((await me())!.nudge_level).toBe(1);
    expect((await auto())!).toMatchObject({ status: "active", schedule: "weekly@1@21:00" });
  });

  it("nightly: two unanswered notes → one step less, tomorrow's prompt written; nothing fails without an AI key", async () => {
    await db.q("update users set nudge_level = 3, nudge_at = '08:00', nudge_changed_at = null where id = $1", [uid]);
    await db.asMember(uid, () => nudge.syncNudge(uid));
    const a = (await auto())!;
    for (const d of [3, 2]) await db.q("insert into messages(conversation_id, role, content, created_at) values ($1, 'user', '⏰ ☀ Daily note', now() - ($2 || ' days')::interval), ($1, 'assistant', 'Morning!', now() - ($2 || ' days')::interval + interval '1 minute')", [a.conv, String(d)]);
    const r = await nudge.nightlyNudge(uid);
    expect(r.changed).toBe(2);
    expect((await me())!.nudge_level).toBe(2);
    expect((await auto())!.prompt).toContain("Daily note — you speak first");
  });

  it("nightly: the day's log (answers, runs, new automations) goes into tomorrow's prompt", async () => {
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id) values ($1) returning id", [uid]))!.id;
    await db.q("insert into messages(conversation_id, role, content) values ($1, 'user', 'hi'), ($1, 'assistant', 'hello'), ($1, 'user', 'and?'), ($1, 'assistant', 'ok')", [conv]);
    const job = (await db.one<{ id: string }>("insert into automations(user_id, title, recipe, status) values ($1, 'Price check', 'prompt', 'active') returning id", [uid]))!.id;
    await db.q("insert into runs(automation_id, ok) values ($1, true), ($1, false), ($1, null)", [job]);
    await nudge.nightlyNudge(uid);
    expect((await auto())!.prompt).toContain("answered 2 messages in 1 chat · ran «Price check» ×2 (1 failed) · set up «Price check»");
  });

  it("another member can't see or move this member's note", async () => {
    const other = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`o-${randomUUID()}@t.test`]))!.id;
    expect(await db.asMember(other, () => nudge.nudgeAutomation(uid))).toBeNull();
    await db.asMember(other, () => db.q("update automations set schedule = 'hourly' where args->>'kind' = 'nudge'"));
    expect((await auto())!.schedule).not.toBe("hourly");
  });
});
