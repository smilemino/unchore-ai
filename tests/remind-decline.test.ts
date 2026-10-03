// Ported from AI Soul 192e725 (2026-10-01 record review): «no reminder» said in words stops this chat's reminders — not when asked as a question.
import { describe, expect, it } from "vitest";
import { askedStop, declinedReminder } from "@/lib/reminders";

describe("«no reminder needed» stops reminders", () => {
  it("Korean and English statements", () => {
    for (const t of ["예약은 안 해도 됩니다", "알림은 필요 없어요", "예약은 하지 않고 지금만 해 주세요", "No need for a reminder, thanks", "Please don't set a reminder"]) expect(askedStop(t), t).toBe(true);
  });
  it("questions and asks to schedule don't", () => {
    for (const t of ["예약 안 해도 되나요?", "알림은 필요 없을까요", "예약해 주세요", "Do I need a reminder?", "set a reminder for 9"]) expect(declinedReminder(t), t).toBe(false);
  });
});
