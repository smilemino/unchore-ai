import { describe, expect, it } from "vitest";
import { keepsWatch } from "../lib/reminders";

const watch = { recipe: "price", args: {}, above: 1400 };

describe("same-time reminder next to a value watch (AI Soul 7ad11ef)", () => {
  it("a different task does not overwrite a watching reminder", () => {
    expect(keepsWatch({ prompt: "환율 1400원 넘으면 알려 줘", watch }, "매일 9시 뉴스 요약")).toBe(true);
  });
  it("the same task still replaces it", () => {
    expect(keepsWatch({ prompt: "환율 1400원 넘으면 알려 줘", watch }, " 환율 1400원 넘으면 알려 줘 ")).toBe(false);
  });
  it("a plain reminder is replaced as before", () => {
    expect(keepsWatch({ prompt: "메일 점검" }, "뉴스 요약")).toBe(false);
  });
  it("reads args stored as text too", () => {
    expect(keepsWatch(JSON.stringify({ prompt: "a", watch }), "b")).toBe(true);
    expect(keepsWatch("not json", "b")).toBe(false);
    expect(keepsWatch(null, "b")).toBe(false);
  });
});
