// Batch 18 (owner «yes» 2026-09-30 08:55): my words, taste memory (AI Soul lib/glossary*.ts · lib/taste.ts).
import { describe, expect, it } from "vitest";
import { glossaryBlock, keepPairs, mentionsGlossary } from "@/lib/glossary";
import { leanings, questionOf, tagsOf, tasteBlock, yesNo } from "@/lib/taste";

describe("my words", () => {
  it("hears «call it Y, not X» in Korean and English, not in ordinary talk", () => {
    expect(mentionsGlossary("고객이라고 하지 말고 회원이라고 해")).toBe(true);
    expect(mentionsGlossary("Don't call them customers, call them members")).toBe(true);
    expect(mentionsGlossary("Say «members» instead of «users» from now on")).toBe(true);
    expect(mentionsGlossary("What's the weather tomorrow?")).toBe(false);
  });
  it("keeps only words the member wrote, not already known, not the same word", () => {
    const said = "고객이라고 하지 말고 회원이라고 해";
    expect(keepPairs([{ avoid: "고객", use: "회원" }, { avoid: "손님", use: "회" }, { avoid: "고객", use: "고객" }], said, [])).toEqual([{ avoid: "고객", use: "회원" }]);
    expect(keepPairs([{ avoid: "고객", use: "회원" }], said, [{ avoid: "고객", use: "x" }])).toEqual([]);
    expect(keepPairs("nope", said, [])).toEqual([]);
    expect(glossaryBlock([{ avoid: "고객", use: "회원" }])).toContain("say «회원», not «고객»");
  });
});

describe("taste", () => {
  it("short yes/no in many languages; anything longer is not a vote", () => {
    expect(yesNo("네")).toBe(true); expect(yesNo("Yes!")).toBe(true); expect(yesNo("좋아요")).toBe(true); expect(yesNo("はい")).toBe(true);
    expect(yesNo("아니요")).toBe(false); expect(yesNo("nope")).toBe(false);
    expect(yesNo("yes but make it 9pm instead please")).toBeNull();
    expect(yesNo("maybe")).toBeNull();
  });
  it("words of the question lean, fade 5% a week, drop under 0.3", () => {
    expect(questionOf("Here is the plan.\nShall I send the dollar rate every morning?")).toContain("dollar rate every morning");
    expect(tagsOf("Shall I send the dollar rate every morning?")).toEqual(["send", "dollar", "rate", "every", "morning"]);
    const now = Date.parse("2026-09-30T00:00:00Z"), week = 7 * 86_400_000;
    const l = leanings([{ question: "", yes: true, tags: ["dollar"], at: now }, { question: "", yes: true, tags: ["dollar"], at: now - 10 * week }, { question: "", yes: false, tags: ["weather"], at: now - 60 * week }], now);
    expect(l[0]!.tag).toBe("dollar");
    expect(l[0]!.score).toBeCloseTo(1 + Math.pow(0.95, 10), 2);
    expect(l.find((x) => x.tag === "weather")).toBeUndefined();   // 0.95^60 ≈ 0.05
    expect(tasteBlock([], now)).toBe("");
    expect(tasteBlock([{ question: "Send the dollar rate?", yes: true, tags: ["dollar"], at: now }], now)).toContain("+dollar");
  });
});
