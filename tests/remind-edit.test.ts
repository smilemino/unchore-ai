// Change or switch off a running reminder from any chat (lib/remind-edit.ts · AI Soul f083e06). The database part runs on a real
// Postgres as the member — skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { readRemindEdits } from "../lib/remind-edit";
import { extractReminders } from "../lib/reminders";
import { hideMarks } from "../lib/chat-setup";

describe("reminder edit marks", () => {
  it("reads edit and off marks, keeps the answer text, and leaves no block for the new-reminder reader", () => {
    const r = readRemindEdits("Sure, done.\n<<<remind-edit id=#1A2B3C4D>>>\ntitle: Pill alert\nTell me to take the blue pill.\n<<<end>>>\n<<<remind-off id=deadbeef>>>");
    expect(r.text).toBe("Sure, done.");
    expect(r.edits).toEqual([{ id: "1a2b3c4d", prompt: "Tell me to take the blue pill.", title: "Pill alert" }, { id: "deadbeef", off: true }]);
    expect(extractReminders(r.text).proposals).toEqual([]);
  });
  it("an empty task or a bad number changes nothing", () => {
    expect(readRemindEdits("<<<remind-edit id=1a2b3c4d>>>\n\n<<<end>>>").edits).toEqual([]);
    expect(readRemindEdits("<<<remind-off id=xyz>>>").edits).toEqual([]);
  });
  it("a new reminder block next to an edit is still read as a new reminder", () => {
    const r = readRemindEdits("<<<remind-off id=1a2b3c4d>>>\n<<<remind daily=09:00>>>\nnew job\n<<<end>>>");
    expect(r.edits).toEqual([{ id: "1a2b3c4d", off: true }]);
    expect(extractReminders(r.text).proposals.map((p) => p.prompt)).toEqual(["new job"]);
  });
  it("the marks never show on screen while streaming", () => {
    expect(hideMarks("OK.\n<<<remind-edit id=1a2b3c4d>>>\nnew text\n<<<end>>>\n<<<remind-off id=1a2b3c4d>>>")).toBe("OK.");
    expect(hideMarks("OK.\n<<<remind-edit id=1a2b3c4d>>>\nhalf writ")).toBe("OK.");
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("reminder edit (database)", () => {
  let db: typeof import("@/lib/db");
  let re: typeof import("@/lib/remind-edit");
  let uid = "", other = "", a = "", b = "", nudge = "", theirs = "";
  const row = (id: string) => db.one<{ status: string; title: string; args: { prompt: string; watch?: unknown } }>("select status, title, args from automations where id = $1", [id]);
  const add = (user: string, args: object, title = "t") => db.one<{ id: string }>("insert into automations(user_id, title, recipe, args, schedule, status) values ($1, $2, 'prompt', $3, 'daily@09:00', 'active') returning id", [user, title, JSON.stringify(args)]).then((r) => r!.id);

  beforeAll(async () => {
    const name = `uc_redit_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    re = await import("@/lib/remind-edit");
    uid = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'Asia/Seoul') returning id", [`r-${randomUUID()}@t.test`]))!.id;
    other = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'Asia/Seoul') returning id", [`r-${randomUUID()}@t.test`]))!.id;
    a = await add(uid, { prompt: "Factory visit at 3pm. Bring the old badge.", conversationId: randomUUID(), watch: { kind: "below", value: 1 } }, "Factory visit");
    b = await add(uid, { prompt: "Water the plants", conversationId: randomUUID() }, "Plants");
    nudge = await add(uid, { prompt: "daily note", kind: "nudge" }, "Daily note");
    theirs = await add(other, { prompt: "someone else's" }, "Not yours");
  }, 30_000);

  it("the AI sees the member's running reminders (not the daily note, not anyone else's)", async () => {
    const g = await db.asMember(uid, () => re.remindEditGuide(uid, null));
    expect(g).toContain(`#${a.slice(0, 8)} «Factory visit»`);
    expect(g).toContain("Bring the old badge");
    expect(g).not.toContain(nudge.slice(0, 8));
    expect(g).not.toContain("Not yours");
  });

  it("changes one reminder's task (dropping the old price line) and switches another off", async () => {
    const notes = await db.asMember(uid, () => re.applyRemindEdits(uid, [{ id: a.slice(0, 8), prompt: "Factory visit at 3pm." }, { id: b.slice(0, 8), off: true }], "en"));
    expect(await row(a)).toMatchObject({ status: "active", title: "Factory visit", args: { prompt: "Factory visit at 3pm." } });
    expect((await row(a))!.args.watch).toBeUndefined();
    expect((await row(b))!.status).toBe("paused");
    expect(notes).toHaveLength(2);
    expect(notes.some((n) => n.startsWith("⚠"))).toBe(false);
  });

  it("another member's reminder, the daily note or an unknown number is refused out loud", async () => {
    const notes = await db.asMember(uid, () => re.applyRemindEdits(uid, [{ id: theirs.slice(0, 8), off: true }, { id: nudge.slice(0, 8), off: true }, { id: "00000000", prompt: "x" }], "en"));
    expect(notes.every((n) => n.startsWith("⚠"))).toBe(true);
    expect((await row(theirs))!.status).toBe("active");
    expect((await row(nudge))!.status).toBe("active");
  });
});
