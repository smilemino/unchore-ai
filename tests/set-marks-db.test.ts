// Settings changed by asking in the chat (lib/set-marks.ts) on a real Postgres, as the member. Skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("settings by asking (database)", () => {
  let db: typeof import("@/lib/db");
  let sm: typeof import("@/lib/set-marks");
  let uid = "";
  const me = () => db.one<{ lang: string; theme: string; tz: string; default_model: string | null; memory_on: boolean; instructions: string; name: string | null }>(
    "select lang, theme, tz, default_model, memory_on, instructions, name from users where id = $1", [uid]);

  beforeAll(async () => {
    const name = `uc_set_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    sm = await import("@/lib/set-marks");
    uid = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'Asia/Seoul') returning id", [`s-${randomUUID()}@t.test`]))!.id;
    await db.q("insert into user_keys(user_id, provider, enc, hint) values ($1, 'anthropic', 'x', '…abcd')", [uid]);
  }, 30_000);

  it("applies good values and says so; refuses bad ones out loud", async () => {
    const r = await db.asMember(uid, () => sm.applySetMarks(uid, [
      { key: "lang", value: "ko" }, { key: "theme", value: "dark" }, { key: "tz", value: "Europe/London" }, { key: "memory", value: "off" },
      { key: "model", value: "claude-opus-5-5" }, { key: "rules+", value: "항상 표로" }, { key: "tz", value: "Mars/Base" }, { key: "model", value: "gpt-6-sol" },
    ], "ko"));
    expect(await me()).toMatchObject({ lang: "ko", theme: "dark", tz: "Europe/London", memory_on: false, default_model: "claude-opus-5-5", instructions: "항상 표로" });
    expect(r.changed).toMatchObject({ lang: "ko", theme: "dark", memory: "false" });
    expect(r.notes.filter((n) => n.startsWith("⚠"))).toHaveLength(2);   // Mars/Base and a model without its key
    expect(r.notes).toContain("⚙ 화면 밝기: 어둡게");
  });

  it("more instructions add up; «default» model clears; the AI knows the settings now", async () => {
    await db.asMember(uid, () => sm.applySetMarks(uid, [{ key: "rules+", value: "결론 먼저" }, { key: "model", value: "default" }], "en"));
    expect(await me()).toMatchObject({ instructions: "항상 표로\n결론 먼저", default_model: null });
    const g = await db.asMember(uid, () => sm.settingsGuide(uid));
    expect(g).toContain("tz=Europe/London");
    expect(g).toContain("Connected AI: anthropic");
    expect(g).toContain("claude-opus-5-5");
  });

  it("unplugs an AI only by a known name", async () => {
    const r = await db.asMember(uid, () => sm.applySetMarks(uid, [{ key: "disconnect", value: "nope" }, { key: "disconnect", value: "anthropic" }], "en"));
    expect(r.notes[0]).toContain("⚠");
    expect(r.changed.keys).toBe("1");
    expect((await db.one<{ n: number }>("select count(*)::int as n from user_keys where user_id = $1", [uid]))!.n).toBe(0);
  });
});
