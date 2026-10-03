import { describe, expect, it } from "vitest";
import { askedLineNow, sameLine, remindersGuide } from "../lib/reminders";

// Night 2026-10-03 first-day #8: «달러 환율이 1400원 넘으면 알려 주세요» set nothing (no time word) while the answer said «I'll check every hour»;
// it took «켜 주세요» and a card two turns later. A line plus «tell me» is the request — the AI picks how often.
describe("a line and «tell me» is a reminder request", () => {
  it("Korean and English, the member's last message", () => {
    expect(askedLineNow(["환율 매일 봐요", "달러 환율이 1400원 넘으면 알려 주세요"])).toBe(true);
    expect(askedLineNow(["Tell me when Bitcoin drops below 90,000 USD"])).toBe(true);
  });
  it("no number, or no «tell me», is not one", () => {
    expect(askedLineNow(["최저가 떨어지면 알려 주세요"])).toBe(false);
    expect(askedLineNow(["환율이 1400원 넘었네요"])).toBe(false);
    expect(askedLineNow(["1400원 넘으면 알려 주세요", "고마워요"])).toBe(false);
  });
  it("«don't tell me» and «explain how it works» are not asks (2026-10-03 review)", () => {
    expect(askedLineNow(["1400원 넘으면 알려 주지 마세요"])).toBe(false);
    expect(askedLineNow(["1400원 넘으면 알림이 오는 원리를 설명해 주세요"])).toBe(false);
    expect(askedLineNow(["환율 1400원 넘으면 알림은 필요 없어요"])).toBe(false);
    expect(askedLineNow(["Don't tell me when Bitcoin drops below 90,000"])).toBe(false);
    expect(askedLineNow(["How does the alert work when it drops below 90,000?"])).toBe(false);
    expect(askedLineNow(["1400원 넘으면 알려 줄래?"])).toBe(true);
  });
  it("«don't tell me» then another ask: only the ask after it counts (AI Soul 45675a3)", () => {
    expect(askedLineNow(["1,400원 넘으면 알려 주지 마세요. 대신 1,500원 넘으면 알려 줘"])).toBe(true);
    expect(sameLine("1,400원 넘으면 알려 주지 마세요. 대신 1,500원 넘으면 알려 줘", "달러 환율이 1,500원을 넘으면 알려 주세요")).toBe(true);
    expect(sameLine("1,400원 넘으면 알려 주지 마세요. 대신 1,500원 넘으면 알려 줘", "달러 환율이 1,400원을 넘으면 알려 주세요")).toBe(false);
    expect(askedLineNow(["Don't tell me about 95,000. Tell me when Bitcoin drops below 90,000"])).toBe(true);
    expect(askedLineNow(["1,400원 넘으면 알려 주지 마세요. 고마워요"])).toBe(false);
  });
  it("only a reminder on the same line is allowed by it", () => {
    expect(sameLine("달러 환율이 1400원 넘으면 알려 주세요", "달러 환율이 1,400원을 넘으면 알려 주세요")).toBe(true);
    expect(sameLine("달러 환율이 1400원 넘으면 알려 주세요", "달러 환율이 1,300원 아래로 떨어지면 알려 주세요")).toBe(false);
    expect(sameLine("달러 환율이 1400원 넘으면 알려 주세요", "매일 아침 환율 요약을 보내 주세요")).toBe(false);
  });
  it("the guide lets the AI set it with every=1h", () => {
    expect(remindersGuide()).toContain("or asks to be told when a value crosses a number they give");
  });
});
