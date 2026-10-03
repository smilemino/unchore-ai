// «Is it really done?» (lib/keep-going.ts · AI Soul worker/lead-check.ts): check the answer, carry on by itself while there is more.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { KEEP_MARK, KEEP_MAX, keepMessage, keepRounds, parseKeep, pointsOf, shouldKeep } from "@/lib/keep-going";

const member = (content: string) => ({ role: "user", content, auto_turn: false });
const answer = (content: string) => ({ role: "assistant", content });
const auto = (n: number, points: string[]) => ({ role: "user", content: keepMessage("en", n, points), auto_turn: true });
const long = "I made the sheet and filled in the totals. ".repeat(3);
const base = { on: true, tools: true, rounds: 0, ask: "Make me a budget sheet", answer: long, model: "claude-opus-5-5" };

describe("«Is it really done?»", () => {
  it("the message reads to the member and its points read back", () => {
    const c = keepMessage("en", 2, ["Check the totals add up", "Attach the file"]);
    expect(c.split("\n")[0]).toBe(`${KEEP_MARK} Keeping going (2 of ${KEEP_MAX}) — a check of the last answer found more to do:`);
    expect(pointsOf(c)).toEqual(["Check the totals add up", "Attach the file"]);
    expect(c).toMatch(/without my yes/);
  });
  it("counts only its own turns after the member's last message — the member writing starts the count over", () => {
    const h = [member("old task"), answer(long), auto(1, ["a"]), member("new task"), answer(long), auto(1, ["b"]), answer(long), auto(2, ["c", "d"]), answer(long)];
    expect(keepRounds(h)).toEqual({ rounds: 2, lastPoints: "c | d", ask: "new task" });
    expect(keepRounds([answer(long)])).toEqual({ rounds: 0, lastPoints: null, ask: null });
  });
  it("checks only a working answer with tools, under the limit, on the member's own AI, and only when switched on", () => {
    expect(shouldKeep(base)).toBe(true);
    expect(shouldKeep({ ...base, on: false })).toBe(false);
    expect(shouldKeep({ ...base, tools: false })).toBe(false);
    expect(shouldKeep({ ...base, ask: null })).toBe(false);
    expect(shouldKeep({ ...base, rounds: KEEP_MAX })).toBe(false);
    expect(shouldKeep({ ...base, rounds: KEEP_MAX - 1 })).toBe(true);
    expect(shouldKeep({ ...base, answer: "Sure, done." })).toBe(false);
    expect(shouldKeep({ ...base, model: "uc:anthropic/claude-sonnet-5" })).toBe(false);   // credit is never spent on it
  });
  it("reads the verdict — a wrong shape or «more» with nothing to do is no verdict", () => {
    expect(parseKeep('```json\n{"verdict":"more","points":["Open the file and check it"," "]}\n```')).toEqual({ verdict: "more", points: ["Open the file and check it"] });
    expect(parseKeep('{"verdict":"done","points":[]}')).toEqual({ verdict: "done", points: [] });
    expect(parseKeep('{"verdict":"member"}')).toEqual({ verdict: "member", points: [] });
    expect(parseKeep('{"verdict":"more","points":[]}')).toBeNull();
    expect(parseKeep('{"verdict":"maybe"}')).toBeNull();
    expect(parseKeep("looks fine")).toBeNull();
    expect(parseKeep('{"verdict":"more","points":["a","b","c","d"]}')?.points).toHaveLength(3);
  });
});

const URL = process.env.TEST_DATABASE_URL;
describe.skipIf(!URL)("«Is it really done?» (database)", () => {
  let db: typeof import("@/lib/db");
  let kg: typeof import("@/lib/keep-going");
  let uid = "";
  const more = async () => '{"verdict":"more","points":["Check the totals add up"]}';
  const chat = async (msgs: Array<[string, string, boolean?]>) => {
    const id = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'x') returning id", [uid]))!.id;
    let last = "";
    for (const [i, [role, content, a]] of msgs.entries()) last = (await db.one<{ id: string }>("insert into messages(conversation_id, role, content, auto_turn, created_at) values ($1, $2, $3, $4, now() - make_interval(secs => $5)) returning id", [id, role, content, a ?? false, 100 - i]))!.id;
    return { id, last };
  };
  beforeAll(async () => {
    const name = `uc_kg_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin if not exists (select 1 from pg_roles where rolname = 'unchore_member') then create role unchore_member nologin; end if; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    kg = await import("@/lib/keep-going");
    const { seal } = await import("@/lib/crypto");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'UTC', now()) returning id", [`kg-${randomUUID()}@t.test`]))!.id;
    await db.q("insert into user_keys(user_id, provider, enc, hint) values ($1, 'anthropic', $2, '…abcd')", [uid, seal("sk-test")]);
  }, 60_000);

  it("carries on when there is more, stops on the same points again, and stays off when switched off", async () => {
    const u = { id: uid, lang: "en" };
    const c = await chat([["user", "Make me a budget sheet"], ["assistant", long]]);
    const msg = await kg.keepGoing(u, { convId: c.id, messageId: c.last, model: "claude-opus-5-5", tools: true }, more);
    expect(msg).toContain("- Check the totals add up");
    const again = await chat([["user", "Make me a budget sheet"], ["assistant", long], ["user", keepMessage("en", 1, ["Check the totals add up"]), true], ["assistant", long]]);
    expect(await kg.keepGoing(u, { convId: again.id, messageId: again.last, model: "claude-opus-5-5", tools: true }, more)).toBeNull();
    expect(await kg.keepGoing(u, { convId: c.id, messageId: c.last, model: "claude-opus-5-5", tools: true }, async () => '{"verdict":"member","points":[]}')).toBeNull();
    await db.q("update users set keep_going = false where id = $1", [uid]);
    let called = false;
    expect(await kg.keepGoing(u, { convId: c.id, messageId: c.last, model: "claude-opus-5-5", tools: true }, async () => { called = true; return more(); })).toBeNull();
    expect(called).toBe(false);
    await db.q("update users set keep_going = true where id = $1", [uid]);
  }, 30_000);

  it("lets the member go first — a newer message or a waiting one means no extra turn", async () => {
    const u = { id: uid, lang: "en" };
    const c = await chat([["user", "Make me a budget sheet"], ["assistant", long], ["user", "actually make it monthly"]]);
    const first = (await db.one<{ id: string }>("select id from messages where conversation_id = $1 and role = 'assistant'", [c.id]))!.id;
    expect(await kg.keepGoing(u, { convId: c.id, messageId: first, model: "claude-opus-5-5", tools: true }, more)).toBeNull();
    const w = await chat([["user", "Make me a budget sheet"], ["assistant", long]]);
    await db.q("insert into chat_queue(user_id, conversation_id, text) values ($1, $2, 'and a chart')", [uid, w.id]);
    expect(await kg.keepGoing(u, { convId: w.id, messageId: w.last, model: "claude-opus-5-5", tools: true }, more)).toBeNull();
  }, 30_000);
});
