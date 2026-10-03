// «Your turn» second look (lib/turn-sweep.ts · AI Soul lib/ask-sweep.ts, owner 2026-10-02 «chats sit in "answer" with nothing to answer»).
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { ownKeys, parseSweep, sweepDue, sweepInput, SWEEP_REDO_MIN, type SweepChat } from "@/lib/turn-sweep";

const chats: SweepChat[] = [
  { id: "cdec0428-0000-4000-8000-000000000001", title: "What do I need to answer", at: "2026-10-02T06:43:21Z", tail: "Do you have the final file? (yes/no)" },
  { id: "78813efc-0000-4000-8000-000000000002", title: "Link preview", at: "2026-10-02T05:35:01Z", tail: "Open the link and log in — it closes at 3 pm." },
];

describe("«Your turn» second look", () => {
  it("reads the AI's reply — 8-character ids, known kinds only, keep and strangers dropped", () => {
    const raw = '```json\n{"chats":[{"id":"cdec0428","kind":"relay"},{"id":"78813efc","kind":"expired"},{"id":"ffffffff","kind":"moot"},{"id":"cdec0428","kind":"moot"}]}\n```';
    expect(parseSweep(raw, chats)).toEqual([{ id: chats[0]!.id, kind: "relay" }, { id: chats[1]!.id, kind: "expired" }]);
    expect(parseSweep('{"chats":[{"id":"cdec0428","kind":"keep"},{"id":"78813efc","kind":"close"}]}', chats)).toEqual([]);
    expect(parseSweep("no idea", chats)).toBeNull();
  });
  it("lets neither chat go when two share the same first 8 characters (the wrong one could close)", () => {
    const twins: SweepChat[] = [...chats, { ...chats[0]!, id: "cdec0428-0000-4000-8000-000000000003", title: "Another" }];
    expect(parseSweep('{"chats":[{"id":"cdec0428","kind":"moot"},{"id":"78813efc","kind":"expired"}]}', twins)).toEqual([{ id: chats[1]!.id, kind: "expired" }]);
  });
  it("never spends gift or bought credit — only the member's own keys and plans", () => {
    expect(ownKeys({ credit: "u1", openai: "k" })).toEqual({ openai: "k" });
    expect(ownKeys({ credit: "u1" })).toEqual({});
  });
  it("looks again only when something changed or enough time passed", () => {
    const now = Date.parse("2026-10-02T08:00:00Z");
    expect(sweepDue({ swept: null, fresh: true, newest: null }, now)).toBe(true);
    expect(sweepDue({ swept: "2026-10-02T07:50:00Z", fresh: false, newest: "2026-10-02T07:40:00Z" }, now)).toBe(false);
    expect(sweepDue({ swept: "2026-10-02T07:50:00Z", fresh: false, newest: "2026-10-02T07:55:00Z" }, now)).toBe(true);
    expect(sweepDue({ swept: new Date(now - (SWEEP_REDO_MIN + 1) * 60_000), fresh: false, newest: null }, now)).toBe(true);
  });
  it("shows the time in the member's zone and what they wrote in every chat", () => {
    const s = sweepInput(chats, [{ chat: "b2338516-x", title: "Status", at: "2026-10-02T06:58:41Z", text: "leave it as it is" }], "Asia/Seoul", Date.parse("2026-10-02T07:10:00Z"));
    expect(s).toContain("Now: 2 Oct, 16:10");
    expect(s).toContain("chat cdec0428 «What do I need to answer»");
    expect(s).toContain("chat b2338516 «Status»: leave it as it is");
  });
});

const URL = process.env.TEST_DATABASE_URL;
describe.skipIf(!URL)("«Your turn» second look (database)", () => {
  let db: typeof import("@/lib/db");
  let sw: typeof import("@/lib/turn-sweep");
  let uid = "";
  const conv = async (msgs: Array<[string, number, boolean?]>, done = false) => {
    const id = (await db.one<{ id: string }>("insert into conversations(user_id, title, done) values ($1, 'x', $2) returning id", [uid, done]))!.id;
    for (const [role, minsAgo, asks] of msgs) await db.q("insert into messages(conversation_id, role, content, created_at, asks) values ($1, $2, 'x', now() - make_interval(mins => $3), $4)", [id, role, minsAgo, asks ?? null]);
    return id;
  };
  beforeAll(async () => {
    const name = `uc_ts_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin if not exists (select 1 from pg_roles where rolname = 'unchore_member') then create role unchore_member nologin; end if; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    sw = await import("@/lib/turn-sweep");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'Asia/Seoul', now()) returning id", [`ts-${randomUUID()}@t.test`]))!.id;
  }, 60_000);

  it("finds only old-enough waiting chats and lets go only those still waiting", async () => {
    const wait = await conv([["user", 40], ["assistant", 30, true]]);
    const fresh = await conv([["user", 6], ["assistant", 5, true]]);          // answered 5 min ago — the per-answer judge first
    await conv([["user", 40], ["assistant", 30, false]]);                      // not waiting
    await conv([["user", 40], ["assistant", 30, true]], true);                 // done
    const replied = await conv([["user", 50], ["assistant", 40, true]]);
    const rows = await sw.waitingChats(uid);
    expect(rows.map((r) => r.conv_id).sort()).toEqual([wait, replied].sort());
    expect(rows.some((r) => r.conv_id === fresh)).toBe(false);
    await db.q("insert into messages(conversation_id, role, content) values ($1, 'user', 'my reply')", [replied]);   // the member writes meanwhile
    expect(await sw.markSwept(rows.map((r) => r.msg_id), rows.map((r) => r.msg_id))).toBe(1);
    const asks = await db.q<{ conversation_id: string; asks: boolean; turn_swept_at: string | null }>("select conversation_id, asks, turn_swept_at from messages where role = 'assistant' and conversation_id = any($1::uuid[])", [[wait, replied]]);
    expect(asks.find((a) => a.conversation_id === wait)!.asks).toBe(false);
    expect(asks.find((a) => a.conversation_id === replied)!.asks).toBe(true);
    expect(asks.every((a) => a.turn_swept_at)).toBe(true);
  }, 30_000);

  it("a member with no key of their own is left to the per-answer rule (no AI, no credit)", async () => {
    expect(await sw.turnSweep(Date.now() + 60_000)).toEqual({ members: 0, let_go: 0 });
  }, 30_000);
});
