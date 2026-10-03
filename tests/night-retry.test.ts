// Night retry (lib/night-retry.ts + db/migrations/035): «I don't know» answers asked again overnight with the member's own
// strongest model; a better answer lands in the chat with a «Remember this?» card. The database part is skipped without
// TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { looksUnsure, parseRetry, retryMessage } from "@/lib/night-retry";
import { readRemember } from "@/lib/remember-mark";
import { hideMarks } from "@/lib/chat-setup";
import { unlock } from "@/lib/privacy";

describe("unsure answers", () => {
  it("an answer that ends without the answer counts, in English, Korean and other languages", () => {
    expect(looksUnsure("I searched a few places, but I couldn't confirm the opening hours. You'll need to check their site.")).toBe(true);
    expect(looksUnsure("정확한 영업시간은 확인이 필요합니다.")).toBe(true);
    expect(looksUnsure("Leider weiß ich es nicht. Ich bin mir nicht sicher.")).toBe(true);
    expect(looksUnsure("営業時間はわかりません。")).toBe(true);
  });
  it("a real answer, a hedge far before the end, or a reminder post does not", () => {
    expect(looksUnsure("The store opens at 9:00 and closes at 21:00.")).toBe(false);
    expect(looksUnsure(`I'm not sure about the parking.\n${"Opening hours are 9 to 21 every day. ".repeat(20)}`)).toBe(false);
    expect(looksUnsure("⏰ Reminder — I don't know yet")).toBe(false);
    expect(looksUnsure("")).toBe(false);
  });
});

describe("the stronger model's reply", () => {
  it("takes an answer and a safe line to remember", () => {
    expect(parseRetry('```json\n{"answered":true,"answer":"It opens at 9:00.","remember":"Lives in Busan, so local shops mean Busan."}\n```'))
      .toEqual({ answer: "It opens at 9:00.", remember: "Lives in Busan, so local shops mean Busan." });
  });
  it("drops «still don't know», bad JSON, and private lines to remember", () => {
    expect(parseRetry('{"answered":false}')).toBeNull();
    expect(parseRetry('{"answered":true,"answer":"Sorry, I don\'t know."}')).toBeNull();
    expect(parseRetry("not json")).toBeNull();
    expect(parseRetry('{"answered":true,"answer":"9:00","remember":"Their password is hunter22"}')).toEqual({ answer: "9:00", remember: null });
    expect(parseRetry('{"answered":true,"answer":"9:00","remember":"Goes to the hospital on Mondays"}')!.remember).toBeNull();
    expect(parseRetry('{"answered":true,"answer":"9:00","remember":"Mail goes to kim@example.com"}')!.remember).toBeNull();
  });
  it("the chat message carries the card, and the card's mark is hidden from the text", () => {
    const m = retryMessage("en", { answer: "It opens at 9:00.", remember: "Prefers answers checked on the web" });
    expect(m.startsWith("🌙 I looked again overnight with a stronger model:")).toBe(true);
    expect(readRemember(m)).toBe("Prefers answers checked on the web");
    expect(hideMarks(m)).not.toContain("<<<");
    expect(readRemember(retryMessage("ko", { answer: "9시", remember: null }))).toBeNull();
    expect(retryMessage("ko", { answer: "9시", remember: null })).toContain("밤사이 더 센 모델로");
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("night retry (database)", () => {
  let db: typeof import("@/lib/db");
  let nr: typeof import("@/lib/night-retry");
  let seal: (s: string) => string;
  const h = new Date().getUTCHours(), off = ((4 - h + 36) % 24) - 12;   // a zone where it is 04:xx now
  const tz = off === 0 ? "Etc/GMT" : off > 0 ? `Etc/GMT-${off}` : `Etc/GMT+${-off}`;

  beforeAll(async () => {
    const name = `uc_retry_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    nr = await import("@/lib/night-retry");
    seal = (await import("@/lib/crypto")).seal;
  }, 30_000);

  async function member(o: { memoryOn?: boolean; key?: boolean; later?: boolean } = {}): Promise<{ uid: string; conv: string }> {
    const uid = (await db.one<{ id: string }>("insert into users(email, tz, lang, memory_on) values ($1, $2, 'en', $3) returning id", [`r-${randomUUID()}@t.test`, tz, o.memoryOn ?? true]))!.id;
    if (o.key ?? true) await db.q("insert into user_keys(user_id, provider, enc, hint) values ($1, 'anthropic', $2, '…abcd')", [uid, seal("sk-test")]);
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 't') returning id", [uid]))!.id;
    const lines: [string, string][] = [["user", "When does the city pool open on Sunday?"], ["assistant", "I couldn't confirm that. You'll need to check their site."]];
    if (o.later) lines.push(["user", "never mind"]);
    for (const [i, [role, text]] of lines.entries())
      await db.q(`insert into messages(conversation_id, role, content, created_at) values ($1, $2, $3, now() - interval '2 hours' + interval '${i} minutes')`, [conv, role, text]);
    return { uid, conv };
  }
  const said = async (conv: string) => (await db.q<{ role: string; content: string; model: string | null }>("select role, content, model from messages where conversation_id = $1 order by created_at", [conv])).map((m) => ({ ...m, content: unlock(m.content) }));

  it("answers again with the member's own strongest model, adds the card, and tries each answer once", async () => {
    const { uid, conv } = await member();
    const asked: string[] = [];
    const call = async (o: { model: string; question: string }) => { asked.push(`${o.model}|${o.question}`); return '{"answered":true,"answer":"Sundays from 10:00.","remember":"Prefers answers checked on the web"}'; };
    const r = await nr.nightRetry(Date.now() + 60_000, Date.now(), call);
    expect(r).toMatchObject({ told: 1 });
    expect(asked).toEqual(["claude-opus-5-5|When does the city pool open on Sunday?"]);
    const m = await said(conv);
    expect(m).toHaveLength(3);
    expect(m[2]).toMatchObject({ role: "assistant", model: "claude-opus-5-5" });
    expect(m[2]!.content).toContain("Sundays from 10:00.");
    expect(readRemember(m[2]!.content)).toBe("Prefers answers checked on the web");
    expect(await db.q("select 1 from memories where user_id = $1", [uid])).toHaveLength(0);   // saved only after «Remember»
    asked.length = 0;
    await nr.retryMember(uid, "en", call);
    expect(asked).toEqual([]);                                                               // already tried
  });

  it("leaves members with memory off, no key of their own, or a chat that moved on; a «still don't know» adds nothing", async () => {
    const a = await member({ memoryOn: false }), b = await member({ key: false }), c = await member({ later: true }), d = await member();
    const call = async (o: { question: string }) => (o.question.includes("pool") ? '{"answered":false}' : "");
    await nr.nightRetry(Date.now() + 60_000, Date.now(), call);
    for (const x of [a, b, d]) expect(await said(x.conv)).toHaveLength(2);
    expect(await said(c.conv)).toHaveLength(3);
  });
});
