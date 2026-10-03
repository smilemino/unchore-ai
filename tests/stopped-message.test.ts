import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

// Night 2026-10-03 (real members' nightly review): an answer cut by a broken AI connection ended with «[stopped] This operation was aborted»
// or «[stopped] terminated» — raw English under a Korean answer. The member now gets a sentence in their language; the cause stays in the log.
describe("an answer that stops partway", () => {
  const src = readFileSync(new URL("../lib/turn.ts", import.meta.url), "utf8");
  it("never shows the raw error text to the member", () => {
    expect(src).not.toMatch(/`\\n\\n\[stopped\] \$\{/);
    expect(src).toContain('tr(lang, "The answer stopped partway — the connection to the AI broke. Please send it again.")');
  });
  it("says it in Korean", () => {
    const ko = JSON.parse(readFileSync(new URL("../lib/locales/ko.json", import.meta.url), "utf8"));
    expect(ko["The answer stopped partway — the connection to the AI broke. Please send it again."]).toBe("AI와의 연결이 끊겨 답이 중간에 멈췄어요. 한 번 더 보내 주세요.");
  });
});
