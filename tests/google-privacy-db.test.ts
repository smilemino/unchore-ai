// Google data stays out of «Help improve Unchore» copies (lib/privacy.ts markGoogleChat / chatHasGoogleData · owner 2026-10-02,
// Google's app review). On a real Postgres, as the member (row-level lock on): a chat marked after a Calendar/Drive read loses the
// copies already made from it, later turns aren't copied, a file picked from Drive marks its chat, other chats are untouched.
// The policy text names who receives Google data and drops the unverified «not for their own purposes» promise.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { LEGAL } from "@/lib/legal";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("Google data and improvement copies (database)", () => {
  let db: typeof import("@/lib/db");
  let pv: typeof import("@/lib/privacy");
  let uid = "";
  const samples = async (conv: string) => Number((await db.asOwner(() => db.one<{ n: string }>("select count(*) as n from improve_samples where thread = $1", [pv.ref(conv, "c")])))!.n);
  const newChat = async () => (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 't') returning id", [uid]))!.id;
  const turn = (conv: string, noSample = false) => db.asMember(uid, () => pv.recordTurn({ id: uid, lang: "en" }, { convId: conv, question: "q", answer: "a", model: "m", ms: 1, ok: true, noSample }));

  beforeAll(async () => {
    const name = `uc_gpriv_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    pv = await import("@/lib/privacy");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'UTC', now()) returning id", [`g-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("a chat that read Google loses its earlier copies and gets no new ones; other chats keep theirs", async () => {
    const g = await newChat(), other = await newChat();
    await turn(g); await turn(other);
    expect(await samples(g)).toBe(1);
    expect(await db.asMember(uid, () => pv.chatHasGoogleData(g))).toBe(false);
    expect(await db.asMember(uid, () => pv.markGoogleChat(g))).toBe(true);
    expect(await db.asMember(uid, () => pv.markGoogleChat(g))).toBe(false);          // already marked
    expect(await samples(g)).toBe(0);
    expect(await db.asMember(uid, () => pv.chatHasGoogleData(g))).toBe(true);
    await turn(g, await db.asMember(uid, () => pv.chatHasGoogleData(g)));
    expect(await samples(g)).toBe(0);
    expect(await samples(other)).toBe(1);
  });

  it("a file picked from Google Drive makes its chat a Google chat", async () => {
    const c = await newChat();
    await db.q("insert into files(user_id, conversation_id, name, mime, size, data, from_google) values ($1, $2, 'plan.pdf', 'application/pdf', 1, $3, true)", [uid, c, Buffer.from("x")]);
    expect(await db.asMember(uid, () => pv.chatHasGoogleData(c))).toBe(true);
    const plain = await newChat();
    await db.q("insert into files(user_id, conversation_id, name, mime, size, data) values ($1, $2, 'a.txt', 'text/plain', 1, $3)", [uid, plain, Buffer.from("x")]);
    expect(await db.asMember(uid, () => pv.chatHasGoogleData(plain))).toBe(false);
  });
});

describe("privacy policy: who gets Google data and why", () => {
  const body = LEGAL.privacy.body.join("\n");
  it("names the AI companies that receive it and the limited purpose", () => {
    for (const w of ["Anthropic (Claude API)", "OpenAI (API)", "xAI (Grok API)", "OpenRouter", "Google Gemini", "DeepSeek", "Moonshot AI (Kimi)"]) expect(body).toContain(w);
    expect(body).toMatch(/only to AI services that do not use it to train/);
    expect(body).toContain("Limited Use");
    expect(body).toMatch(/only to give you the feature you asked for/);
    expect(body).toMatch(/kept out of «Help improve Unchore»/);
  });
  it("drops the promise we can't check for every provider", () => {
    expect(body).not.toContain("not for their own purposes");
  });
});
