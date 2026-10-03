// Several live reads in one answer (night 2026-10-01): a «weather, dollar rate and AI news every morning» brief read only one of them.
import { describe, expect, it } from "vitest";
import { MAX_READS, RULES, liveNote, parseReads } from "@/lib/live";
import { systemPrompt } from "@/lib/persona";

describe("parseReads", () => {
  it("reads the list shape", () => {
    expect(parseReads('{"reads":[{"recipe":"weather","args":{"place":"Seoul"}},{"recipe":"fx","args":{"from":"USD","to":"KRW"}},{"recipe":"news","args":{"query":"AI","lang":"ko"}}]}'))
      .toEqual([{ recipe: "weather", args: { place: "Seoul" } }, { recipe: "fx", args: { from: "USD", to: "KRW" } }, { recipe: "news", args: { query: "AI", lang: "ko" } }]);
  });
  it("still reads the older single shape, and none", () => {
    expect(parseReads('```json\n{"recipe":"crypto","args":{"coin":"BTC","vs":"KRW"}}\n```')).toEqual([{ recipe: "crypto", args: { coin: "BTC", vs: "KRW" } }]);
    expect(parseReads('{"reads":[]}')).toEqual([]);
    expect(parseReads("{}")).toEqual([]);
    expect(parseReads("no json here")).toEqual([]);
  });
  it("keeps at most MAX_READS and drops broken entries", () => {
    const many = Array.from({ length: 7 }, () => ({ recipe: "news", args: { query: "x" } }));
    expect(parseReads(JSON.stringify({ reads: many }))).toHaveLength(MAX_READS);
    expect(parseReads('{"reads":[{"args":{}},null,{"recipe":"fx"}]}')).toEqual([{ recipe: "fx", args: {} }]);
  });
  it("the live note carries the read time in the member's clock", () => {
    const n = liveNote({ recipe: "fx", args: {}, result: { ok: true, line: "1 USD = 1,355.4 KRW (ECB 2026-09-30)" } }, "ko", "Asia/Seoul");
    expect(n).toMatch(/read just now \(\d{4}-\d{2}-\d{2}, \d{2}:\d{2} Asia\/Seoul\)/);
    expect(liveNote({ recipe: "fx", args: {}, result: { ok: true, line: "x" } }, "ko")).toContain("read just now by");
  });
});

// Night 2026-10-01 round 11: «달러 환율 좀 꾸준히 챙겨 봐 줄래요?» → «지금은 실시간 환율을 조회할 수 없어요» (no read, and the prompt said «cannot browse»).
describe("keeping an eye on a value", () => {
  it("the read picker is told a scheduled watch needs today's value", () => {
    expect(RULES("2026-10-01", { lang: "ko", tz: "Asia/Seoul" })).toMatch(/kept posted on such a value on a schedule/);
  });
  it("without web search the answer is told not to say live values can't be read", () => {
    const p = systemPrompt("ko", "Asia/Seoul", { webSearch: false });
    expect(p).toMatch(/Don't tell the user live values can't be read/);
    expect(p).not.toMatch(/suggest where to check live values/);
  });
});

