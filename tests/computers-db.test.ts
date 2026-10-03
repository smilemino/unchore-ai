// «Connect your computer» (lib/computers.ts · owner 2026-10-02 «everything I do in AI Soul has to work with Unchore's own
// features»). On a real Postgres: a chat whose AI is «🖥 <name>» puts the question on that computer, the program's reports
// become the answer, ■ Stop / «멈춰» reach it, work that outlives the chat's answer comes back as its own message, a computer that
// goes quiet mid-job is noticed, and a disconnected computer's token stops working. Skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", async (orig) => {
  const real = await orig<typeof import("@/lib/ai")>();
  // fake.say set: a connected AI that answers with that text (the voice test); unset: no AI at all — the computer must answer
  return { ...real, userKeys: async () => (fake.say ? { anthropic: "k" } : {}), complete: async () => "",
    streamChat: async function* () { if (fake.say) { yield fake.say; return; } throw new Error("a computer chat must not call an AI provider"); } };
});
const fake = vi.hoisted(() => ({ say: "" }));
vi.mock("@/lib/push", () => ({ pushUser: async () => 1 }));

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("your computer answers the chat (database)", () => {
  let db: typeof import("@/lib/db");
  let turn: typeof import("@/lib/turn");
  let pc: typeof import("@/lib/computers");
  let uid = "", other = "";
  const email = `owner-${randomUUID()}@t.test`;
  const user = () => ({ id: uid, lang: "ko", tz: "Asia/Seoul", default_model: null });
  const unlock = async (s: string) => (await import("@/lib/privacy")).unlock(s);

  /** Plays the program on the computer: takes the next job, reports a step, then finishes with `final`. */
  async function fakeComputer(computerId: string, final: string, o: { stepMs?: number } = {}) {
    for (let i = 0; i < 60; i++) {
      const job = await db.asMember(uid, () => pc.nextJob(computerId));
      if (job) {
        await db.asMember(uid, () => pc.reportJob(computerId, job.id, { append: "Let me look.\n", note: "Bash: ls", session: "sess-1" }));
        await new Promise((r) => setTimeout(r, o.stepMs ?? 300));
        await db.asMember(uid, () => pc.finishJob(job.id, { status: "done", final, session: "sess-1" }, computerId));
        return job;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("no job came");
  }

  beforeAll(async () => {
    const name = `uc_pc_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    process.env.OWNER_EMAILS = `someone@else.test, ${email}`;
    delete process.env.UNCHORE_COMPUTERS;
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    turn = await import("@/lib/turn");
    pc = await import("@/lib/computers");
    uid = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at, lang) values ($1, 'Asia/Seoul', now(), 'ko') returning id", [email]))!.id;
    other = (await db.one<{ id: string }>("insert into users(email, tz, onboarded_at) values ($1, 'Asia/Seoul', now()) returning id", [`m-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("is everyone's (UNCHORE_COMPUTERS: all by default · owner · off)", () => {
    expect(pc.computersOn(email)).toBe(true);
    expect(pc.computersOn("member@t.test")).toBe(true);
    process.env.UNCHORE_COMPUTERS = "owner"; expect(pc.computersOn("member@t.test")).toBe(false); expect(pc.computersOn(email)).toBe(true);
    process.env.UNCHORE_COMPUTERS = "off"; expect(pc.computersOn(email)).toBe(false);
    delete process.env.UNCHORE_COMPUTERS;
  });

  it("a chat on «🖥 name» is answered by the computer, and the next question continues its session", async () => {
    const made = (await db.asMember(uid, () => pc.createComputer(uid, "회사 서버")))!;
    expect(made.token).toMatch(/^ucc_/);
    const c = await pc.computerFromToken(`Bearer ${made.token}`, { host: "pod" });
    expect(c?.id).toBe(made.row.id);
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title, model) values ($1, 'pc', $2) returning id", [uid, pc.computerModel(made.row.id)]))!.id;
    const lines: string[] = [];
    const answer = db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "쇼핑몰 주문 화면 고쳐 줘", turn: randomUUID() }, { send: (s) => lines.push(s) }));
    const job = await fakeComputer(made.row.id, "고쳤습니다. 시험 12개 통과.", { stepMs: 2000 });   // longer than one look (0.7 s), so the step shows
    expect(job.prompt).toContain("쇼핑몰 주문 화면 고쳐 줘");
    expect(job.session).toBeNull();
    const meta = await answer;
    const saved = await db.one<{ content: string; model: string }>("select content, model from messages where id = $1", [meta.messageId]);
    expect(await unlock(saved!.content)).toBe("고쳤습니다. 시험 12개 통과.");
    expect(saved!.model).toBe("🖥 회사 서버");
    expect(lines.join("")).toContain("Bash: ls");   // what it is doing shows as a status line
    // the second question goes to the same Claude Code session
    const second = db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "배포도 해 줘", turn: randomUUID() }, { send: () => {} }));
    const job2 = await fakeComputer(made.row.id, "배포했습니다.");
    expect(job2.session).toBe("sess-1");
    expect(job2.prompt).toBe("배포도 해 줘");
    await second;
    // nobody else can see this computer
    expect(await db.asMember(other, () => pc.listComputers(uid))).toHaveLength(0);
  }, 90_000);   // the first turn in a test run loads the whole chat code (≈12 s cold); a warm turn hands over in under 2 s

  it("work that outlives the chat's answer comes back as its own message, and the chat isn't tidied into «Done» meanwhile", async () => {
    const made = (await db.asMember(uid, () => pc.createComputer(uid, "노트북")))!;
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'late') returning id", [uid]))!.id;
    const q1 = (await db.one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'user', 'long job') returning id", [conv]))!.id;
    const w = await db.asMember(uid, () => pc.runOnComputer({ userId: uid, computer: { id: made.row.id, name: "노트북" }, convId: conv, questionId: q1, prompt: "long job", system: "",
      signal: new AbortController().signal, deadline: Date.now() + 1200, status: () => {}, t: (s) => s }));
    expect(w.status).toBe("running");
    await db.q("insert into messages(conversation_id, role, content, created_at) values ($1, 'assistant', 'still working', now() - interval '1 hour')", [conv]);
    await db.q("update conversations set seen_ai = 1 where id = $1", [conv]);
    const { autoDone } = await import("@/lib/auto-done");
    await autoDone();
    expect((await db.one<{ done: boolean }>("select done from conversations where id = $1", [conv]))!.done).toBe(false);
    await fakeComputer(made.row.id, "끝났어요 — 결과 파일 3개");
    const late = await db.one<{ content: string; model: string }>("select content, model from messages where conversation_id = $1 and role = 'assistant' order by created_at desc limit 1", [conv]);
    expect(await unlock(late!.content)).toBe("끝났어요 — 결과 파일 3개");
    expect(late!.model).toBe("🖥 노트북");
  }, 30_000);

  it("«멈춰» stops the work the computer is doing on that chat; the program hears it on its next report", async () => {
    const made = (await db.asMember(uid, () => pc.createComputer(uid, "멈춤 시험")))!;
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title, model) values ($1, 'stop', $2) returning id", [uid, pc.computerModel(made.row.id)]))!.id;
    const q1 = (await db.one<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'user', 'go') returning id", [conv]))!.id;
    void db.asMember(uid, () => pc.runOnComputer({ userId: uid, computer: { id: made.row.id, name: "멈춤 시험" }, convId: conv, questionId: q1, prompt: "go", system: "",
      signal: new AbortController().signal, deadline: Date.now() + 1000, status: () => {}, t: (s) => s }));
    await new Promise((r) => setTimeout(r, 300));
    const job = (await db.asMember(uid, () => pc.nextJob(made.row.id)))!;
    const meta = await db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "멈춰", turn: randomUUID() }, { send: () => {} }));
    const said = await db.one<{ content: string }>("select content from messages where id = $1", [meta.messageId]);
    expect(await unlock(said!.content)).toContain("멈춤 시험");
    expect((await db.asMember(uid, () => pc.reportJob(made.row.id, job.id, { note: "working" })))?.stop).toBe(true);
  }, 30_000);

  it("a computer that goes quiet mid-job: the job ends as lost and says so in the chat", async () => {
    const made = (await db.asMember(uid, () => pc.createComputer(uid, "꺼진 컴퓨터")))!;
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'lost') returning id", [uid]))!.id;
    const job = (await db.one<{ id: string }>(`insert into computer_jobs(user_id, computer_id, conversation_id, prompt, status, started_at, heartbeat_at, deferred)
      values ($1, $2, $3, 'x', 'running', now() - interval '1 hour', now() - interval '1 hour', true) returning id`, [uid, made.row.id, conv]))!.id;
    expect(await db.asMember(uid, () => pc.nextJob(made.row.id))).toBeNull();
    expect((await db.one<{ status: string }>("select status from computer_jobs where id = $1", [job]))!.status).toBe("failed");
    const late = await db.one<{ content: string; asks: boolean }>("select content, asks from messages where conversation_id = $1 order by created_at desc limit 1", [conv]);
    expect(await unlock(late!.content)).toContain("꺼진 컴퓨터");
    expect(late!.asks).toBe(true);
  }, 30_000);

  it("files go both ways: the question's attachments to the computer (only while the job runs), what it sends back onto the answer", async () => {
    const { lockBytes } = await import("@/lib/privacy");
    const made = (await db.asMember(uid, () => pc.createComputer(uid, "파일 시험")))!;
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title, model) values ($1, 'files', $2) returning id", [uid, pc.computerModel(made.row.id)]))!.id;
    const att = (await db.one<{ id: string }>("insert into files(user_id, conversation_id, name, mime, size, data) values ($1, $2, '매출.csv', 'text/csv', 9, $3) returning id", [uid, conv, lockBytes(Buffer.from("a,1\nb,2\n"))]))!.id;
    const mine = (await db.one<{ id: string }>("insert into files(user_id, name, mime, size, data) values ($1, 'other.txt', 'text/plain', 1, $2) returning id", [uid, lockBytes(Buffer.from("x"))]))!.id;
    const answer = db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "합계 그림 만들어 줘", fileIds: [att], turn: randomUUID() }, { send: () => {} }));
    let job: Awaited<ReturnType<typeof pc.nextJob>> = null;
    for (let i = 0; i < 100 && !job; i++) { job = await db.asMember(uid, () => pc.nextJob(made.row.id)); if (!job) await new Promise((r) => setTimeout(r, 200)); }
    expect(job!.files.map((f) => f.name)).toEqual(["매출.csv"]);
    expect((await db.asMember(uid, () => pc.jobFile(made.row.id, job!.id, att)))!.data.toString()).toBe("a,1\nb,2\n");
    expect(await db.asMember(uid, () => pc.jobFile(made.row.id, job!.id, mine))).toBeNull();   // a file not on this question
    const back = await db.asMember(uid, () => pc.addMadeFile(made.row.id, job!.id, "../합계.svg", Buffer.from("<svg/>")));
    expect(back).toMatchObject({ id: expect.any(String) });
    await db.asMember(uid, () => pc.finishJob(job!.id, { status: "done", final: "합계는 3이에요." }, made.row.id));
    const meta = await answer;
    expect(meta.files?.map((f) => [f.name, f.mime])).toEqual([[".._합계.svg", "image/svg+xml"]]);
    expect((await db.one<{ message_id: string }>("select message_id from files where id = $1", [(back as { id: string }).id]))!.message_id).toBe(meta.messageId);
    expect(await db.asMember(uid, () => pc.jobFile(made.row.id, job!.id, att))).toBeNull();   // the job is over: nothing to fetch any more
    expect(await db.asMember(uid, () => pc.addMadeFile(made.row.id, job!.id, "late.txt", Buffer.from("x")))).toBeNull();
    await db.asMember(uid, () => pc.removeComputer(uid, made.row.id));   // a member keeps up to 5 computers — leave room for the next test
  }, 60_000);

  it("voice mode on a computer chat: a quick AI talks, and the work it hands over ([[computer: …]]) goes to the computer", async () => {
    const made = (await db.asMember(uid, () => pc.createComputer(uid, "말 시험")))!;
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title, model) values ($1, 'voice', $2) returning id", [uid, pc.computerModel(made.row.id)]))!.id;
    fake.say = "네, 말 시험이 확인하고 끝나면 알려 드릴게요.\n[[computer: 쇼핑몰 오늘 주문 수를 세어 알려 주기]]";
    try {
      const meta = await db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "오늘 주문 몇 개야?", turn: randomUUID(), voice: { lang: "ko-KR", current: "" } }, { send: () => {} }));
      const said = await db.one<{ content: string; model: string }>("select content, model from messages where id = $1", [meta.messageId]);
      expect(await unlock(said!.content)).toBe("네, 말 시험이 확인하고 끝나면 알려 드릴게요.");   // the hand-off line is not read aloud
      expect(said!.model).not.toContain("🖥");
      expect(meta.later).toBe(true);   // the screen keeps looking for the result (and dings in voice mode)
      const job = (await db.asMember(uid, () => pc.nextJob(made.row.id)))!;
      expect(job.prompt).toContain("쇼핑몰 오늘 주문 수를 세어 알려 주기");
      expect(job.prompt).toContain("오늘 주문 몇 개야?");
      expect(job.system).toContain("You are running on the member's own computer");
      expect(job.system).not.toContain("[[computer:");
      await db.asMember(uid, () => pc.finishJob(job.id, { status: "done", final: "오늘 주문은 42개예요." }, made.row.id));
      const late = await db.one<{ content: string; model: string }>("select content, model from messages where conversation_id = $1 and role = 'assistant' order by created_at desc limit 1", [conv]);
      expect(await unlock(late!.content)).toBe("오늘 주문은 42개예요.");
      expect(late!.model).toBe("🖥 말 시험");
      // small talk hands nothing over
      fake.say = "안녕하세요!";
      await db.asMember(uid, () => turn.runTurn(user(), { conversationId: conv, text: "안녕", turn: randomUUID(), voice: { lang: "ko-KR", current: "" } }, { send: () => {} }));
      expect(await db.asMember(uid, () => pc.nextJob(made.row.id))).toBeNull();
    } finally { fake.say = ""; await db.asMember(uid, () => pc.removeComputer(uid, made.row.id)); }
  }, 60_000);

  it("disconnecting stops the token at once and drops work not started", async () => {
    const made = (await db.asMember(uid, () => pc.createComputer(uid, "지울 컴퓨터")))!;
    const conv = (await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, 'rm') returning id", [uid]))!.id;
    await db.q("insert into computer_jobs(user_id, computer_id, conversation_id, prompt) values ($1, $2, $3, 'x')", [uid, made.row.id, conv]);
    expect(await db.asMember(uid, () => pc.removeComputer(uid, made.row.id))).toBe(true);
    expect(await pc.computerFromToken(`Bearer ${made.token}`)).toBeNull();
    expect((await db.one<{ n: number }>("select count(*)::int as n from computer_jobs where computer_id = $1 and status = 'queued'", [made.row.id]))!.n).toBe(0);
  });

  it("the first question on a computer carries the chat so far; later ones don't", () => {
    const earlier = [{ role: "user", content: "앞 질문" }, { role: "assistant", content: "앞 답" }];
    expect(pc.jobPrompt("지금 질문", earlier, false)).toContain("앞 답");
    expect(pc.jobPrompt("지금 질문", earlier, true)).toBe("지금 질문");
    expect(pc.STOP_WORDS.test("멈춰")).toBe(true);
    expect(pc.STOP_WORDS.test("멈춰서 생각해 보면 이 방법이 낫나요?")).toBe(false);
  });
});
