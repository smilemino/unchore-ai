// Sign-ins kept as a hash, not the cookie itself (ported from AI Soul lib/server/auth.ts, 2026-10-02):
// a leaked sessions table can't sign anyone in, and members signed in before the change stay signed in.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (jar.cookie ? { value: jar.cookie } : undefined) }),
  headers: async () => ({ get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) Version/19.0 Mobile/15E148 Safari/604.1" }),
}));

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("sign-ins kept as a hash (database)", () => {
  let db: typeof import("@/lib/db");
  let s: typeof import("@/lib/session");
  let uid = "";
  beforeAll(async () => {
    const name = `uc_sh_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    s = await import("@/lib/session");
    uid = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`h-${randomUUID()}@t.test`]))!.id;
  }, 30_000);
  beforeEach(() => { jar.cookie = undefined; });

  it("a new sign-in stores only the hash; the cookie still works", async () => {
    const raw = await s.createSession(uid);
    expect((await db.q("select 1 from sessions where id = $1", [raw])).length).toBe(0);
    expect((await db.q("select 1 from sessions where id = $1", [hash(raw)])).length).toBe(1);
    jar.cookie = raw;
    expect((await s.currentUser())?.id).toBe(uid);
  });

  it("the hash read off the table is not a cookie", async () => {
    const raw = await s.createSession(uid);
    jar.cookie = hash(raw);
    expect(await s.currentUser()).toBeNull();
    expect(await s.liveSessionKey(hash(raw))).toBeNull();
    await s.endSession();   // nor can it sign the member out
    expect((await db.q("select 1 from sessions where id = $1", [hash(raw)])).length).toBe(1);
  });

  it("a sign-in from before keeps working and moves to its hash on first use", async () => {
    const old = "o".repeat(43);
    await db.q("insert into sessions(id, user_id, expires_at) values ($1, $2, now() + interval '1 day')", [old, uid]);
    jar.cookie = old;
    const u = await s.currentUser();
    expect(u?.id).toBe(uid);
    expect(u && "sid" in u).toBe(false);
    expect((await db.q("select 1 from sessions where id = $1", [old])).length).toBe(0);
    expect((await db.q("select 1 from sessions where id = $1", [hash(old)])).length).toBe(1);
    expect((await s.currentUser())?.id).toBe(uid);
  });

  it("refresh and sign-out work for an old sign-in too; expired ones don't come back", async () => {
    const old = "r".repeat(43);
    await db.q("insert into sessions(id, user_id, expires_at) values ($1, $2, now() + interval '1 day')", [old, uid]);
    expect(await s.liveSessionKey(old)).toBe(hash(old));
    expect((await db.q("select 1 from sessions where id = $1", [hash(old)])).length).toBe(1);
    jar.cookie = old;
    await s.endSession();
    expect((await db.q("select 1 from sessions where id in ($1, $2)", [old, hash(old)])).length).toBe(0);
    const gone = "g".repeat(43);
    await db.q("insert into sessions(id, user_id, expires_at) values ($1, $2, now() - interval '1 day')", [gone, uid]);
    expect(await s.liveSessionKey(gone)).toBeNull();
  });
});

describe("sign-in key", () => {
  it("is the sha-256 of the cookie, 64 characters — never the length of a cookie", async () => {
    vi.doMock("@/lib/db", () => ({ hasDb: () => false, one: async () => null, q: async () => [] }));
    const { sessionKey } = await import("@/lib/session");
    const { token } = await import("@/lib/crypto");
    const raw = token(32);
    expect(raw).toHaveLength(43);
    expect(sessionKey(raw)).toBe(hash(raw));
    expect(sessionKey(raw)).toHaveLength(64);
    vi.doUnmock("@/lib/db");
  });
});
