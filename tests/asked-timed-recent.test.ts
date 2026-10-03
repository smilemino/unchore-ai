import { describe, expect, it } from "vitest";
import { askedTimedRecent } from "../lib/reminders";

// Night test 2026-09-30: the ask and the day/time came in different messages, and the reminder was dropped.
describe("askedTimedRecent — ask and time spread over the member's last messages", () => {
  it("ask in one message, date in the next", () => expect(askedTimedRecent(["과제 마감 알림", "이번 주 금요일에 리포트 마감이 있어요"])).toBe(true));
  it("date and time without «에»", () => expect(askedTimedRecent(["다음 주 화요일 오전 10시 병원 예약을 하루 전에 알려 주세요"])).toBe(true));
  it("English, spread", () => expect(askedTimedRecent(["Can you remind me about the client call?", "It's on Thursday"])).toBe(true));
  it("the old one-message form still works", () => expect(askedTimedRecent(["5분마다 비트코인 알려줘"])).toBe(true));
  it("a time without any ask → no reminder", () => expect(askedTimedRecent(["내일 10시 회의가 있어요"])).toBe(false));
  it("an ask without any time → no reminder", () => expect(askedTimedRecent(["비트코인 알려줘"])).toBe(false));
  it("only the last six messages count", () => expect(askedTimedRecent(["알려 줘", "그냥", "음", "네", "좋아요", "그래요", "금요일이요"])).toBe(false));
  it("time said five messages before «그거 지금 켜 주세요»", () => expect(askedTimedRecent(["매일 아침 8시에 알려 주면 좋겠어요", "과제·시험 일정", "일정과 날짜를 적을게요", "좋아요, 그거 지금 켜 주세요", "좋아요, 그거 지금 켜 주세요"])).toBe(true));
  it("«switch it on» plus a day", () => expect(askedTimedRecent(["It's every Monday", "ok switch it on"])).toBe(true));
});

import { liveQuestion } from "../lib/reminders";
// Night test 2026-09-30 round 3: a chat-set dollar-rate reminder never read the live rate on its run.
describe("liveQuestion — reminder turns read live values too", () => {
  it("member's own words", () => expect(liveQuestion({ text: "달러 환율 얼마야" })).toBe("달러 환율 얼마야"));
  it("a reminder: only its task, asked as a need for the current value", () => expect(liveQuestion({ reminder: true, text: "⏰ 예약 실행 (매일 08:00 · #1) — 달러 환율 확인\n\n(걸어 둔 예약이 부른 차례입니다.)" })).toBe("Scheduled check — read the current value this task depends on, now: ⏰ 예약 실행 (매일 08:00 · #1) — 달러 환율 확인"));
  it("the daily note: none", () => expect(liveQuestion({ reminder: true, text: "⏰ ☀ 오늘의 한마디\n\n(…)" })).toBeNull());
});

import { remindersGuide } from "../lib/reminders";
// Night test 2026-09-30 round 7: a chat reminder was set for a price the app can't read («원두 거래처 링크가 없어 알려드릴 수 없습니다»).
describe("remindersGuide — only reminders the app can really do", () => {
  it("tells the AI to ask first instead of setting an empty reminder", () => expect(remindersGuide()).toContain("never refuse twice"));
});
