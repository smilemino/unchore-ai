import { describe, expect, it } from "vitest";
import { readMemoryNote } from "../lib/memory";

// «🧠 Memory updated» kept with the answer (AI Soul MemoryNote): the words read back; anything odd reads as none.
describe("memory note kept with an answer", () => {
  it("reads counts and the added / changed / removed words back", () => {
    const raw = JSON.stringify({ added: 1, updated: 1, removed: 1, items: [{ op: "+", text: "커피는 라테" }, { op: "✎", text: "회의는 화요일" }, { op: "−", text: "옛 주소" }] });
    expect(readMemoryNote(raw)).toEqual({ added: 1, updated: 1, removed: 1, items: [{ op: "+", text: "커피는 라테" }, { op: "✎", text: "회의는 화요일" }, { op: "−", text: "옛 주소" }] });
  });
  it("an older note with counts only still shows its counts", () => {
    expect(readMemoryNote(JSON.stringify({ added: 2, updated: 0, removed: 0 }))).toEqual({ added: 2, updated: 0, removed: 0, items: [] });
  });
  it("broken, odd or empty notes read as none, and odd items are dropped", () => {
    expect(readMemoryNote(null)).toBeNull();
    expect(readMemoryNote("{not json")).toBeNull();
    expect(readMemoryNote(JSON.stringify({ added: -1, updated: 0, removed: 0 }))).toBeNull();
    expect(readMemoryNote(JSON.stringify({ added: 1, updated: 0, removed: 0, items: [{ op: "x", text: "?" }, { op: "+", text: 3 }] }))?.items).toEqual([]);
  });
});
