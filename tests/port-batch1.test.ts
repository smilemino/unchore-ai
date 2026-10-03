// Ported from AI Soul, 2026-09-30 sync batch 1: legacy Korean CSV text, year in dates not this year, Enter rule on phones, folded Details.
import { describe, expect, it } from "vitest";
import { decodeText } from "@/lib/text-decode";
import { whenLabel } from "@/lib/schedule";
import { enterSends, isPhoneLike } from "@/lib/composer";
import { splitTech } from "@/lib/answer-fold";

describe("text attachments", () => {
  it("reads UTF-8 and legacy Korean (EUC-KR) the same", () => {
    expect(decodeText(new TextEncoder().encode("이름,금액\n홍길동,1000"))).toBe("이름,금액\n홍길동,1000");
    const euckr = Uint8Array.from([0xc0, 0xcc, 0xb8, 0xa7]);   // «이름» in EUC-KR
    expect(decodeText(euckr)).toBe("이름");
  });
});

describe("dates", () => {
  const now = Date.parse("2026-09-30T00:00:00Z");
  it("adds the year only when it is not this year", () => {
    expect(whenLabel("2027-09-29T10:00:00Z", "en", "UTC", now)).toContain("2027");
    expect(whenLabel("2026-10-01T10:00:00Z", "en", "UTC", now)).not.toContain("2026");
  });
});

describe("Enter in the input box", () => {
  const e = (x: Partial<{ key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }>) => ({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, ...x });
  it("sends on computers, adds a line on phones, never while composing", () => {
    expect(enterSends(e({}), false)).toBe(true);
    expect(enterSends(e({}), true)).toBe(false);
    expect(enterSends(e({ shiftKey: true }), false)).toBe(false);
    expect(enterSends(e({ isComposing: true }), false)).toBe(false);
    expect(enterSends(e({ keyCode: 229 }), false)).toBe(false);
  });
  it("knows phones and iPads", () => {
    expect(isPhoneLike("Mozilla/5.0 (Linux; Android 14) Mobile")).toBe(true);
    expect(isPhoneLike("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5)).toBe(true);
    expect(isPhoneLike("Mozilla/5.0 (Windows NT 10.0; Win64)")).toBe(false);
  });
});

describe("folded Details", () => {
  const body = "결론: 됐습니다.\n\n".padEnd(200, "가") + "\n\n## Details\n" + "- file lib/x.ts line 12 · commit abc1234 · setting FOO_BAR\n".repeat(2);
  it("splits the end part off", () => {
    const p = splitTech(body);
    expect(p?.head.startsWith("결론")).toBe(true);
    expect(p?.tech.startsWith("## Details")).toBe(true);
  });
  it("leaves short or early mentions alone", () => {
    expect(splitTech("Details\nshort")).toBeNull();
    expect(splitTech("## Details\n" + "x".repeat(300))).toBeNull();
  });
});
