// The answer goes on without the page (2026-10-01 owner: «close the chat or go to another site — it keeps working and tells you
// when it's done»). On a real Postgres: the chat is marked «answering» while the answer is made and unmarked after, and only
// ■ Stop (by turn number) cuts it — a page that let go does not. Skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", async (orig) => {
  const real = await orig<typeof import("@/lib/ai")>();
  return {
    ...real,
    userKeys: async () => ({ anthropic: "test-key" }),
    complete: async () => "",
    // A slow AI: one piece every 200 ms for 6 s, cut by the signal like the real one.
    streamChat: async function* (o: { signal?: AbortSignal }) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (o.signal?.aborted) throw new Error("This operation was aborted");
        yield `p${i} `;
      }
    },
  };
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("answers keep going without the page (database)", () => {
  let db: typeof import("@/lib/db");
  let turn: typeof import("@/lib/turn");
  let uid = "";
  const user = () => ({ id: uid, lang: "en", tz: "Asia/Seoul", default_model: "claude-sonnet-5" });
  const answering = (c: string) => db.one<{ s: string | null }>("select answering_since::text as s from conversations where id = $1", [c]).then((r) => r?.s ?? null);

  beforeAll(async () => {
    const name = `uc_bg_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    turn = await import("@/lib/turn");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'Asia/Seoul', now()) returning id", [`bg-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("a page that let go doesn't stop the answer; the chat is «answering» until it is saved", async () => {
    const page = new AbortController();
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'bg') returning id", [uid]))!.id;
    const job = db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "write a long thing", turn: randomUUID() },
      { signal: page.signal, send: () => { if (page.signal.aborted) throw new Error("reader gone"); } }));
    // the answer so far is there for another tab or device (lib/conv-sync.ts), locked like all chat text — waited for, not a fixed
    // 0.8 s: on a busy machine the turn's setup alone took longer, so the first draft wasn't written yet (failed 2 of 3 on main, 2026-10-02)
    let drafted: { t: string | null } | null = null;
    for (const t0 = Date.now(); Date.now() - t0 < 4000; await new Promise((r) => setTimeout(r, 100))) {
      drafted = await db.one<{ t: string | null }>("select answering_text as t from conversations where id = $1", [conv]);
      if (drafted?.t) break;
    }
    expect(await answering(conv)).not.toBeNull();
    expect(drafted?.t?.startsWith("enc:")).toBe(true);
    page.abort();   // the window closed (the chat route passes the page's signal) — with a turn number that alone stops nothing
    const meta = await job;
    expect(meta.stopped).toBeUndefined();
    const saved = await db.one<{ content: string }>("select content from messages where id = $1", [meta.messageId]);
    expect(saved).toBeTruthy();
    expect(await answering(conv)).toBeNull();
    expect((await db.one<{ t: string | null }>("select answering_text as t from conversations where id = $1", [conv]))?.t).toBeNull();
  }, 30_000);

  it("■ Stop by turn number cuts it within about 2 s; an old stop never hits the next answer", async () => {
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'stop') returning id", [uid]))!.id;
    const t1 = randomUUID();
    const t0 = Date.now();
    const job = db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "stop me", turn: t1 }));
    await new Promise((r) => setTimeout(r, 500));
    await db.q("update users set stop_turn = $2 where id = $1", [uid, t1]);
    const meta = await job;
    expect(meta.stopped).toBe(true);
    expect(Date.now() - t0).toBeLessThan(4000);
    const cut = await db.one<{ asks: boolean | null; content: string }>("select asks, content from messages where id = $1", [meta.messageId]);
    expect(cut?.asks).toBe(false);   // stopped by the member: not «your turn»
    const { unlock } = await import("@/lib/privacy");
    expect(unlock(cut!.content)).toMatch(/■ Stopped\.$/);   // and it says so, not «the AI couldn't answer»
    expect(await answering(conv)).toBeNull();
    // ■ Stop on the screen: the stop is saved first, then the page lets go — the answer stops at once, not at the next 2-s look
    const t2 = randomUUID(), page = new AbortController();
    const job2 = db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "stop me fast", turn: t2 }, { signal: page.signal }));
    await new Promise((r) => setTimeout(r, 2300));   // just after a 2-s look
    await db.q("update users set stop_turn = $2 where id = $1", [uid, t2]);
    const t3 = Date.now();
    page.abort();
    expect((await job2).stopped).toBe(true);
    expect(Date.now() - t3).toBeLessThan(1500);
    // the next turn has its own number: the stop left in users.stop_turn doesn't touch it
    const next = await db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "and now this", turn: randomUUID() }));
    expect(next.stopped).toBeUndefined();
  }, 30_000);

  it("without a turn number a page that let go cuts the answer — the broken answer waits for the member («your turn»), never tidied into «Done»", async () => {
    const page = new AbortController();
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'old page') returning id", [uid]))!.id;
    const job = db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "from an old page" }, { signal: page.signal }));
    await new Promise((r) => setTimeout(r, 500));
    page.abort();
    const meta = await job;
    expect((await db.one<{ asks: boolean | null }>("select asks from messages where id = $1", [meta.messageId]))?.asks).toBe(true);
  }, 30_000);
});
