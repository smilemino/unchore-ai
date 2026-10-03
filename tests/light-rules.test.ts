import { describe, expect, it } from "vitest";
import { lightRules, systemPrompt } from "@/lib/persona";

// 2026-09-29 owner: standing instructions grow, so keep them light (synced from AI Soul «한 줄 규칙 + 본문»).
describe("light standing instructions", () => {
  const long = (w: string) => `${w} ` + "자세한 설명입니다. ".repeat(320);
  const rules = [
    "- 답은 존댓말로 짧게",
    `- 세금 계산 규칙\n${long("부가세")}`,
    `- 고객 메일 규칙\n${long("환불")}`,
    `- 광고 문구 규칙\n${long("광고")}`,
  ].join("\n");

  it("keeps short instructions whole", () => {
    expect(lightRules("- 짧게 답하기\n- 존댓말", "아무 질문")).toBe("- 짧게 답하기\n- 존댓말");
  });
  it("keeps every rule's first line and opens only the parts the question touches", () => {
    expect(rules.length).toBeGreaterThan(8000);
    const out = lightRules(rules, "환불 메일 답장 써 줘");
    for (const h of ["답은 존댓말로 짧게", "세금 계산 규칙", "고객 메일 규칙", "광고 문구 규칙"]) expect(out).toContain(h);
    expect(out).toContain("환불 자세한 설명");
    expect(out).not.toContain("부가세 자세한 설명");
    expect(out).toContain("- 세금 계산 규칙 (…)");
    expect(out.length).toBeLessThan(rules.length);
  });
  it("puts instructions up to 8,000 characters and project instructions up to 20,000 in whole", () => {
    const mid = Array.from({ length: 60 }, (_, i) => `- rule ${i}\n${"detail ".repeat(15)}tail${i}`).join("\n");
    expect(mid.length).toBeGreaterThan(3000);
    expect(mid.length).toBeLessThan(8000);
    expect(systemPrompt("en", "UTC", { rules: mid, question: "hello" })).toContain(mid);
    const big = Array.from({ length: 150 }, (_, i) => `- step ${i}\n${"detail ".repeat(15)}tail${i}`).join("\n");
    expect(big.length).toBeGreaterThan(8000);
    expect(big.length).toBeLessThan(20000);
    expect(systemPrompt("en", "UTC", { project: { name: "P", instructions: big }, question: "hello" })).toContain(big);
  });
  it("reaches the system prompt with the question", () => {
    const sp = systemPrompt("ko", "Asia/Seoul", { rules, question: "광고 문구 만들어 줘" });
    expect(sp).toContain("광고 자세한 설명");
    expect(sp).not.toContain("환불 자세한 설명");
  });
});
