// «How to answer me», learned per member each night (lib/answer-style.ts + db/migrations/027). The database part is skipped
// without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { pickMemories } from "@/lib/memory";
import { repeated, styleInput, styleSignals, type Turn } from "@/lib/answer-style";

const H = 3_600_000;
const now = Date.parse("2026-10-02T04:30:00Z");
const chat = (conv: string, at: number, ...lines: [Turn["role"], string][]): Turn[] => lines.map(([role, text], i) => ({ conv, role, text, at: at + i * 60_000 }));

describe("style signals", () => {
  it("counts pushback after an answer, yesterday and this week, and needs it twice before a line", () => {
    const old = chat("a", now - 3 * 24 * H, ["user", "q1"], ["assistant", "long answer"], ["user", "simpler please"]);
    const fresh = chat("b", now - 2 * H, ["user", "q2"], ["assistant", "jargon answer"], ["user", "I don't understand"]);
    const s = styleSignals([...old, ...fresh], now);
    expect(s.week).toEqual({ plain: 2, fix: 0 });
    expect(s.day).toEqual({ plain: 1, fix: 0 });
    expect(s.cases[1]).toMatchObject({ kind: "plain", question: "q2", answer: "jargon answer" });
    expect(repeated(s)).toEqual(["plain"]);
    expect(repeated(styleSignals(fresh, now))).toEqual([]);           // once is not a pattern
    expect(repeated(styleSignals(old, now))).toEqual([]);             // nothing yesterday → not tonight
  });

  it("ignores reminder posts, failures, other chats and plain thanks", () => {
    const t = [
      ...chat("a", now - H, ["user", "q"], ["assistant", "a"]),
      ...chat("b", now - H + 5_000, ["user", "that's wrong"]),         // another chat — not a reply to «a»
      ...chat("c", now - H, ["assistant", "note"], ["user", "⏰ that's wrong"]),
      ...chat("d", now - H, ["user", "q"], ["assistant", "a"], ["user", "thanks!"]),
    ];
    const s = styleSignals(t, now);
    expect(s.week).toEqual({ plain: 0, fix: 0 });
  });

  it("the model input has the language, existing lines and scrubbed exchanges", () => {
    const s = styleSignals(chat("a", now - H, ["user", "mail me at kim@example.com"], ["assistant", "Sure"], ["user", "that's wrong"]), now);
    const inp = styleInput(s.cases, [{ id: "m1", text: "Prefers short answers", created_at: "" }], "ko");
    expect(inp).toContain("Language: Korean");
    expect(inp).toContain("[m1] Prefers short answers");
    expect(inp).toContain("said it missed");
    expect(inp).not.toContain("kim@example.com");
  });

  it("style lines always ride along, whatever the question is about", () => {
    const facts = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, text: `works on project number ${i} in sales`, created_at: "" }));
    const got = pickMemories("sales project", [...facts, { id: "s", text: "Prefers the conclusion first", created_at: "", kind: "style" }], 5);
    expect(got[0]!.id).toBe("s");
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("answer style (database)", () => {
  let db: typeof import("@/lib/db");
  let st: typeof import("@/lib/answer-style");
  // a zone where it is 04:xx right now, so the nightly pass picks the member up
  const h = new Date().getUTCHours(), off = ((4 - h + 36) % 24) - 12;
  const tz = off === 0 ? "Etc/GMT" : off > 0 ? `Etc/GMT-${off}` : `Etc/GMT+${-off}`;

  beforeAll(async () => {
    const name = `uc_style_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    st = await import("@/lib/answer-style");
  }, 30_000);

  async function member(memoryOn = true): Promise<string> {
    const uid = (await db.one<{ id: string }>("insert into users(email, tz, lang, memory_on) values ($1, $2, 'en', $3) returning id", [`s-${randomUUID()}@t.test`, tz, memoryOn]))!.id;
    for (const [ago, next] of [[2, "simpler please"], [30, "I don't understand"]] as const) {
      const c = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 't') returning id", [uid]))!.id;
      for (const [i, [role, text]] of ([["user", "explain the contract"], ["assistant", "Pursuant to clause 4(b)…"], ["user", next]] as const).entries())
        await db.q(`insert into messages(conversation_id, role, content, created_at) values ($1, $2, $3, now() - interval '${ago} hours' + interval '${i} minutes')`, [c, role, text]);
    }
    return uid;
  }
  const fake = (text: string, cost = 0.0015) => async () => ({ text, costMicro: Math.round(cost * 1e6) });

  it("writes a style line for a repeated «simpler», logs the run and its cost, and runs once per night", async () => {
    const uid = await member();
    const r = await st.nightlyStyle(Date.now() + 60_000, Date.now(), fake('{"ops":[{"op":"add","text":"Prefers plain everyday words over legal terms"}]}'));
    expect(r).toMatchObject({ checked: 1, targeted: 1, wrote: 1, failed: 0, costMicro: 1500 });
    const m = await db.q<{ text: string; kind: string }>("select text, kind from memories where user_id = $1", [uid]);
    expect(m).toHaveLength(1);
    expect(m[0]!.kind).toBe("style");
    const runs = await db.one<{ n: number; c: string }>("select count(*)::int as n, sum(cost_micro) as c from style_review_runs");
    expect(runs).toMatchObject({ n: 1, c: "1500" });
    const again = await st.nightlyStyle(Date.now() + 60_000, Date.now(), fake('{"ops":[{"op":"add","text":"Another line"}]}'));
    expect(again.checked).toBe(0);                                     // already done tonight
  });

  it("skips members with memory off, never deletes, and stops at the daily cap", async () => {
    const off = await member(false);
    const r = await st.nightlyStyle(Date.now() + 60_000, Date.now(), fake('{"ops":[{"op":"add","text":"Prefers short answers"}]}'));
    expect(r.wrote).toBe(0);
    expect((await db.q("select 1 from memories where user_id = $1", [off]))).toHaveLength(0);
    await db.q("insert into style_review_runs(checked, cost_micro) values (1, 100000000)");   // $100 today → over ₩10,000
    await member();
    const capped = await st.nightlyStyle(Date.now() + 60_000, Date.now(), fake('{"ops":[{"op":"delete","id":"x"}]}'));
    expect(capped).toMatchObject({ capped: true, checked: 0 });
  });
});
