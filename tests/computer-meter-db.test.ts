// Machine time for the cloud computer and the browser (lib/computer-meter.ts · owner 2026-10-03): 30 free minutes a month per
// member, then their bought credit at cost; all members' free minutes together capped at ₩100,000 a month — the owner can add more
// for the month after being asked (house_settings, 039); owners not metered.
// On a real Postgres; skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("machine time (database)", () => {
  let db: typeof import("@/lib/db");
  let m: typeof import("@/lib/computer-meter");
  let credits: typeof import("@/lib/credits");
  let run: typeof import("@/lib/tools/run");
  const newMember = async () => (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'UTC', now()) returning id", [`m-${randomUUID()}@t.test`]))!.id;

  beforeAll(async () => {
    const name = `uc_meter_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    delete process.env.UNCHORE_COMPUTER_FREE_MIN; delete process.env.UNCHORE_COMPUTER_USD_PER_MIN; delete process.env.UNCHORE_COMPUTER_FREE_MONTH_KRW; delete process.env.UNCHORE_KRW_PER_USD;
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    m = await import("@/lib/computer-meter");
    credits = await import("@/lib/credits");
    run = await import("@/lib/tools/run");
  }, 30_000);

  it("gives 30 free minutes, then needs bought credit", async () => {
    const u = await newMember();
    expect(await m.freeLeft(u)).toBe(30);
    expect((await m.allowance(u)).ok).toBe(true);
    const r = await m.record(u, 20);
    expect(r).toMatchObject({ free: 20, paid: 0, charged: 0 });
    expect(await m.freeLeft(u)).toBeCloseTo(10, 5);
    const r2 = await m.record(u, 15);             // 10 free + 5 paid — no credit yet, the balance goes below zero once
    expect(r2.free).toBeCloseTo(10, 5);
    expect(r2.paid).toBeCloseTo(5, 5);
    expect(await m.freeLeft(u)).toBe(0);
    expect(await m.allowance(u)).toEqual({ ok: false, why: "used_up" });
  });

  it("takes machine time from bought credit at cost once the free minutes are gone", async () => {
    const u = await newMember();
    await m.record(u, 30);
    await credits.topUp(u, 5 * credits.MICRO, `cs_${randomUUID()}`, "test top-up");
    const before = (await credits.wallet(u)).micro;
    expect((await m.allowance(u)).ok).toBe(true);
    const r = await m.record(u, 10);
    expect(r.free).toBe(0);
    expect(r.charged).toBe(Math.round(10 * 0.006 * credits.MICRO));
    expect((await credits.wallet(u)).micro).toBe(before - r.charged);
  });

  it("stops the free part for everyone at the month's ₩ pool, and opens again when the owner adds more", async () => {
    expect(m.freeMonthKrw()).toBe(100_000);
    expect(m.krwPerUsd()).toBe(1365.6);
    process.env.UNCHORE_COMPUTER_FREE_MONTH_KRW = "300";          // ₩300 ≈ $0.22 ≈ 36 minutes at 0.006/min for all members together
    const a = await newMember(), b = await newMember();
    await db.asOwner(() => db.q("delete from credit_ledger where note = 'Cloud computer (free)'"));
    await m.record(a, 30);
    expect(await m.freeLeft(b)).toBe(30);
    await m.record(b, 7);                                          // pool now 37 min ≈ ₩303 ≥ ₩300
    expect((await m.pool()).full).toBe(true);
    expect(await m.freeLeft(b)).toBe(0);
    expect((await m.allowance(b)).ok).toBe(false);
    // the owner says yes to ₩1,000 more this month (reminder-gates/unchore-computer-cap extend)
    await db.asOwner(() => db.q("insert into house_settings(key, value) values ($1, '1000')", [`computer_free_extra_krw:${m.monthKey()}`]));
    expect((await m.pool()).capKrw).toBe(1300);
    expect(await m.freeLeft(b)).toBeCloseTo(23, 5);
    // a member can't read or change the pool
    await expect(db.asMember(b, () => db.q("select * from house_settings"))).rejects.toThrow(/permission denied/);
    delete process.env.UNCHORE_COMPUTER_FREE_MONTH_KRW;
  });

  it("the tool refuses with a plain way forward when time is used up, and owners aren't metered", async () => {
    const u = await newMember();
    await m.record(u, 30);
    const ctx = { userId: u, convId: randomUUID(), lang: "en", tz: "UTC", yes: false, computer: true };
    const out = await run.runTool(ctx, "computer", { action: "run", command: "echo hi" });
    expect(out.ok).toBe(false);
    expect(out.text).toContain("top up credit");
    expect(out.text).toContain("connect their own computer");
    const owner = await run.runTool({ ...ctx, owner: true }, "browser", { action: "open", url: "https://example.com" });
    expect(owner.text).not.toContain("top up credit");          // owners go straight to the tool (here: no tool server in tests)
  });

  it("counts at least a quarter minute, and a block for background work", () => {
    expect(m.minutesFor(1000)).toBe(0.25);
    expect(m.minutesFor(120_000)).toBe(2);
    expect(m.minutesFor(1000, true)).toBe(10.25);
  });
});
