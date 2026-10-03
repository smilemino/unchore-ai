// Member skills (lib/skills.ts — Claude Code skills, Hermes Agent's learning loop). On a real Postgres: the AI saves a how-to,
// reads it back, updates it, deletion waits for the member's «yes», secrets aren't kept, and one member never sees another's
// skills — the member lock (005) fences the table even if a query forgot «user_id = …». Skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("member skills (database)", () => {
  let db: typeof import("@/lib/db");
  let sk: typeof import("@/lib/skills");
  let a = "", b = "";
  beforeAll(async () => {
    const name = `uc_sk_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    sk = await import("@/lib/skills");
    a = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'UTC') returning id", [`a-${randomUUID()}@t.test`]))!.id;
    b = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'UTC') returning id", [`b-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("saves, lists, reads and updates a skill — the text is locked at rest", async () => {
    const r = await db.asMember(a, () => sk.skillsTool({ userId: a, yes: false }, { action: "save", name: "Post weekly Instagram reel", description: "When they ask to post the weekly reel", body: "1. Open the draft\n2. Check captions\n3. Post at 7pm" }));
    expect(r).toEqual({ ok: true, text: "Saved the skill «post-weekly-instagram-reel»." });
    const raw = await db.one<{ body: string; description: string }>("select body, description from member_skills where user_id = $1", [a]);
    expect(raw!.body.startsWith("enc:")).toBe(true);
    expect(raw!.description.startsWith("enc:")).toBe(true);
    const list = await db.asMember(a, () => sk.skillsTool({ userId: a, yes: false }, { action: "list" }));
    expect(list.text).toBe("- post-weekly-instagram-reel — When they ask to post the weekly reel");
    const read = await db.asMember(a, () => sk.skillsTool({ userId: a, yes: false }, { action: "read", name: "post weekly instagram reel" }));
    expect(read.text).toContain("3. Post at 7pm");
    const up = await db.asMember(a, () => sk.skillsTool({ userId: a, yes: false }, { action: "save", name: "post-weekly-instagram-reel", description: "Weekly reel", body: "Post at 8pm" }));
    expect(up.text).toBe("Updated the skill «post-weekly-instagram-reel».");
    const again = await db.asMember(a, () => sk.listSkills(a));
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ slug: "post-weekly-instagram-reel", description: "Weekly reel", uses: 1 });
    expect(sk.skillsBlock(again)).toContain("- post-weekly-instagram-reel — Weekly reel");
  });

  it("another member sees none of it, even asking for it by name or without «where user_id»", async () => {
    expect(await db.asMember(b, () => sk.listSkills(b))).toEqual([]);
    expect((await db.asMember(b, () => sk.skillsTool({ userId: b, yes: false }, { action: "read", name: "post-weekly-instagram-reel" }))).ok).toBe(false);
    expect(await db.asMember(b, () => db.q("select slug from member_skills"))).toEqual([]);
    // b saving the same name makes b's own copy; a's stays as it was
    await db.asMember(b, () => sk.saveSkill(b, { name: "post-weekly-instagram-reel", description: "mine", body: "b's steps" }));
    expect((await db.asMember(a, () => sk.readSkill(a, "post-weekly-instagram-reel")))!.body).toBe("Post at 8pm");
    // b deleting it with a «yes» deletes only b's
    expect((await db.asMember(b, () => sk.skillsTool({ userId: b, yes: true }, { action: "delete", name: "post-weekly-instagram-reel" }))).ok).toBe(true);
    expect(await db.asMember(a, () => sk.listSkills(a))).toHaveLength(1);
  });

  it("deleting waits for the member's yes; passwords and card numbers aren't saved", async () => {
    const no = await db.asMember(a, () => sk.skillsTool({ userId: a, yes: false }, { action: "delete", name: "post-weekly-instagram-reel" }));
    expect(no.ok).toBe(false);
    expect(await db.asMember(a, () => sk.listSkills(a))).toHaveLength(1);
    const secret = await db.asMember(a, () => sk.saveSkill(a, { name: "log in", description: "sign in", body: "password: hunter2hunter2" }));
    expect(secret.ok).toBe(false);
    const card = await db.asMember(a, () => sk.saveSkill(a, { name: "pay", description: "pay", body: "use 4111 1111 1111 1111" }));
    expect(card.ok).toBe(false);
    expect(await db.asMember(a, () => sk.listSkills(a))).toHaveLength(1);
    const yes = await db.asMember(a, () => sk.skillsTool({ userId: a, yes: true }, { action: "delete", name: "post-weekly-instagram-reel" }));
    expect(yes.ok).toBe(true);
    expect(await db.asMember(a, () => sk.listSkills(a))).toEqual([]);
  });

  it("names become plain slugs; empty or huge skills are refused", async () => {
    expect(sk.slugOf("  Post an Instagram reel!! ")).toBe("post-an-instagram-reel");
    expect(sk.slugOf("릴스 올리기")).toBe("");
    expect((await db.asMember(a, () => sk.saveSkill(a, { name: "릴스", description: "x", body: "y" }))).ok).toBe(false);
    expect((await db.asMember(a, () => sk.saveSkill(a, { name: "big", description: "x", body: "y".repeat(20_001) }))).ok).toBe(false);
    expect((await db.asMember(a, () => sk.saveSkill(a, { name: "empty", description: "", body: "y" }))).ok).toBe(false);
  });
});
