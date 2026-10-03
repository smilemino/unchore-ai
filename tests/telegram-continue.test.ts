// «Continue in Telegram» from a chat's menu (ported from AI Soul's title menu, lib/tg-handoff.ts): the linked Telegram chat
// writes into the chat the member picked, only their own; /new in Telegram starts a fresh one.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sql: [] as { sql: string; params: unknown[] }[], conv: null as null | { title: string }, link: null as null | { chat_id: string } }));
vi.mock("@/lib/db", () => ({
  q: async (sql: string, params: unknown[]) => { db.sql.push({ sql, params }); return []; },
  one: async (sql: string, params: unknown[]) => {
    db.sql.push({ sql, params });
    if (sql.includes("from conversations")) return db.conv;
    if (sql.startsWith("update telegram_links")) return db.link;
    if (sql.includes("select lang")) return { lang: "en" };
    if (sql.includes("from telegram_links where chat_id")) return { user_id: "u1", conversation_id: "c0" };
    if (sql.includes("from users")) return { id: "u1", lang: "en", tz: "UTC", default_model: null };
    return null;
  },
  asMember: async (_id: string, f: () => unknown) => f(),
  asOwner: async (f: () => unknown) => f(),
}));
vi.mock("@/lib/privacy", () => ({ unlock: (s: string) => s }));

const sent: string[] = [];
beforeEach(() => {
  db.sql = []; db.conv = null; db.link = null; sent.length = 0;
  process.env.TELEGRAM_BOT_TOKEN_UNCHORE = "t"; process.env.TELEGRAM_BOT_USERNAME = "b";
  vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => { const b = JSON.parse(init.body); if (b.text) sent.push(b.text); return new Response("{}"); });
});

describe("continue a chat in Telegram", () => {
  it("moves Telegram into the member's own chat and says which one there", async () => {
    const { continueIn } = await import("@/lib/telegram");
    db.conv = { title: "Trip plan" }; db.link = { chat_id: "42" };
    expect(await continueIn("u1", "c1")).toBe(true);
    const upd = db.sql.find((x) => x.sql.startsWith("update telegram_links"))!;
    expect(upd.params).toEqual(["u1", "c1"]);
    expect(sent[0]).toContain("«Trip plan»");
  });
  it("refuses someone else's chat and changes nothing", async () => {
    const { continueIn } = await import("@/lib/telegram");
    db.link = { chat_id: "42" };
    expect(await continueIn("u1", "c-other")).toBe(false);
    expect(db.sql.some((x) => x.sql.startsWith("update"))).toBe(false);
    expect(sent).toEqual([]);
  });
  it("is false when Telegram isn't linked", async () => {
    const { continueIn } = await import("@/lib/telegram");
    db.conv = { title: "x" };
    expect(await continueIn("u1", "c1")).toBe(false);
    expect(sent).toEqual([]);
  });
  it("/new in Telegram lets the next message start a new chat", async () => {
    const { handleUpdate } = await import("@/lib/telegram");
    await handleUpdate({ message: { chat: { id: 42, type: "private" }, text: "/new" } });
    expect(db.sql.find((x) => x.sql.includes("conversation_id = null"))?.params).toEqual([42]);
    expect(sent[0]).toMatch(/new chat/);
  });
});
