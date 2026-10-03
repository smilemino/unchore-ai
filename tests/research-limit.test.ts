import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RESEARCH_MAX_MINUTES, researchEndAt } from "@/lib/research";

// Deep research time limit (AI Soul lib/research-limits.ts): shown before pressing, and the answer stops there with a note.
describe("deep research time limit", () => {
  it("ends at its own limit when that comes before the whole answer's deadline", () => {
    expect(researchEndAt(1_000, 1_000 + 760_000)).toBe(1_000 + RESEARCH_MAX_MINUTES * 60_000);
  });
  it("never runs past the whole answer's deadline", () => {
    expect(researchEndAt(1_000, 1_000 + 60_000)).toBe(1_000 + 60_000);
  });
  it("the button shows the limit and the cut answer says it stopped at the limit", () => {
    const chat = readFileSync("components/Chat.tsx", "utf8");
    expect(chat).toMatch(/t\("\{min\} min", \{ min: String\(RESEARCH_MAX_MINUTES\) \}\)/);
    const turn = readFileSync("lib/turn.ts", "utf8");
    expect(turn).toMatch(/d\.research \? researchEndAt\(t0,/);
    expect(turn).toMatch(/cut === "total" && d\.research \? .*Deep research reached its \{min\}-minute limit/);
    const ko = JSON.parse(readFileSync("lib/locales/ko.json", "utf8")) as Record<string, string>;
    expect(ko["⏱ Deep research reached its {min}-minute limit, so it stops here. Ask me to go on."]).toContain("{min}");
    expect(ko["{min} min"]).toBe("{min}분");
  });
});
