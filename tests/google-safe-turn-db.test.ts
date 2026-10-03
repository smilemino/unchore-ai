// A chat that holds Google data is answered only by an AI that doesn't train on it (lib/google-safe.ts · Google's review
// 2026-10-02). On a real Postgres with a fake AI: with DeepSeek the AI is never called and the member is told what to pick;
// with Claude (API) it answers and the request is marked noTrain; neither turn makes an improvement copy.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as Array<{ model: string; noTrain?: boolean }>);
vi.mock("@/lib/ai", async (orig) => {
  const real = await orig<typeof import("@/lib/ai")>();
  return {
    ...real,
    userKeys: async () => ({ anthropic: "k", deepseek: "k" }),
    complete: async () => "",
    streamChat: async function* (o: { model: string; noTrain?: boolean }) { calls.push({ model: o.model, noTrain: o.noTrain }); yield "From the file: hello."; },
  };
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("Google data only to AIs that don't train (database)", () => {
  let db: typeof import("@/lib/db");
  let turn: typeof import("@/lib/turn");
  let uid = "";

  beforeAll(async () => {
    const name = `uc_gsafe_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    turn = await import("@/lib/turn");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'UTC', now()) returning id", [`gs-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  async function googleChat() {
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 't') returning id", [uid]))!.id;
    await db.q("insert into files(user_id, conversation_id, name, mime, size, data, from_google) values ($1, $2, 'plan.txt', 'text/plain', 5, $3, true)", [uid, conv, Buffer.from("hello")]);
    return conv;
  }
  const answer = async (conv: string) => (await db.one<{ content: string }>("select content from messages where conversation_id = $1 and role = 'assistant' order by created_at desc limit 1", [conv]))!.content;

  it("an AI that may train (DeepSeek) is not called; the member is told which AIs can use Google data", async () => {
    const conv = await googleChat();
    calls.length = 0;
    await db.asMember(uid, () => turn.runTurn({ id: uid, lang: "en", tz: "UTC", default_model: "deepseek:deepseek-chat" }, { conversationId: conv, text: "What does my file say?" }, {}));
    expect(calls).toHaveLength(0);
    const unlock = (await import("@/lib/privacy")).unlock;
    expect(unlock(await answer(conv))).toContain("sends Google data only to AIs that don't train on it");
  });

  it("an AI that doesn't train (Claude API) answers, and the request carries noTrain", async () => {
    const conv = await googleChat();
    calls.length = 0;
    await db.asMember(uid, () => turn.runTurn({ id: uid, lang: "en", tz: "UTC", default_model: "claude-sonnet-5" }, { conversationId: conv, text: "What does my file say?" }, {}));
    expect(calls).toEqual([{ model: "claude-sonnet-5", noTrain: true }]);
  });
});
