import { describe, expect, it } from "vitest";
import { asksBack } from "../lib/judge";

// Night test 2026-09-30: the switch-on card must wait while Unchore is still asking «what time?».
describe("asksBack — no card while Unchore is still asking", () => {
  it("pick block → still asking", () => expect(asksBack("몇 시까지 제출해야 하나요?\n<<<pick>>>\n- 오전 중\n- 밤 11시 59분\n<<<end>>>")).toBe(true));
  it("ends on a question → still asking", () => {
    expect(asksBack("Got it. What time works for you?")).toBe(true);
    expect(asksBack("좋아요. 몇 시에 알려 드릴까요？")).toBe(true);
    expect(asksBack("**Which day?**")).toBe(true);
  });
  it("a confirmation line → card may show", () => {
    expect(asksBack("매일 저녁 9시에 영어 단어 10개를 보내 드릴게요.")).toBe(false);
    expect(asksBack("Every weekday at 9:00 I'll remind you to check follow-ups.")).toBe(false);
  });
  it("a question in the middle, statement at the end → card may show", () => expect(asksBack("What should I watch? The dollar rate.\nI'll check it every morning at 8.")).toBe(false));
});

// Night test 2026-09-30 round 6: still asking, but not with a «?» at the very end → the card built an empty reminder.
describe("asksBack — asking with an example after, or without a question mark", () => {
  it("example line after the question", () => {
    expect(asksBack("과제 마감 알림을 맞추려면 마감 시간을 먼저 알아야 해요. 가장 가까운 과제는 언제까지 제출해야 하나요? (예: 10월 3일 오후 11시 59분)")).toBe(true);
    expect(asksBack("가장 가까운 과제는 무엇이고 언제까지 내야 하나요?\n예: “영어 에세이, 10월 5일 오후 11시 59분.”")).toBe(true);
  });
  it("asks for the link without «?»", () => expect(asksBack("지금은 가격 하락 알림을 켤 수 없어요.\n\n다나와 상품 페이지 링크를 보내주세요. 받기 전에는 다른 모델의 가격을 기준으로 알림을 설정하지 않겠습니다.")).toBe(true));
  it("English: send me the link", () => expect(asksBack("I can watch that page. Send me the link and I'll check it every morning.")).toBe(true));
  it("a closing «tell me if you want changes» is not asking", () => expect(asksBack("매일 저녁 9시에 영어 단어 10개를 보내 드릴게요. 시간을 바꾸고 싶으면 언제든 말씀하세요.")).toBe(false));
  it("a question inside a decide box (night 2026-10-01 — the card built an empty «set the line» reminder)", () => {
    expect(asksBack("비트코인이 얼마 아래로 내려가면 알려드릴지 가격을 정해 주세요.\n\n원화 기준으로 볼게요.\n\n```decide\n알림 기준을 정하려면 가격이 필요해요.\n얼마 아래일 때 알려드릴까요?\n```")).toBe(true);
    expect(asksBack("원하는 기준 환율을 정해 주세요. 그 값을 넘으면 알려 드릴게요.")).toBe(true);
  });
  it("a question with a sentence and an example after it on the same line (night 2026-10-01 round 4)", () => {
    expect(asksBack("지금 받은 자료에는 1달러에 1,355.4원으로 나와 있어요.\n\n몇 원을 넘으면 알려드릴까요? 원하시면 확인 간격도 함께 적어 주세요. 예: “1,400원, 매시간 확인”")).toBe(true);
    expect(asksBack("Which rate should I watch for? Add how often too if you like. e.g. «1,400, every hour»")).toBe(true);
    expect(asksBack("매일 오전 8시에 달러 환율을 알려 드릴게요. 1,400원을 넘은 날만 보내요.")).toBe(false);
  });
});

// Night 2026-10-01 round 10 (추천 #4 «환율 알림선»): the question a line up, then only how to answer → still asking.
describe("asksBack — a question, then a line that only says how to answer", () => {
  it("still asking", () => {
    expect(asksBack("원·달러 환율이 얼마를 넘으면 알려드릴까요?\n기준은 1달러당 원화 금액으로 볼게요. 예를 들어 1,400원을 넘을 때라면 **1,400원**이라고 답해 주세요.")).toBe(true);
    expect(asksBack("Which rate should I alert you above?\nI'll read it as won per dollar. For example, reply with **1,400**.")).toBe(true);
  });
  it("a question, then a plain statement → not asking", () => {
    expect(asksBack("What should I watch? The dollar rate.\nI'll check it every morning at 8.")).toBe(false);
    expect(asksBack("환율이 궁금하셨죠? 지금 1,355원이에요.\n매일 아침 8시에 알려 드릴게요.")).toBe(false);
  });
});

