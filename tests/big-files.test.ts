// Files over 50 MB, up to 500 MB (AI Soul big attachments, owner «yes» 10/2 21:40): pieces stay as they came and are read one at a
// time (lib/big-files.ts), 1 GB per member, an upload cut off goes on from the pieces already sent, the worker transcribes from the
// pieces in order (worker/media.mjs piecesTo). The database part runs with TEST_DATABASE_URL (CI starts one).
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BIG_FILES_QUOTA, MAX_BIG_UPLOAD, ONE_ROW_MAX, PART_BYTES, pieceLen } from "@/lib/upload-limits";
import { piecesTo } from "../worker/media.mjs";

const URL = process.env.TEST_DATABASE_URL;
const MB = 1024 * 1024;

describe("big upload sizes", () => {
  it("500 MB at most, one row up to 50 MB, 1 GB of big files per member", () => {
    expect(MAX_BIG_UPLOAD).toBe(500 * MB);
    expect(ONE_ROW_MAX).toBe(50 * MB);
    expect(BIG_FILES_QUOTA).toBe(1024 * MB);
    expect(PART_BYTES).toBeLessThan(4.5 * 1000 * 1000);   // under Vercel's request cap
  });
  it("every piece has one exact length — only the last is shorter", () => {
    const size = 2 * PART_BYTES + 10;
    expect([0, 1, 2].map((i) => pieceLen(size, i))).toEqual([PART_BYTES, PART_BYTES, 10]);
    expect(pieceLen(PART_BYTES, 0)).toBe(PART_BYTES);
    expect(Math.ceil(MAX_BIG_UPLOAD / PART_BYTES)).toBeLessThanOrEqual(200);   // the worker reads at most 200 pieces
  });
});

describe("worker reads the pieces in order", () => {
  let dir = "";
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "uc-big-")); });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
  it("appends piece after piece into one file", async () => {
    const asked: number[] = [];
    await piecesTo(async (i: number) => { asked.push(i); return Buffer.from(`p${i};`); }, 3)(join(dir, "a"));
    expect(asked).toEqual([0, 1, 2]);
    expect(await readFile(join(dir, "a"), "utf8")).toBe("p0;p1;p2;");
  });
  it("a missing piece stops it — never half a file taken as whole", async () => {
    await expect(piecesTo(async (i: number) => (i === 1 ? null : Buffer.from("x")), 3)(join(dir, "b"))).rejects.toThrow(/piece 2 of 3/);
  });
});

describe("a byte range read piece by piece", () => {
  const whole = randomBytes(2 * PART_BYTES + 1000);
  const asked: number[] = [];
  beforeAll(() => {
    vi.doMock("@/lib/db", () => ({
      one: async (_sql: string, [, i]: [string, number]) => { asked.push(i); const b = whole.subarray(i * PART_BYTES, (i + 1) * PART_BYTES); return b.length ? { data: Buffer.from(b) } : null; },
      q: async () => [],
    }));
  });
  afterAll(() => { vi.doUnmock("@/lib/db"); });
  const read = async (from: number, to: number) => {
    const { bigStream } = await import("@/lib/big-files");
    return Buffer.from(await new Response(bigStream(randomUUID(), from, to)).arrayBuffer());
  };
  it("the whole file, same bytes", async () => { expect((await read(0, whole.length - 1)).equals(whole)).toBe(true); });
  it("a range across a piece edge reads only the pieces it needs", async () => {
    asked.length = 0;
    const from = PART_BYTES - 5, to = PART_BYTES + 4;
    expect((await read(from, to)).equals(whole.subarray(from, to + 1))).toBe(true);
    expect(asked).toEqual([0, 1]);
  });
  it("Safari's first ask (bytes 0-1) reads one piece", async () => {
    asked.length = 0;
    expect((await read(0, 1)).equals(whole.subarray(0, 2))).toBe(true);
    expect(asked).toEqual([0]);
  });
});

describe.skipIf(!URL)("big files (database)", () => {
  let db: typeof import("@/lib/db");
  let bf: typeof import("@/lib/big-files");
  let pv: typeof import("@/lib/privacy");
  let uid = "";
  beforeAll(async () => {
    vi.doUnmock("@/lib/db");
    vi.resetModules();
    process.env.UNCHORE_SECRET_KEY ??= randomBytes(32).toString("base64");
    const name = `uc_big_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    bf = await import("@/lib/big-files");
    pv = await import("@/lib/privacy");
    uid = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`b-${randomUUID()}@t.test`]))!.id;
  });
  const bigFile = async (size: number, pieces: Buffer[]) => {
    const up = (await db.one<{ id: string }>("insert into uploads(user_id, name, mime, size, parts) values ($1, 'v.mp4', 'video/mp4', $2, $3) returning id", [uid, size, pieces.length]))!.id;
    for (const [i, p] of pieces.entries()) await db.q("insert into upload_parts(upload_id, user_id, idx, data) values ($1, $2, $3, $4)", [up, uid, i, pv.lockBytes(p)]);
    return up;
  };
  it("pieces of an upload on its way aren't served; once it's a file they are, unlocked", async () => {
    const up = await bigFile(60 * MB, [Buffer.from("hello"), Buffer.from("world")]);
    expect(await bf.piecesHave(up, uid)).toEqual([0, 1]);
    expect(await bf.bigPiece(up, 0)).toBeNull();
    await db.q("insert into files(user_id, name, mime, size, data, parts_of) values ($1, 'v.mp4', 'video/mp4', $2, ''::bytea, $3)", [uid, 60 * MB, up]);
    expect((await bf.bigPiece(up, 1))!.toString()).toBe("world");
  });
  it("1 GB of big files per member — the next one is refused before it starts, small ones always fit", async () => {
    expect(await bf.bigUsed(uid)).toBe(60 * MB);
    expect((await bf.bigRoom(uid, 500 * MB)).ok).toBe(true);
    const up = await bigFile(500 * MB, [Buffer.from("x")]);
    await db.q("insert into files(user_id, name, mime, size, data, parts_of) values ($1, 'w.mp4', 'video/mp4', $2, ''::bytea, $3)", [uid, 500 * MB, up]);
    const r = await bf.bigRoom(uid, 500 * MB);
    expect(r).toMatchObject({ ok: false, used: 560 * MB, max: BIG_FILES_QUOTA });
    expect((await bf.bigRoom(uid, 40 * MB)).ok).toBe(true);
  });
  it("the nightly sweep keeps a kept big file's pieces and drops pieces left half-way", async () => {
    const kept = (await db.one<{ parts_of: string }>("select parts_of from files where user_id = $1 and name = 'v.mp4'", [uid]))!.parts_of;
    const left = await bigFile(60 * MB, [Buffer.from("half")]);
    await db.q("update upload_parts set created_at = now() - interval '2 days'");
    await bf.sweepPieces();
    expect(await bf.piecesHave(kept, uid)).toEqual([0, 1]);
    expect(await bf.piecesHave(left, uid)).toEqual([]);
  });
});
