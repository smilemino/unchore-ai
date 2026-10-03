import { describe, expect, it } from "vitest";
import { blocked, MEMORY_BUDGET, memoryBlock, memoryDay, pickMemories, type Memory } from "@/lib/memory";

const mem = (id: string, text: string, created_at = ""): Memory => ({ id, text, created_at });

describe("picking memories (AI Soul memory-pick)", () => {
  it("the budget is 12,000 characters, so many memories fit", () => {
    expect(MEMORY_BUDGET).toBe(12_000);
    const all = Array.from({ length: 30 }, (_, i) => mem(`m${i}`, `Fact ${i} `.padEnd(300, "x")));
    expect(pickMemories("hello", all)).toHaveLength(30);   // 9,000 characters — 4,000 used to stop at 13
  });
  it("a long memory that doesn't fit is skipped, the shorter ones after it still go in", () => {
    const all = [mem("a", "a".repeat(3000)), mem("big", "b".repeat(9500)), mem("c", "short fact about tea"), mem("d", "another short fact")];
    expect(pickMemories("hi", all).map((m) => m.id)).toEqual(["a", "c", "d"]);
  });
});

describe("dates on remembered lines", () => {
  it("each line shows the day it was saved, in the member's time zone", () => {
    const b = memoryBlock([mem("x", "Moved to Lisbon", "2026-09-22T23:30:00Z"), mem("y", "Likes short answers")], "Asia/Seoul");
    expect(b).toContain("- [2026-09-23] Moved to Lisbon");
    expect(b).toContain("- Likes short answers");   // no date known → no stamp, nothing made up
  });
  it("reads a Date from the database and survives a bad time zone", () => {
    expect(memoryDay(new Date("2026-01-05T10:00:00Z"))).toBe("2026-01-05");
    expect(memoryDay("2026-01-05T10:00:00Z", "Not/AZone")).toBe("2026-01-05");
    expect(memoryDay("not a date")).toBe("");
    expect(memoryBlock([])).toBe("");
  });
});

describe("filter: addresses and money sent", () => {
  it("blocks street addresses", () => {
    expect(blocked("Lives at 1600 Pennsylvania Avenue")).toContain("address");
    expect(blocked("Home is 12 Oak St. near the park")).toContain("address");
    expect(blocked("서초구 반포대로 58 에 산다")).toContain("address");
  });
  it("blocks money sent, lent or owed with an amount", () => {
    expect(blocked("Wired $500 to their brother last week")).toContain("money");
    expect(blocked("Owes 2,000 euros to a friend")).toContain("money");
    expect(blocked("엄마에게 30만원 송금했다")).toContain("money");
  });
  it("keeps ordinary facts, prices and budgets", () => {
    for (const t of ["Pays for the Pro subscription every month", "Laptop budget is about $1,200", "Runs 5 km every morning", "Works on 3 projects at once", "Prefers the 2 way split"])
      expect(blocked(t), t).toEqual([]);
  });
});
