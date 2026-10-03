// The list like AI Soul's (owner 2026-10-01 «Unchore still shows «Idle» and never tidies chats»): the empty circle has no word,
// and every 30 minutes a chat with nothing left to do moves to «Done» (lib/auto-done.ts). The database part runs on a real
// Postgres — skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTO_DONE_MINUTES, autoDoneIds, autoDueNow } from "@/lib/auto-done";
import { DOT, FOLD_AT, foldRows, groupRows } from "@/lib/conv-line";

describe("list circles", () => {
  it("«nothing to do» is an empty circle — only busy, reply and done carry a word", () => {
    expect(DOT.idle.quiet).toBe(true);
    for (const s of ["working", "turn", "done"] as const) expect(DOT[s].quiet).toBeUndefined();
  });
  it("runs twice an hour, two minutes each (the minute timer drifts)", () => {
    expect(AUTO_DONE_MINUTES).toEqual([20, 21, 50, 51]);
    expect(autoDueNow(new Date("2026-10-01T06:20:30Z"))).toBe(true);
    expect(autoDueNow(new Date("2026-10-01T06:22:00Z"))).toBe(false);
  });
  it("an answer waiting on something outside (⏳) stays out of «Done»", () => {
    expect(autoDoneIds([
      { id: "hold", last_role: "assistant", last_text: "Sent it.\n\n⏳ In progress — the landlord's reply" },
      { id: "plain", last_role: "assistant", last_text: "All set." },
      { id: "quoted", last_role: "user", last_text: "⏳ In progress — copied from somewhere" },
      { id: "none", last_role: "assistant", last_text: null },
    ])).toEqual(["plain", "quoted", "none"]);
  });
  it("a done chat leaves «Chats» for «Done»", () => {
    const row = { id: "a", title: "a", updated_at: "2026-10-01T00:00:00Z", pinned: false, project_id: null, last_role: "assistant" };
    expect(groupRows([{ ...row, done: true }], (s) => s).map((g) => g.key)).toEqual(["done"]);
    expect(groupRows([{ ...row, done: false }], (s) => s).map((g) => g.key)).toEqual(["rest"]);
  });
  it("a folded «Done» group still shows chats with unread answers", () => {
    const rows = Array.from({ length: FOLD_AT + 3 }, (_, i) => ({ id: `d${i}`, ai_count: 2, seen_ai: i === FOLD_AT + 1 ? 1 : 2 }));
    const f = foldRows({ key: "done", head: "", rows }, false, null);
    expect(f.rows.map((r) => r.id)).toEqual([...rows.slice(0, FOLD_AT).map((r) => r.id), `d${FOLD_AT + 1}`]);
    expect(f.hidden).toBe(2);
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("tidying into «Done» (database)", () => {
  let db: typeof import("@/lib/db");
  let auto: typeof import("@/lib/auto-done");
  let uid = "";
  const conv = async (o: { msgs: Array<[string, number, boolean?, string?]>; seen?: number | null; done?: boolean; answering?: boolean }) => {
    const id = (await db.one<{ id: string }>("insert into conversations(user_id, title, done, seen_ai, answering_since) values ($1, 'x', $2, $3, $4) returning id",
      [uid, o.done ?? false, o.seen === undefined ? 99 : o.seen, o.answering ? new Date() : null]))!.id;
    for (const [role, minsAgo, asks, text] of o.msgs) await db.q("insert into messages(conversation_id, role, content, created_at, asks) values ($1, $2, $5, now() - make_interval(mins => $3), $4)", [id, role, minsAgo, asks ?? null, text ?? "x"]);
    return id;
  };
  const isDone = async (id: string) => (await db.one<{ done: boolean }>("select done from conversations where id = $1", [id]))!.done;

  beforeAll(async () => {
    const name = `uc_ad_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin if not exists (select 1 from pg_roles where rolname = 'unchore_member') then create role unchore_member nologin; end if; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    auto = await import("@/lib/auto-done");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'Asia/Seoul', now()) returning id", [`ad-${randomUUID()}@t.test`]))!.id;
  }, 60_000);

  it("moves only chats with nothing left to do", async () => {
    const tidy = await conv({ msgs: [["user", 40], ["assistant", 30]] });
    const fresh = await conv({ msgs: [["user", 6], ["assistant", 5]] });                 // answered 5 min ago — next time
    const asks = await conv({ msgs: [["user", 40], ["assistant", 30, true]] });          // 🟠 waits for the member
    const busy = await conv({ msgs: [["user", 5]] });                                    // just asked — an answer is coming
    const broke = await conv({ msgs: [["user", 30]] });                                  // no answer for 30 min — the list shows an empty circle
    const answering = await conv({ msgs: [["user", 40], ["assistant", 30]], answering: true });
    const unread = await conv({ msgs: [["user", 40], ["assistant", 30]], seen: 0 });     // not opened yet — moves too (like AI Soul)
    const queued = await conv({ msgs: [["user", 40], ["assistant", 30]] });
    await db.q("insert into chat_queue(user_id, conversation_id, text) values ($1, $2, 'later')", [uid, queued]);
    const building = await conv({ msgs: [["user", 40], ["assistant", 30]] });
    await db.q("insert into builds(user_id, conversation_id, title, spec, status) values ($1, $2, 't', 's', 'running')", [uid, building]);
    const empty = await conv({ msgs: [] });
    const hold = await conv({ msgs: [["user", 40], ["assistant", 30, false, "Asked the shop.\n⏳ In progress — the shop's reply"]] });   // waits on someone outside

    expect(await auto.autoDone()).toBe(3);
    for (const id of [tidy, broke, unread]) expect(await isDone(id)).toBe(true);
    for (const id of [fresh, asks, busy, answering, queued, building, empty, hold]) expect(await isDone(id)).toBe(false);
    expect(await auto.autoDone()).toBe(0);   // a second pass changes nothing
  }, 30_000);
});
