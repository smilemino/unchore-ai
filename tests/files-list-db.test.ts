// Settings «My files» (lib/files-list.ts) on a real Postgres: newest first, found by name, «%» typed is a letter, only the member's own.
// Skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { findWords, likeText } from "@/lib/files-list";

const URL = process.env.TEST_DATABASE_URL;

describe("file name search text", () => {
  it("keeps % and _ as letters", () => { expect(likeText("50%_off")).toBe("50\\%\\_off"); });
  it("splits the box into words, no repeats, at most 6", () => {
    expect(findWords("  재고  표 재고 ")).toEqual(["재고", "표"]);
    expect(findWords("a b c d e f g")).toHaveLength(6);
    expect(findWords("   ")).toEqual([]);
  });
});

describe.skipIf(!URL)("my files (database)", () => {
  let db: typeof import("@/lib/db");
  let fl: typeof import("@/lib/files-list");
  let uid = "", other = "";
  beforeAll(async () => {
    const name = `uc_files_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    fl = await import("@/lib/files-list");
    uid = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`f-${randomUUID()}@t.test`]))!.id;
    other = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`g-${randomUUID()}@t.test`]))!.id;
    const add = (u: string, n: string, made: boolean, at: string) => db.q("insert into files(user_id, name, mime, size, data, made, created_at) values ($1,$2,'text/plain',2048,'x',$3,$4)", [u, n, made, at]);
    await add(uid, "재고표.xlsx", false, "2026-10-01T01:00:00Z");
    await add(uid, "50%_할인.png", true, "2026-10-02T01:00:00Z");
    await add(other, "재고표-남의것.xlsx", false, "2026-10-02T02:00:00Z");
  }, 30_000);

  it("lists only the member's files, newest first", async () => {
    const r = await fl.listFiles(uid, "");
    expect(r.map((f) => f.name)).toEqual(["50%_할인.png", "재고표.xlsx"]);
    expect(r[0]).toMatchObject({ made: true, size: 2048 });
  });

  it("finds by part of the name; a typed % is a letter", async () => {
    expect((await fl.listFiles(uid, "재고")).map((f) => f.name)).toEqual(["재고표.xlsx"]);
    expect((await fl.listFiles(uid, "50%")).map((f) => f.name)).toEqual(["50%_할인.png"]);
    expect(await fl.listFiles(uid, "%")).toHaveLength(1);
    expect(await fl.listFiles(uid, "없는이름")).toEqual([]);
  });

  it("finds by several words in any order, spaces in the name ignored", async () => {
    expect((await fl.listFiles(uid, "xlsx 재고")).map((f) => f.name)).toEqual(["재고표.xlsx"]);
    expect((await fl.listFiles(uid, "할인 50%")).map((f) => f.name)).toEqual(["50%_할인.png"]);
    expect(await fl.listFiles(uid, "재고 없는이름")).toEqual([]);
  });
});
