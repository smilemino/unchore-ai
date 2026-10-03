import { describe, expect, it } from "vitest";
import { yesNoAsk } from "@/lib/yes-no";

describe("Yes / No buttons under a plain yes-or-no question", () => {
  it("shows under one closing yes-or-no question", () => {
    expect(yesNoAsk("Gold is $2,400 today.\n\nShall I send you the price every morning?", "en")).toBe(true);
    expect(yesNoAsk("Done.\nWant me to set a reminder for Friday?", "en")).toBe(true);
    expect(yesNoAsk("**Should I go ahead?**", "en")).toBe(true);
    expect(yesNoAsk("Please answer yes or no.", "en")).toBe(true);
    expect(yesNoAsk("오늘 금값은 9만 원이에요.\n매일 아침 알려 드릴까요?", "ko")).toBe(true);
    expect(yesNoAsk("이대로 보내 드려도 될까요?", "ko")).toBe(true);
    expect(yesNoAsk("진행할지 예/아니오로 답해 주세요.", "ko")).toBe(true);
  });
  it("stays away from open questions, choices and more than one question", () => {
    expect(yesNoAsk("What time should I send it?", "en")).toBe(false);
    expect(yesNoAsk("Do you want it daily or weekly?", "en")).toBe(false);
    expect(yesNoAsk("Is 8 am good? Or later?", "en")).toBe(false);
    expect(yesNoAsk("Here it is.", "en")).toBe(false);
    expect(yesNoAsk("몇 시에 알려 드릴까요?", "ko")).toBe(false);
    expect(yesNoAsk("어느 쪽으로 할까요?", "ko")).toBe(false);
    expect(yesNoAsk("매일 할까요? 매주 할까요?", "ko")).toBe(false);
    expect(yesNoAsk("- Shall I?", "en")).toBe(false);
  });
  it("leaves pick blocks and decide / approve boxes to their own cards", () => {
    expect(yesNoAsk("Which one?\n<<<pick>>>\n- A\n- B\n<<<end>>>\nShall I?", "en")).toBe(false);
    expect(yesNoAsk("```decide\nPay $20?\n```\nShall I pay?", "en")).toBe(false);
    expect(yesNoAsk("[[approve id=1]] Shall I send it?", "en")).toBe(false);
  });
  it("other languages get no guessed buttons", () => {
    expect(yesNoAsk("Soll ich es jeden Morgen schicken?", "de")).toBe(false);
    expect(yesNoAsk("", "en")).toBe(false);
    expect(yesNoAsk(null, "ko")).toBe(false);
  });
});
