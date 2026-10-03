// Ported from AI Soul 2026-10-01 record review (93dfba5 · 4156a2e): «schedule it» is a timed ask, and an answer that slipped
// into English for a question in another script is rewritten in the question's language even when short.
import { describe, expect, it } from "vitest";
import { acceptRewrite, worthChecking, wrongScript } from "@/lib/plain-gate";
import { askedTimed } from "@/lib/reminders";

describe("wrong language", () => {
  it("a Korean / Japanese question answered in English is caught, even short", () => {
    expect(wrongScript("내일 회의 몇 시였죠?", "Your meeting tomorrow is at 3 pm with the design team.")).toBe(true);
    expect(wrongScript("明日の会議は何時ですか", "Your meeting tomorrow is at 3 pm with the design team.")).toBe(true);
    expect(worthChecking("Your meeting tomorrow is at 3 pm with the design team.", "내일 회의 몇 시였죠?")).toBe(true);
  });
  it("same language, English questions, code and the details part don't count", () => {
    expect(wrongScript("내일 회의 몇 시였죠?", "내일 회의는 오후 3시예요. 디자인 팀과 함께예요.")).toBe(false);
    expect(wrongScript("When is my meeting?", "Your meeting tomorrow is at 3 pm with the design team.")).toBe(false);
    expect(wrongScript("이 코드 고쳐 줘", "고쳤어요.\n```js\nconst answer = computeTheThingWithLongNames();\n```")).toBe(false);
    expect(wrongScript("상태 알려 줘", "다 끝났어요.\n\nDetails (technical)\nbuild passed on main with every check green")).toBe(false);
  });
  it("a translation may be much shorter than the English it replaces", () => {
    const en = "Your meeting tomorrow is at 3 pm with the design team, in the small room on the second floor.";
    expect(acceptRewrite(en, "내일 회의는 오후 3시, 2층 작은 방이에요.")).toBe(false);
    expect(acceptRewrite(en, "내일 회의는 오후 3시, 2층 작은 방이에요.", true)).toBe(true);
  });
});

describe("«schedule it» is a timed ask", () => {
  it("Korean and English", () => {
    for (const t of ["AI가 알아서 하도록 예약해 주세요", "이거 예약 걸어 줘", "Please schedule it for me"]) expect(askedTimed(t), t).toBe(true);
    for (const t of ["예약 기능이 뭐예요?", "식당 예약이 어려워요", "what is a schedule?"]) expect(askedTimed(t), t).toBe(false);
  });
});
