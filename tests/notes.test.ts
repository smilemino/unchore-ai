// «My notes» (lib/notes.ts): what the AI may file, which notes reach an answer, and the Obsidian download.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { decideNote, fileName, notesBlock, pickNotes, vaultZip, worthAsking, type Note } from "@/lib/notes";

const note = (id: string, title: string, body: string, tags: string[] = [], extra: Partial<Note> = {}): Note =>
  ({ id, title, body, tags, source_conversation: null, created_at: "2026-09-28T01:00:00Z", updated_at: "2026-09-28T01:00:00Z", ...extra });

describe("what the AI may file", () => {
  const have = [note("n1", "Pricing plan", "- $49 a month, 30 days free", ["pricing"])];
  it("adds a new concept note", () => {
    expect(decideNote('```json\n{"op":"add","title":"Launch channels","tags":["marketing","#launch"],"body":"- Threads first, X second"}\n```', have))
      .toEqual({ op: "add", title: "Launch channels", tags: ["marketing", "launch"], body: "- Threads first, X second" });
  });
  it("a new note with an existing title grows that note instead", () => {
    expect(decideNote('{"op":"add","title":"pricing plan","tags":[],"body":"- yearly plan at $399"}', have)).toEqual({ op: "append", id: "n1", text: "- yearly plan at $399" });
  });
  it("appends only to a listed note, and only something new", () => {
    expect(decideNote('{"op":"append","id":"n1","text":"- refund within 14 days"}', have)).toEqual({ op: "append", id: "n1", text: "- refund within 14 days" });
    expect(decideNote('{"op":"append","id":"nope","text":"- refund within 14 days"}', have)).toBeNull();
    expect(decideNote('{"op":"append","id":"n1","text":"- $49 a month, 30 days free"}', have)).toBeNull();
  });
  it("keeps sensitive things out, like memory does", () => {
    expect(decideNote('{"op":"add","title":"Bank","tags":[],"body":"- account number 110-234-567890 at the bank"}', have)).toBeNull();
    expect(decideNote('{"op":"add","title":"Clinic visit","tags":[],"body":"- hospital on Monday for surgery"}', have)).toBeNull();
  });
  it("«none», broken JSON, too short or too long → nothing", () => {
    expect(decideNote('{"op":"none"}', have)).toBeNull();
    expect(decideNote("not json", have)).toBeNull();
    expect(decideNote('{"op":"add","title":"X","tags":[],"body":"short"}', have)).toBeNull();
    expect(decideNote(JSON.stringify({ op: "add", title: "Long", tags: [], body: "x".repeat(2000) }), have)).toBeNull();
  });
  it("doesn't even ask on a «thanks» turn", () => {
    expect(worthAsking("thanks!", "x".repeat(500))).toBe(false);
    expect(worthAsking("Which launch channel first?", "short")).toBe(false);
    expect(worthAsking("Which launch channel first?", "x".repeat(300))).toBe(true);
  });
});

describe("which notes reach an answer", () => {
  const all = [note("a", "Pricing plan", "- $49 a month", ["pricing"]), note("b", "Launch channels", "- Threads first", ["marketing"]), note("c", "가격 정책", "- 월 49달러", ["가격"])];
  it("only notes that share words with the question", () => {
    expect(pickNotes("What should the pricing plan be for teams?", all).map((n) => n.id)).toEqual(["a"]);
    expect(pickNotes("가격 정책을 팀용으로 바꾸면?", all).map((n) => n.id)).toEqual(["c"]);
    expect(pickNotes("How's the weather?", all)).toEqual([]);
  });
  it("the block tells the AI to build on them, dated in the member's zone", () => {
    const b = notesBlock([all[0]!], "Asia/Seoul");
    expect(b).toContain("build on it");
    expect(b).toContain("### Pricing plan · 2026-09-28");
    expect(notesBlock([], "UTC")).toBe("");
  });
});

describe("Download for Obsidian", () => {
  it("file names every system accepts, same titles numbered", () => {
    const used = new Set<string>();
    expect(fileName('Plan: A/B "test"?', used)).toBe("Plan A B test");
    expect(fileName("plan a b test", used)).toBe("plan a b test (2)");
    expect(fileName("...", used)).toBe("Note");
  });
  it("one Markdown note per note with front matter, [[links]] between related ones, and an index", () => {
    const zip = vaultZip([note("a", "Pricing plan", "- $49", ["pricing"], { source_conversation: "c1", model: "claude-sonnet-5" }), note("b", "Team pricing", "- $39 each", ["pricing"]), note("c", "Launch channels", "- Threads", [])],
      { appUrl: "https://unchore.ai", tz: "UTC" });
    const files = unzipSync(new Uint8Array(zip));
    expect(Object.keys(files).sort()).toEqual(["Unchore Notes/Launch channels.md", "Unchore Notes/Pricing plan.md", "Unchore Notes/Team pricing.md", "Unchore Notes/_Index.md"]);
    const a = strFromU8(files["Unchore Notes/Pricing plan.md"]!);
    expect(a).toMatch(/^---\ntype: note\ntags: \["pricing"\]\ncreated: 2026-09-28\n/);
    expect(a).toContain("source: https://unchore.ai/app?c=c1");
    expect(a).toContain("made_by: claude-sonnet-5");
    expect(a).toContain("Related: [[Team pricing]]");
    expect(a).not.toContain("[[Launch channels]]");
    expect(strFromU8(files["Unchore Notes/_Index.md"]!)).toContain("- [[Launch channels]]");
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("notes in the database", () => {
  let db: typeof import("@/lib/db");
  let notes: typeof import("@/lib/notes");
  let a = "", b = "";
  beforeAll(async () => {
    const name = `uc_notes_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    notes = await import("@/lib/notes");
    const { lock } = await import("@/lib/privacy");
    a = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`na-${randomUUID()}@t.test`]))!.id;
    b = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`nb-${randomUUID()}@t.test`]))!.id;
    await db.q("insert into notes(user_id, title, body, tags) values ($1, $2, $3, $4)", [a, lock("Pricing plan"), lock("- $49"), lock("pricing, money")]);
    await db.q("insert into notes(user_id, title, body, tags) values ($1, $2, $3, $4)", [b, lock("B secret"), lock("- b"), lock("")]);
  }, 30_000);

  it("stored locked, opened for the owner only", async () => {
    const raw = await db.q<{ title: string }>("select title from notes where user_id = $1", [a]);
    expect(raw[0]!.title.startsWith("enc:")).toBe(true);
    const mine = await db.asMember(a, () => notes.loadNotes(a));
    expect(mine.map((n) => [n.title, n.body, n.tags])).toEqual([["Pricing plan", "- $49", ["pricing", "money"]]]);
    expect(await db.asMember(a, () => notes.loadNotes(b))).toEqual([]);
  });

  it("no AI connected or memory off → nothing is filed, nothing throws", async () => {
    expect(await db.asMember(a, () => notes.updateNotes(a, randomUUID(), "Which pricing plan do we pick?", "x".repeat(400), {}))).toBeNull();
  });
});
