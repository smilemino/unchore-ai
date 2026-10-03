// Tasks inside one chat (lib/conv-tasks.ts · AI Soul tests/conversation-tasks.test.ts). The database part runs on a real Postgres —
// skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { decideLine, extractTasks, noteIsEarlier, progress, taskPromptNote, type TaskRow } from "@/lib/conv-tasks";
import { hideMarks } from "@/lib/chat-setup";

const ANSWER = "Both are moving.\n\n<<<tasks>>>\nt1 | done | Compare plans | Plan B is $4 cheaper\n- t2 | in progress | Draft the email |\nnot a task line\n<<<endtasks>>>\n[done]";

describe("reading the task block", () => {
  it("takes the block out and reads each line; bad lines are counted", () => {
    const r = extractTasks(ANSWER);
    expect(r.content).toBe("Both are moving.\n\n[done]");
    expect(r.lines).toEqual([
      { key: "t1", status: "done", title: "Compare plans", note: "Plan B is $4 cheaper" },
      { key: "t2", status: "doing", title: "Draft the email", note: "" },
    ]);
    expect(r.bad).toEqual(["not a task line"]);
  });
  it("leaves an answer without a block alone", () => {
    expect(extractTasks("plain answer")).toEqual({ lines: [], content: "plain answer", bad: [] });
  });
  it("is hidden while the answer streams, even before the block closes", () => {
    expect(hideMarks("Working on it.\n<<<tasks>>>\nt1 | doing | A | half")).toBe("Working on it.");
    expect(hideMarks("A\n<<<tasks>>>\nt1 | done | A | ok\n<<<endtasks>>>\nB")).toBe("A\nB");
  });
});

describe("taking a line", () => {
  const row = { status: "doing" as const, title: "Draft", note: "half" };
  it("«done» needs a result", () => {
    expect(decideLine(row, { key: "t1", status: "done", title: "", note: "" }, { stale: false })).toMatchObject({ status: "doing", refused: "noResult" });
    expect(decideLine(row, { key: "t1", status: "done", title: "", note: "sent" }, { stale: false })).toMatchObject({ status: "done", refused: null, title: "Draft" });
  });
  it("«done» written before the member's newer word is not taken", () => {
    expect(decideLine(row, { key: "t1", status: "done", title: "", note: "sent" }, { stale: true })).toMatchObject({ status: "doing", refused: "stale" });
  });
  it("only the member drops a task, and a dropped task stays dropped", () => {
    expect(decideLine(row, { key: "t1", status: "dropped", title: "", note: "" }, { stale: false })).toMatchObject({ status: "doing", refused: "noDrop" });
    expect(decideLine({ ...row, status: "dropped" }, { key: "t1", status: "doing", title: "", note: "again" }, { stale: false })).toMatchObject({ status: "dropped", refused: "dropped" });
  });
  it("a new task starts from the line", () => {
    expect(decideLine(null, { key: "t3", status: "open", title: "Book", note: "" }, { stale: false })).toMatchObject({ status: "open", title: "Book", changed: true });
  });
});

describe("progress and the AI's note", () => {
  const r = (task_key: string, status: TaskRow["status"], pending: TaskRow["pending"] = null): TaskRow =>
    ({ id: task_key, task_key, title: task_key.toUpperCase(), status, note: null, instr_rev: 1, created_at: "", updated_at: "", pending });
  it("counts dropped tasks out and failed ones as left", () => {
    expect(progress([r("a", "done"), r("b", "failed"), r("c", "dropped"), r("d", "waiting")])).toEqual({ live: 3, done: 1, failed: 1, dropped: 1, left: 2 });
  });
  it("tells the AI what the member said that it hasn't handled", () => {
    const note = taskPromptNote([r("t1", "done"), r("t2", "open", { body: "use the blue one", rev: 2, at: "" })]);
    expect(note).toContain("(1 of 2 done)");
    expect(note).toContain("«use the blue one»");
    expect(taskPromptNote([])).toBe("");
  });
  it("a reopened task shows the AI's last note as the earlier result", () => {
    expect(noteIsEarlier({ note: "sent the long one", pending: { body: "make it shorter", rev: 2, at: "" } })).toBe(true);
    expect(noteIsEarlier({ note: "sent the long one", pending: null })).toBe(false);
    expect(noteIsEarlier({ note: null, pending: { body: "x", rev: 2, at: "" } })).toBe(false);
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("recording tasks (database)", () => {
  let db: typeof import("@/lib/db");
  let tasks: typeof import("@/lib/conv-tasks-db");
  let auto: typeof import("@/lib/auto-done");
  let uid = "";
  const chat = async () => {
    const c = (await db.one<{ id: string }>("insert into conversations(user_id, title, seen_ai) values ($1, 'x', 99) returning id", [uid]))!.id;
    const qid = (await db.one<{ id: string }>("insert into messages(conversation_id, role, content, created_at) values ($1, 'user', 'q', now() - interval '40 minutes') returning id", [c]))!.id;
    const aid = (await db.one<{ id: string }>("insert into messages(conversation_id, role, content, created_at) values ($1, 'assistant', 'a', now() - interval '30 minutes') returning id", [c]))!.id;
    return { c, qid, aid };
  };
  const base = (x: { c: string; qid: string; aid: string }, text: string, o: { wantDone?: boolean; memberCloses?: boolean } = {}) => {
    const ex = extractTasks(text);
    return { userId: uid, convId: x.c, questionId: x.qid, answerId: x.aid, lines: ex.lines, bad: ex.bad, lang: "en" as const, wantDone: o.wantDone ?? false, memberCloses: o.memberCloses ?? false };
  };

  beforeAll(async () => {
    const name = `uc_ct_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin if not exists (select 1 from pg_roles where rolname = 'unchore_member') then create role unchore_member nologin; end if; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    tasks = await import("@/lib/conv-tasks-db");
    auto = await import("@/lib/auto-done");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'Asia/Seoul', now()) returning id", [`ct-${randomUUID()}@t.test`]))!.id;
  }, 60_000);

  it("a task left blocks «done» and the 30-minute tidy; finishing it lets both through", async () => {
    const x = await chat();
    const first = await tasks.recordTasks(base(x, "<<<tasks>>>\nt1 | done | A | ok\nt2 | doing | B | half\n<<<endtasks>>>", { wantDone: true }));
    expect(first.blocked).toBe(true);
    expect(first.notes.join(" ")).toContain("1 of 2 tasks are still open");
    expect(await auto.autoDone()).toBe(0);
    const list = await tasks.listTasks(x.c);
    expect(list.map((t) => [t.task_key, t.status, t.title])).toEqual([["t1", "done", "A"], ["t2", "doing", "B"]]);
    expect((await db.one<{ title: string }>("select title from conversation_tasks where id = $1", [list[1]!.id]))!.title.startsWith("enc:")).toBe(true);   // locked like chat text
    expect((await tasks.recordTasks(base(x, "<<<tasks>>>\nt2 | done | B | sent\n<<<endtasks>>>", { wantDone: true }))).blocked).toBe(false);
    expect(await auto.autoDone()).toBe(1);
  }, 30_000);

  it("the member's word reopens a task and stays «not handled» until the AI writes it; closing the chat drops what's left", async () => {
    const x = await chat();
    await tasks.recordTasks(base(x, "<<<tasks>>>\nt1 | done | A | ok\n<<<endtasks>>>"));
    const [t1] = await tasks.listTasks(x.c);
    expect((await tasks.memberInstruct(uid, x.c, t1!.id, "make it shorter"))!.status).toBe("open");
    // an answer to the earlier question can't close it — the member spoke after that question
    const stale = await tasks.recordTasks(base(x, "<<<tasks>>>\nt1 | done | A | ok again\n<<<endtasks>>>", { wantDone: true }));
    expect(stale.blocked).toBe(true);
    expect((await tasks.listTasks(x.c))[0]!.pending?.body).toBe("make it shorter");
    const closed = await tasks.recordTasks(base(x, "", { wantDone: true, memberCloses: true }));
    expect(closed.blocked).toBe(false);
    expect((await tasks.listTasks(x.c))[0]!.status).toBe("dropped");
    expect((await tasks.listEvents(x.c, t1!.id)).map((e) => e.kind)).toEqual(["created", "instruct", "refused", "drop"]);
  }, 30_000);
});
