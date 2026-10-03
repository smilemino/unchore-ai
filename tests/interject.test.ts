// Messages sent mid-answer go into that answer (AI Soul worker/engines/claude.ts «끼어들기» → worker/claude.mjs interject · lib/interject.ts).
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const U = "11111111-2222-4333-8444-555555555555";
const T = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("the worker keeps the answer listening (worker/claude.mjs)", () => {
  let claude: typeof import("../worker/claude.mjs");
  beforeAll(async () => {
    vi.stubEnv("CLAUDE_BIN", path.resolve("tests/fixtures/fake-claude-interject.mjs"));
    vi.stubEnv("CLAUDE_HOME_ROOT", mkdtempSync(path.join(os.tmpdir(), "uc-interject-")));
    vi.resetModules();
    claude = await import("../worker/claude.mjs");
  });
  afterAll(() => vi.unstubAllEnvs());

  it("a message sent while the answer is written is answered in the same answer; after it ends, it is refused", async () => {
    let out = "", tried: boolean | null = null;
    const r = await claude.chat(U, { model: "sonnet", turn: T, messages: [{ role: "user", content: "first" }] }, (t: string) => {
      out += t;
      if (tried === null) tried = claude.interject(U, T, "also this");   // the first words are out: the member adds something
    });
    expect(r.ok).toBe(true);
    expect(tried).toBe(true);
    expect(out).toBe("heard:first +also this");
    expect(claude.interject(U, T, "too late")).toBe(false);   // the answer is over — the app keeps it waiting for its own turn
  });

  it("without a turn key nothing can join, and another member's key never reaches this answer", async () => {
    let other: boolean | null = null, none: boolean | null = null;
    const r = await claude.chat(U, { model: "sonnet", messages: [{ role: "user", content: "solo" }] }, () => {
      if (none === null) { none = claude.interject(U, T, "x"); other = claude.interject("99999999-2222-4333-8444-555555555555", T, "x"); }
    });
    expect(r.ok).toBe(true);
    expect([none, other]).toEqual([false, false]);
  });

  it("a picture sent mid-answer goes in with its words; an odd one is refused, not dropped quietly", async () => {
    let tried: boolean | null = null, odd: boolean | null = null, many: boolean | null = null, out = "";
    const pic = { mime: "image/png", b64: "iVBORw0KGgo=" };
    await claude.chat(U, { model: "sonnet", turn: T, messages: [{ role: "user", content: "q" }] }, (t: string) => {
      out += t;
      if (tried === null) {
        odd = claude.interject(U, T, "see", [{ mime: "application/pdf", b64: "x" }]);
        many = claude.interject(U, T, "see", Array(6).fill(pic));
        tried = claude.interject(U, T, "see this", [pic]);
      }
    });
    expect([tried, odd, many]).toEqual([true, false, false]);
    expect(out).toBe("heard:q +see this[1 picture]");
  });

  it("empty words are not sent in", async () => {
    let tried: boolean | null = null;
    await claude.chat(U, { model: "sonnet", turn: T, messages: [{ role: "user", content: "q" }] }, () => { if (tried === null) tried = claude.interject(U, T, "  "); });
    expect(tried).toBe(false);
  });
});

// ready: false = a file not ready to read yet (a video without its words) — the query leaves that message for its own turn
type Row = { id: string; text: string; created_at: string; held?: boolean; file_ids?: string[]; ready?: boolean };
const db = vi.hoisted(() => ({ queue: [] as Row[], messages: [] as string[], back: [] as unknown[][], linked: [] as unknown[][] }));
vi.mock("@/lib/db", () => ({
  q: async (sql: string, args: unknown[]) => {
    if (sql.startsWith("delete from chat_queue")) {
      const i = db.queue.findIndex((r) => !r.held && r.ready !== false);
      return i < 0 ? [] : db.queue.splice(i, 1).map((r) => ({ id: r.id, text: r.text, created_at: r.created_at, file_ids: r.file_ids ?? [] }));
    }
    if (sql.startsWith("insert into messages")) { db.messages.push(String(args[1])); return [{ id: "m1" }]; }
    if (sql.startsWith("update files")) { db.linked.push(args); return []; }
    if (sql.startsWith("insert into chat_queue")) { db.back.push(args); return []; }
    throw new Error(`unexpected ${sql}`);
  },
}));
vi.mock("@/lib/privacy", () => ({ lock: (s: string) => `L(${s})`, unlock: (s: string) => s.replace(/^L\((.*)\)$/, "$1") }));
vi.mock("@/lib/claude-sub", () => ({ subInterject: vi.fn() }));
vi.mock("@/lib/uploads", () => ({ attachFiles: async (_u: string, ids: string[]) => ({ parts: ids.map((i) => `<<file ${i}>>`), images: [{ mime: "image/png", b64: "AA" }] }) }));

describe("the app hands waiting messages to the answer (lib/interject.ts)", () => {
  beforeEach(() => { db.queue = []; db.messages = []; db.back = []; db.linked = []; });

  it("taken by the answer → saved in the chat, not left in the queue", async () => {
    const { interjectOnce } = await import("@/lib/interject");
    db.queue = [{ id: "q1", text: "L(go left)", created_at: "t1" }];
    const push = vi.fn(async () => true);
    expect(await interjectOnce(U, "c", T, push)).toBe(true);
    expect(push).toHaveBeenCalledWith(U, T, "go left", []);
    expect(db.messages).toEqual(["L(go left)"]);
    expect(db.queue).toEqual([]);
  });

  it("the answer already ended (or the worker can't be reached) → back in the queue exactly as it was, not held", async () => {
    const { interjectOnce } = await import("@/lib/interject");
    db.queue = [{ id: "q1", text: "L(go left)", created_at: "t1" }];
    expect(await interjectOnce(U, "c", T, async () => false)).toBe(false);
    expect(await interjectOnce(U, "c", T, async () => { throw new Error("down"); })).toBe(false);
    expect(db.messages).toEqual([]);
    expect(db.back[0]).toEqual(["q1", U, "c", "L(go left)", [], "t1"]);
  });

  it("files ready to read go in with the words and stay linked to the message in the chat", async () => {
    const { interjectOnce } = await import("@/lib/interject");
    db.queue = [{ id: "q1", text: "L(look at this)", created_at: "t1", file_ids: ["f1", "f2"] }];
    const push = vi.fn(async () => true);
    expect(await interjectOnce(U, "c", T, push)).toBe(true);
    expect(push).toHaveBeenCalledWith(U, T, "<<file f1>>\n\n<<file f2>>\n\nlook at this", [{ mime: "image/png", b64: "AA" }]);
    expect(db.messages).toEqual(["L(look at this)"]);
    expect(db.linked).toEqual([[U, ["f1", "f2"], "c", "m1"]]);
  });

  it("a message with files the answer didn't take goes back with its files", async () => {
    const { interjectOnce } = await import("@/lib/interject");
    db.queue = [{ id: "q1", text: "L(see)", created_at: "t1", file_ids: ["f1"] }];
    expect(await interjectOnce(U, "c", T, async () => false)).toBe(false);
    expect(db.linked).toEqual([]);
    expect(db.back[0]).toEqual(["q1", U, "c", "L(see)", ["f1"], "t1"]);
  });

  it("held messages and ones whose files aren't ready to read are left for their own turn", async () => {
    const { interjectOnce } = await import("@/lib/interject");
    db.queue = [{ id: "h", text: "L(a)", created_at: "t", held: true }, { id: "f", text: "L(b)", created_at: "t", file_ids: ["v"], ready: false }];
    const push = vi.fn(async () => true);
    expect(await interjectOnce(U, "c", T, push)).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("the watcher stops cleanly and tells the screen each time one went in", async () => {
    const { watchInterjections } = await import("@/lib/interject");
    db.queue = [{ id: "q1", text: "L(one)", created_at: "t1" }];
    const seen = vi.fn();
    const w = watchInterjections(U, "c", T, seen, async () => true, 20);
    await new Promise((r) => setTimeout(r, 80));
    await w.stop();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(db.messages).toEqual(["L(one)"]);
  });
});
