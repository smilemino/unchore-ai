// «Alerts in» on a real Postgres (lib/inbox-hooks.ts): the key works and a wrong one doesn't, a new key stops the old one,
// a turned-off address refuses, the hourly limit holds, the note lands in the picked chat (or a new one), and another member
// sees none of it. Skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({ pushUser: async () => 0 }));
const URL_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_DB)("alerts in (database)", () => {
  let db: typeof import("@/lib/db");
  let ih: typeof import("@/lib/inbox-hooks");
  let privacy: typeof import("@/lib/privacy");
  let a = "", b = "";
  const keyOf = (url: string) => new globalThis.URL(url).searchParams.get("key");
  const idOf = (url: string) => new globalThis.URL(url).pathname.split("/").pop()!;

  beforeAll(async () => {
    const name = `uc_ih_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL_DB }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL_DB!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    ih = await import("@/lib/inbox-hooks");
    privacy = await import("@/lib/privacy");
    a = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'UTC') returning id", [`a-${randomUUID()}@t.test`]))!.id;
    b = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'UTC') returning id", [`b-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("a new address makes its own chat; the key works, a wrong one doesn't; another member sees nothing", async () => {
    const made = (await db.asMember(a, () => ih.createHook(a, "My shop", null)))!;
    const id = made.row.id;
    expect((await ih.receive(id, "uci_wrongwrongwrongwrongwrong", "hi", null)).status).toBe(401);
    expect((await ih.receive(id, null, "hi", null)).status).toBe(401);
    expect((await ih.receive(id, made.key, "  ", null)).status).toBe(400);
    const r = await ih.receive(id, made.key, JSON.stringify({ text: "New order" }), "application/json");
    expect(r.status).toBe(200);
    const m = await db.one<{ content: string; role: string; asks: boolean }>("select content, role, asks from messages where conversation_id = $1", [r.conversation_id]);
    expect(privacy.unlock(m!.content)).toBe("🔔 «My shop»\n\nNew order");
    expect(m!.asks).toBe(false);
    expect((await db.asMember(a, () => ih.listHooks(a)))[0]!.conversation_id).toBe(r.conversation_id);
    expect(await db.asMember(b, () => ih.listHooks(b))).toEqual([]);
    expect(await db.asMember(b, () => ih.deleteHook(b, id))).toBe(false);
    expect(await db.asMember(b, () => ih.rekeyHook(b, id))).toBeNull();
  });

  it("goes to the chat the member picked; never to another member's chat", async () => {
    const mine = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 't') returning id", [a]))!.id;
    const theirs = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 't') returning id", [b]))!.id;
    expect(await db.asMember(a, () => ih.createHook(a, "x", theirs))).toBeNull();
    const made = (await db.asMember(a, () => ih.createHook(a, "Server", mine)))!;
    expect((await ih.receive(made.row.id, made.key, "Disk full", "text/plain")).conversation_id).toBe(mine);
    expect(await db.asMember(a, () => ih.updateHook(a, made.row.id, { conversation_id: theirs }))).toBe(false);
  });

  it("a new key stops the old one; turned off refuses; the hourly limit holds", async () => {
    const made = (await db.asMember(a, () => ih.createHook(a, "Zap", null)))!;
    const id = made.row.id;
    const url = (await db.asMember(a, () => ih.rekeyHook(a, id)))!;
    expect((await ih.receive(id, made.key, "hi", null)).status).toBe(401);
    expect((await ih.receive(id, url, "hi", null)).status).toBe(200);
    expect(await db.asMember(a, () => ih.updateHook(a, id, { enabled: false }))).toBe(true);
    expect((await ih.receive(id, url, "hi", null)).status).toBe(403);
    expect(await db.asMember(a, () => ih.updateHook(a, id, { enabled: true, per_hour: 2 }))).toBe(true);
    expect(await db.asMember(a, () => ih.updateHook(a, id, { per_hour: 0 }))).toBe(false);
    const got = [];
    for (let i = 0; i < 3; i++) got.push((await ih.receive(id, url, `n${i}`, null)).status);
    expect(got).toEqual([200, 429, 429]);   // 1 already this hour (above) + 1 → the limit of 2
    expect(keyOf(ih.hookUrl("https://x", id, url))).toBe(url);
    expect(idOf(ih.hookUrl("https://x", id))).toBe(id);
  });

  it("at most 10 addresses a member; deleting one keeps its chat", async () => {
    for (let i = 0; i < 10; i++) await db.asMember(b, () => ih.createHook(b, `h${i}`, null));
    expect(await db.asMember(b, () => ih.createHook(b, "one more", null))).toBeNull();
    const made = (await db.asMember(a, () => ih.createHook(a, "Gone", null)))!;
    const r = await ih.receive(made.row.id, made.key, "last", null);
    expect(await db.asMember(a, () => ih.deleteHook(a, made.row.id))).toBe(true);
    expect((await ih.receive(made.row.id, made.key, "hi", null)).status).toBe(404);
    expect(await db.one("select 1 from conversations where id = $1", [r.conversation_id])).not.toBeNull();
  });
});
