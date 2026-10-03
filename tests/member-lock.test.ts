// Member lock (db/migrations/005_member_lock.sql + lib/db.ts): two members, every table — neither can see, change
// or delete the other's rows, even with a query that forgets «and user_id = …». Needs a throwaway Postgres:
// TEST_DATABASE_URL=postgres://… (superuser, empty database). Skipped without it; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const signed = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/session", () => ({ currentUser: async () => { const { q } = await import("@/lib/db"); await q("select 1"); return { id: signed.id }; } }));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? routeFiles(p) : f === "route.ts" ? [p] : []; });
}

describe("member lock wiring", () => {
  it("every route that signs a member in fences itself right away (const u = await requireUser(); if (isResp(u)) return u;)", () => {
    for (const f of routeFiles(path.join(process.cwd(), "app", "api"))) {
      const src = readFileSync(f, "utf8");
      const calls = src.match(/requireUser\(\)/g)?.length ?? 0;
      const fenced = src.match(/const u = await requireUser\(\);\s*if \(isResp\(u\)\) return u;/g)?.length ?? 0;
      expect(fenced, f).toBe(calls);
    }
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("member lock", () => {
  let db: typeof import("@/lib/db");
  const blank = () => ({ user: "", conv: "", msg: "", project: "", auto: "" });
  const ids = { A: blank(), B: blank() };

  async function seed(who: "A" | "B") {
    const m = ids[who];
    const one = db.one as <T>(s: string, p?: unknown[]) => Promise<T>;
    m.user = (await one<{ id: string }>("insert into users(email) values ($1) returning id", [`${who}-${randomUUID()}@t.test`])).id;
    await db.q("insert into sessions(id, user_id, expires_at) values ($1, $2, now() + interval '1 day')", [randomUUID(), m.user]);
    await db.q("insert into user_keys(user_id, provider, enc, hint) values ($1, 'openai', 'x', '••••')", [m.user]);
    await db.q("insert into vault(user_id, name, enc, hint) values ($1, 'bank', 'x', '••••')", [m.user]);
    m.project = (await one<{ id: string }>("insert into projects(user_id, name) values ($1, 'p') returning id", [m.user])).id;
    m.conv = (await one<{ id: string }>("insert into conversations(user_id, title, project_id) values ($1, $2, $3) returning id", [m.user, `${who} secret chat`, m.project])).id;
    m.msg = (await one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'assistant', $2) returning id", [m.conv, `${who} secret answer`])).id;
    await db.q("insert into proposals(user_id, message_id, propose, method) values ($1, $2, true, 'x')", [m.user, m.msg]);
    await db.q("insert into files(user_id, conversation_id, message_id, name, mime, size, data) values ($1, $2, $3, 'f.txt', 'text/plain', 1, '\\x41')", [m.user, m.conv, m.msg]);
    await db.q("insert into memories(user_id, text) values ($1, $2)", [m.user, `${who} remembers`]);
    m.auto = (await one<{ id: string }>("insert into automations(user_id, title, recipe) values ($1, 't', 'crypto') returning id", [m.user])).id;
    await db.q("insert into runs(automation_id, ok) values ($1, true)", [m.auto]);
    await db.q("insert into push_subscriptions(user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')", [m.user, `https://push.test/${randomUUID()}`]);
    await db.q("insert into voice_usage(user_id, day, speak_sec) values ($1, current_date, 30)", [m.user]);
    // batches 15–20 (owner «yes» 2026-09-30): every new member table is fenced too
    await db.q("insert into chat_queue(user_id, conversation_id, text) values ($1, $2, $3)", [m.user, m.conv, `${who} waiting`]);
    await db.q("insert into glossary(user_id, avoid, use_word) values ($1, 'a', 'b')", [m.user]);
    await db.q("insert into taste_votes(user_id, question, yes, tags) values ($1, 'q', true, '[]')", [m.user]);
    await db.q("insert into rules_history(user_id, text) values ($1, $2)", [m.user, `${who} old rules`]);
    await db.q("insert into memory_log(user_id, action, text) values ($1, 'added', $2)", [m.user, `${who} noted`]);
    const up = (await one<{ id: string }>("insert into uploads(user_id, name, mime, size, parts) values ($1, 'big.bin', 'application/octet-stream', 1, 1) returning id", [m.user])).id;
    await db.q("insert into upload_parts(upload_id, user_id, idx, data) values ($1, $2, 0, '\\x41')", [up, m.user]);
    await db.q("insert into connections(user_id, provider, email, scopes) values ($1, 'google', $2, 'openid')", [m.user, `${who}@g.test`]);
    await db.q("insert into google_actions(user_id, message_id, idx) values ($1, $2, 0)", [m.user, m.msg]);
    await db.q("insert into notes(user_id, title, body, source_conversation) values ($1, $2, 'b', $3)", [m.user, `${who} notebook`, m.conv]);   // «My notes» (018)
    await db.q("insert into builds(user_id, conversation_id, title, spec, status) values ($1, $2, $3, 'spec', 'done')", [m.user, m.conv, `${who} app`]);   // «Build me an app» (019)
    await db.q("insert into app_devices(user_id, device) values ($1, $2)", [m.user, `${who}-phone`]);   // Android app (020)
    await db.q("insert into app_inbox(user_id, title, body, url) values ($1, 't', $2, '/app')", [m.user, `${who} notice`]);
    await db.q("insert into answer_reports(user_id, message_id, reason) values ($1, $2, 'other')", [m.user, m.msg]);   // «Report» under an answer (021)
    await db.q("insert into meta_actions(user_id, message_id, idx) values ($1, $2, 0)", [m.user, m.msg]);   // Meta budget «Yes» card (022)
    await db.q("insert into telegram_links(user_id, chat_id, conversation_id) values ($1, $2, $3)", [m.user, Math.floor(Math.random() * 1e12), m.conv]);   // Telegram (025)
    await db.q("insert into telegram_codes(code, user_id, expires_at) values ($1, $2, now() + interval '10 minutes')", [randomUUID(), m.user]);
    await db.q("insert into hf_jobs(user_id, message_id, idx, model) values ($1, $2, 0, 'seedance-2.5')", [m.user, m.msg]);   // Higgsfield «Yes» card (029)
    await db.q("insert into ability_gaps(user_id, conversation_id, ability) values ($1, $2, 'make videos')", [m.user, m.conv]);   // «Can't do it» → AI Soul builds it (030)
    const pc = (await db.one<{ id: string }>("insert into computers(user_id, name, token_hash, hint) values ($1, $2, $3, 'x') returning id", [m.user, `${who} pc`, randomUUID()]))!.id;   // «Connect your computer» (031)
    await db.q("insert into computer_jobs(user_id, computer_id, conversation_id, prompt) values ($1, $2, $3, 'p')", [m.user, pc, m.conv]);
    const task = (await one<{ id: string }>("insert into conversation_tasks(user_id, conversation_id, task_key, title) values ($1, $2, 't1', $3) returning id", [m.user, m.conv, `${who} task`])).id;   // tasks in one chat (034)
    await db.q("insert into conversation_task_events(user_id, task_id, conversation_id, kind, by_who) values ($1, $2, $3, 'created', 'ai')", [m.user, task, m.conv]);
    await db.q("insert into personal_ui(user_id) values($1)", [m.user]);
    await db.q("insert into personal_ui_versions(user_id,version,design) values($1,1,'{}')", [m.user]);
    await db.q("insert into personal_ui_data(user_id,key,value) values($1,'test','{}')", [m.user]);
    await db.q("insert into member_skills(user_id, slug, description, body) values ($1, 'weekly-report', 'd', $2)", [m.user, `${who} steps`]);   // skills (038)
    await db.q("insert into mcp_servers(user_id, slug, url) values ($1, 'notion', 'https://mcp.example.test/mcp')", [m.user]);   // MCP servers (038)
    await db.q("insert into bg_jobs(user_id, parent_conversation_id, title, prompt) values ($1, $2, 't', $3)", [m.user, m.conv, `${who} job`]);   // background jobs (038)
    await db.q("insert into chat_apps(user_id, kind, pair_code) values ($1, 'slack', $2)", [m.user, `uc-${who}`]);   // Slack/Discord (038)
    await db.q("insert into call_imports(user_id, name, seconds) values ($1, 'call.m4a', 60)", [m.user]);   // Calls → requests (044)
    await db.q("insert into inbox_hooks(user_id, name, key_hash, hint) values ($1, $2, 'h', 'uci_…x')", [m.user, `${who} shop`]);   // Alerts in (045)
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: URL }, stdio: "pipe" });
    db = await import("@/lib/db");
    await seed("A");
    await seed("B");
  });

  const fenced = async () => (await db.q<{ t: string }>("select tablename as t from pg_policies where schemaname = 'public' and policyname = 'uc_own' order by 1")).map((r) => r.t);

  it("fences every table that holds a member's rows (a future table with user_id is covered too)", async () => {
    const withOwner = (await db.q<{ t: string }>("select distinct table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'user_id'")).map((r) => r.t);
    const got = await fenced();
    for (const t of [...withOwner, "users", "messages", "runs"]) expect(got).toContain(t);
  });

  it("a member sees only their own rows in every fenced table, even with no «where user_id»", async () => {
    for (const t of await fenced()) {
      const all = (await db.one<{ n: number }>(`select count(*)::int as n from ${t}`))!.n;
      const seenA = await db.asMember(ids.A.user, async () => (await db.one<{ n: number }>(`select count(*)::int as n from ${t}`))!.n);
      const seenB = await db.asMember(ids.B.user, async () => (await db.one<{ n: number }>(`select count(*)::int as n from ${t}`))!.n);
      expect(all, t).toBeGreaterThanOrEqual(2);
      expect(seenA, t).toBeGreaterThan(0);
      expect(seenB, t).toBeGreaterThan(0);
      // Other test files add members to the same database at the same time, so «all» can be more than A + B.
      // If the fence leaked, A (or B) would see everything and the two together would exceed «all».
      expect(seenA + seenB, t).toBeLessThanOrEqual(all);
    }
    const texts = await db.asMember(ids.A.user, () => db.q<{ content: string }>("select content from messages"));
    expect(texts.map((r) => r.content)).toEqual(["A secret answer"]);
  });

  it("cannot read, change, delete or add rows for another member", async () => {
    await db.asMember(ids.A.user, async () => {
      expect(await db.one("select id from conversations where id = $1", [ids.B.conv])).toBeNull();
      expect(await db.q("update conversations set title = 'hacked' where id = $1 returning id", [ids.B.conv])).toEqual([]);
      expect(await db.q("delete from messages where id = $1 returning id", [ids.B.msg])).toEqual([]);
      expect(await db.q("update users set name = 'hacked' where id = $1 returning id", [ids.B.user])).toEqual([]);
      await expect(db.q("insert into memories(user_id, text) values ($1, 'planted')", [ids.B.user])).rejects.toThrow(/row-level security/);
      await expect(db.q("insert into messages(conversation_id, role, content) values ($1, 'user', 'planted')", [ids.B.conv])).rejects.toThrow(/row-level security/);
      await expect(db.q("update conversations set user_id = $1 where id = $2", [ids.B.user, ids.A.conv])).rejects.toThrow(/row-level security/);
    });
    const b = await db.one<{ title: string }>("select title from conversations where id = $1", [ids.B.conv]);
    expect(b!.title).toBe("B secret chat");
    expect((await db.one<{ n: number }>("select count(*)::int as n from messages where id = $1", [ids.B.msg]))!.n).toBe(1);
  });

  it("voice minutes: a member meters only their own day, and sees the company total only as one number", async () => {
    const { addUsage, allowance } = await import("@/lib/voice/google");
    process.env.GEMINI_API_KEY = "test";
    await db.asMember(ids.A.user, async () => {
      await addUsage(ids.A.user, "UTC", { speak: 12.5 });
      await expect(addUsage(ids.B.user, "UTC", { speak: 999 })).rejects.toThrow(/row-level security/);
      const a = await allowance(ids.A.user, "UTC");
      expect(a.ok).toBe(true);
      expect(a.speakLeft).toBeCloseTo(3600 - 30 - 12.5, 1);
      const all = (await db.one<{ t: number }>("select uc_voice_total(current_date) as t"))!.t;
      expect(all).toBeGreaterThanOrEqual(72.5);
      expect(await db.q("select * from voice_usage where user_id = $1", [ids.B.user])).toEqual([]);
    });
    expect((await db.one<{ s: number }>("select speak_sec as s from voice_usage where user_id = $1 and day = current_date", [ids.B.user]))!.s).toBe(30);
    delete process.env.GEMINI_API_KEY;
  });

  it("a member can delete their own account (Settings) but not someone else's", async () => {
    const c = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`C-${randomUUID()}@t.test`]))!.id;
    await db.q("insert into conversations(user_id, title) values ($1, 'c')", [c]);
    await db.asMember(c, async () => {
      expect(await db.q("delete from users where id = $1 returning id", [ids.B.user])).toEqual([]);
      expect(await db.q("delete from users where id = $1 returning id", [c])).toHaveLength(1);
    });
    expect(await db.one("select id from users where id = $1", [ids.B.user])).not.toBeNull();
    expect(await db.one("select id from conversations where user_id = $1", [c])).toBeNull();
  });

  it("shared logs (no owner column) are write-only for members", async () => {
    await db.asMember(ids.A.user, async () => {
      await expect(db.q("select * from login_tokens")).rejects.toThrow(/permission denied/);
      await expect(db.q("select * from waitlist")).rejects.toThrow(/permission denied/);
    });
    await db.q("create table if not exists later_log (id bigserial primary key, note text)");
    await db.asMember(ids.A.user, async () => {
      await db.q("insert into later_log(note) values ('x')");
      await expect(db.q("select * from later_log")).rejects.toThrow(/permission denied/);
    });
  });

  it("the connection goes back to the owner after member work, and a route stays fenced after requireUser + isResp", async () => {
    await db.asMember(ids.A.user, () => db.q("select 1"));
    expect((await db.one<{ r: string }>("select current_user as r"))!.r).not.toBe("unchore_member");
    // The real route pattern: requireUser() awaits the session lookup, then isResp(u) fences the route's own frame.
    signed.id = ids.A.user;
    const { requireUser, isResp } = await import("@/lib/api");
    const route = async () => {
      const u = await requireUser();
      if (isResp(u)) return null;
      await db.q("select 1");
      return db.one<{ r: string; u: string }>("select current_user as r, current_setting('app.user_id', true) as u");
    };
    const seen = await new Promise<{ r: string; u: string } | null>((res, rej) => setImmediate(() => route().then(res, rej)));
    expect(seen).toEqual({ r: "unchore_member", u: ids.A.user });
    expect(db.actingMember()).toBeNull(); // did not leak into this test's own context
  });
});
