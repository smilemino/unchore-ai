import { describe, expect, it } from "vitest";
import { clipEnds, heardOnce, saidLine } from "../lib/said";

// Earlier messages passed on to the AI keep the member's point (AI Soul 22dc5b6 · lib/said.ts).
describe("the member's earlier words", () => {
  it("dictation saved as growing beginnings run together → the last take only", () => {
    expect(heardOnce("nownow Inow I thinknow I think the problem isnow I think the problem is you forget my answers")).toBe("now I think the problem is you forget my answers");
    expect(heardOnce("지금지금 대화에지금 대화에 가장지금 대화에 가장 큰 문제는")).toBe("지금 대화에 가장 큰 문제는");
    expect(heardOnce("switch toswitch to the new TTSswitch to the new tts voice please")).toBe("switch to the new tts voice please");   // case only differs between takes
  });
  it("ordinary words and spoken repeats stay as they are", () => {
    for (const x of ["yes yes okay", "no no no", "how do I raise repeat orders?", "ok", "", "aaa", "100100", "hahaha", "ㅋㅋㅋㅋ", "go gogo", "zzz so sleepy", "!!! that worked", "ㅋㅋㅋ 좋아요", "aaa b", "[[voice=think]] should I raise prices?"]) expect(heardOnce(x)).toBe(x.trim());
  });
  it("a long reply keeps its first 30% and last 70% — the point is at the end", () => {
    const s = `${"blah ".repeat(300)}so the answer is no`;
    const c = clipEnds(s, 200);
    expect(c.length).toBeLessThanOrEqual(200);
    expect(c.startsWith("blah ")).toBe(true);
    expect(c.endsWith("so the answer is no")).toBe(true);
    expect(clipEnds("short", 200)).toBe("short");
  });
  it("a run-together take longer than the old 800-char cut becomes one sentence; AI lines are cut from the start as before", () => {
    const full = "what I mean is keep working on the goal until it is done without stopping";
    const long = Array.from({ length: full.length }, (_, i) => full.slice(0, i + 1)).join("");
    expect(long.length).toBeGreaterThan(800);   // the old version kept only the first 800 chars and lost the meaning
    expect(long.slice(0, 800)).not.toContain(full);
    expect(saidLine("user", long, 800)).toBe(`User: ${full}`);
    expect(saidLine("assistant", `start ${"x".repeat(900)} end`, 20)).toBe(`AI: start ${"x".repeat(14)}`);
  });
});
