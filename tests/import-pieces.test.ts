// Chat import (AI Soul lib/claude-import.ts): exports over 4 MB come up in pieces (up to 50 MB), and the same export uploaded
// again adds nothing twice — each chat keeps the export's own id (db/migrations/046).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";

const db = vi.hoisted(() => ({ known: [] as string[], convs: [] as string[], msgs: 0, deleted: [] as string[], up: null as null | { size: number; parts: number }, pieces: [] as { idx: number; data: Buffer }[] }));
vi.mock("@/lib/api", () => ({ requireUser: async () => ({ id: "u1" }), isResp: () => false }));
vi.mock("@/lib/privacy", () => ({ lock: (s: string) => s, unlockBytes: (b: Buffer) => b }));
vi.mock("@/lib/db", () => ({
  one: async (sql: string, p: unknown[]) => {
    if (sql.includes("from uploads")) return db.up;
    if (sql.startsWith("insert into conversations")) {
      const id = p[3] as string | null;
      if (id && (db.known.includes(id) || db.convs.includes(id))) return null;   // on conflict do nothing
      db.convs.push(id ?? "none"); return { id: `c${db.convs.length}` };
    }
    return null;
  },
  q: async (sql: string, p: unknown[]) => {
    if (sql.startsWith("delete")) { db.deleted.push(sql); return []; }
    if (sql.includes("select import_uuid")) return db.known.filter((k) => (p[1] as string[]).includes(k)).map((import_uuid) => ({ import_uuid }));
    if (sql.includes("from upload_parts")) return db.pieces;
    if (sql.startsWith("insert into messages")) db.msgs++;
    return [];
  },
}));

import { newChats, parseExport, type Imported } from "@/lib/importer";
import { POST } from "@/app/api/import/route";

const chat = (uuid: string) => ({ uuid, name: `Chat ${uuid}`, chat_messages: [{ sender: "human", text: "hi" }, { sender: "assistant", text: "hello" }] });
const asFile = (json: unknown) => { const fd = new FormData(); fd.append("file", new File([JSON.stringify(json)], "conversations.json")); return new Request("https://unchore.ai/api/import", { method: "POST", body: fd }); };

beforeEach(() => { db.known = []; db.convs = []; db.msgs = 0; db.deleted = []; db.up = null; db.pieces = []; });

describe("chat import: no second copies, big exports in pieces", () => {
  it("each chat carries its export id (Claude uuid, ChatGPT id)", () => {
    expect(parseExport([chat("a")])[0]!.uuid).toBe("claude:a");
    const gpt = parseExport([{ id: "g1", title: "x", current_node: "b", mapping: { b: { message: { author: { role: "user" }, content: { parts: ["q"] } }, parent: null } } }]);
    expect(gpt[0]!.uuid).toBe("chatgpt:g1");
    expect(parseExport([{ name: "old", chat_messages: [{ sender: "human", text: "hi" }] }])[0]!.uuid).toBeNull();
  });

  it("newChats skips known ids and repeats in the file, and takes `max` at a time", () => {
    const c = (uuid: string | null): Imported => ({ uuid, title: "t", created: null, messages: [{ role: "user", content: "x" }] });
    const r = newChats([c("a"), c("b"), c("b"), c(null), c("d"), c("e")], new Set(["a"]), 3);
    expect(r.pick.map((x) => x.uuid)).toEqual(["b", null, "d"]);
    expect(r).toMatchObject({ skipped: 2, more: 1 });
  });

  it("uploading the same export again adds nothing", async () => {
    db.known = ["claude:a"];
    const j = await (await POST(asFile([chat("a"), chat("b")]))).json();
    expect(j).toEqual({ imported: 1, skipped: 1, more: 0 });
    expect(db.convs).toEqual(["claude:b"]);
    expect(db.msgs).toBe(2);
  });

  it("a plain upload over 4 MB is refused; pieces are put together up to 50 MB", async () => {
    const big = new FormData(); big.append("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "c.json"));
    expect((await POST(new Request("https://unchore.ai/api/import", { method: "POST", body: big }))).status).toBe(413);
    const zip = Buffer.from(zipSync({ "data/conversations.json": strToU8(JSON.stringify([chat("z")])) }));
    db.up = { size: zip.length, parts: 2 };
    db.pieces = [{ idx: 0, data: zip.subarray(0, 10) }, { idx: 1, data: zip.subarray(10) }];
    const asJson = (upload: string) => new Request("https://unchore.ai/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ upload }) });
    const j = await (await POST(asJson("00000000-0000-0000-0000-000000000001"))).json();
    expect(j).toEqual({ imported: 1, skipped: 0, more: 0 });
    expect(db.deleted).toHaveLength(2);   // the pieces don't stay behind
    db.pieces = [{ idx: 0, data: zip.subarray(0, 10) }];
    expect((await POST(asJson("00000000-0000-0000-0000-000000000001"))).status).toBe(409);   // a missing piece: nothing imported
    db.up = { size: 50 * 1024 * 1024 + 1, parts: 15 };
    expect((await POST(asJson("00000000-0000-0000-0000-000000000001"))).status).toBe(413);
    expect((await POST(asJson("nope"))).status).toBe(404);
  });

  it("the migration only adds a column and a unique index", () => {
    const sql = readFileSync("db/migrations/046_import_uuid.sql", "utf8");
    expect(sql).toMatch(/add column if not exists import_uuid/);
    expect(sql).toMatch(/unique index if not exists conversations_import_uuid on conversations\(user_id, import_uuid\) where import_uuid is not null/);
    expect(sql).not.toMatch(/\bdrop\b|\bdelete\b|alter column/i);
  });
});
