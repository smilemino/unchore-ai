// Port batch 8 from AI Soul (2026-09-30 sync): no light model for fix-ups, unsent attachments kept with the draft.
import { describe, expect, it } from "vitest";
import { needsContext } from "@/lib/pick-floor";
import { readDraftFiles, writeDraftFiles } from "@/lib/draft-files";

describe("fix-ups of an earlier answer get the strong model", () => {
  it("catches Korean and English complaints only after an answer exists", () => {
    expect(needsContext("아직도 안 되는데요", true)).toBe(true);
    expect(needsContext("그게 아니고 어제 말한 거", true)).toBe(true);
    expect(needsContext("That's not what I meant", true)).toBe(true);
    expect(needsContext("still not working", true)).toBe(true);
    expect(needsContext("아직도 안 되는데요", false)).toBe(false);
    expect(needsContext("오늘 날씨 어때?", true)).toBe(false);
    expect(needsContext("thanks!", true)).toBe(false);
    expect(needsContext("x".repeat(1501), false)).toBe(true);
  });
});

describe("unsent attachments stay with the draft", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
  it("keeps only the chip fields per chat and clears when empty", () => {
    const s = mem();
    writeDraftFiles(s, "c1", [{ id: "f1", name: "a.pdf", mime: "application/pdf", size: 10, extra: "x" } as never]);
    expect(readDraftFiles(s, "c1")).toEqual([{ id: "f1", name: "a.pdf", mime: "application/pdf", size: 10 }]);
    expect(readDraftFiles(s, null)).toEqual([]);
    writeDraftFiles(s, "c1", []);
    expect(s.m.size).toBe(0);
  });
  it("survives junk in storage", () => {
    const s = mem(); s.setItem("uc_draft_files:new", "{broken");
    expect(readDraftFiles(s, null)).toEqual([]);
    s.setItem("uc_draft_files:new", JSON.stringify([{ id: 1 }, { id: "ok", name: "b.txt", mime: "text/plain", size: 1 }]));
    expect(readDraftFiles(s, null).map((f) => f.id)).toEqual(["ok"]);
  });
});
