// Port batch 9 from AI Soul (2026-09-30 sync): Claude export ZIP and branches, many memories from one paste.
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { claudeOrder, parseExport, readExportFile } from "@/lib/importer";
import { isHeadingLine, splitMemoryPaste } from "@/lib/memory-import";

const chat = {
  uuid: "c1", name: "Trip", created_at: "2026-09-01T00:00:00Z", current_leaf_message_uuid: "a2",
  chat_messages: [
    { uuid: "q1", sender: "human", text: "plan a trip", parent_message_uuid: "root", index: 0 },
    { uuid: "a1", sender: "assistant", text: "first answer (re-rolled)", parent_message_uuid: "q1", index: 1 },
    { uuid: "a2", sender: "assistant", text: "second answer", parent_message_uuid: "q1", index: 2 },
  ],
};

describe("Claude export", () => {
  it("follows the branch the Claude app shows, not every re-rolled answer", () => {
    expect(claudeOrder(chat).map((m) => m.uuid)).toEqual(["q1", "a2"]);
    expect(parseExport([chat])[0]!.messages.map((m) => m.content)).toEqual(["plan a trip", "second answer"]);
  });
  it("falls back to index order when there are no parent links", () => {
    const c = { chat_messages: [{ uuid: "b", sender: "assistant", text: "B", index: 1 }, { uuid: "a", sender: "human", text: "A", index: 0 }] };
    expect(claudeOrder(c).map((m) => m.uuid)).toEqual(["a", "b"]);
  });
  it("reads the export ZIP as downloaded (conversations.json in a folder) and says so when it's missing", () => {
    const zip = zipSync({ "data-2026/conversations.json": strToU8(JSON.stringify([chat])), "data-2026/users.json": strToU8("[]") });
    const r = readExportFile(zip);
    expect("json" in r && parseExport(r.json).length).toBe(1);
    expect(readExportFile(zipSync({ "x.txt": strToU8("hi") }))).toEqual({ error: "not_zip_export", status: 422 });
    expect(readExportFile(strToU8("not json"))).toEqual({ error: "not_json", status: 400 });
  });
});

describe("many memories from one paste", () => {
  it("adds one per line, keeps dates, leaves out headings and list titles", () => {
    const paste = "```\n[2026-09-18] - Prefers short answers\n## Work\n7. Personal interests\n- Runs a small online shop\n- Wakes up at 6\nPets:\nHas a dog named Bori.\n```";
    const r = splitMemoryPaste(paste);
    expect(r.items).toEqual([
      { date: "2026-09-18", content: "Prefers short answers" },
      { date: null, content: "Runs a small online shop" },
      { date: null, content: "Wakes up at 6" },
      { date: null, content: "Has a dog named Bori." },
    ]);
    expect(r.skipped).toEqual(["## Work", "7. Personal interests", "Pets:"]);
  });
  it("keeps a short real memory that isn't a heading", () => {
    expect(isHeadingLine("아내 생일 3월 5일")).toBe(false);
    expect(isHeadingLine("[회사와 사업]")).toBe(true);
  });
});
