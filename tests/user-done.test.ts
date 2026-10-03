// The member says «done» → the chat closes when the answer neither asks nor says work is left (AI Soul conv-mark userSaysDone).
import { describe, it, expect } from "vitest";
import { doneByUserAsk, userOrdersDone, userSaysDone } from "../lib/turn-mark";

describe("member says done", () => {
  it("short done lines count", () => {
    for (const t of ["done", "Done.", "that's all", "mark it as done please", "완료", "끝!", "이 대화는 완료", "완료로 표시해 줘", "다 됐어요"]) expect(userSaysDone(t), t).toBe(true);
  });
  it("questions, «don't», requests and long lines don't", () => {
    for (const t of ["done?", "is it done?", "don't mark done", "not done yet", "완료하지 마세요", "끝났나요", "완료된 것만 알려줘", "아직 완료 아님", "the report is done but now please make the slides for tomorrow", ""]) expect(userSaysDone(t), t).toBe(false);
  });
  it("an answer that says work is left keeps it open", () => {
    expect(doneByUserAsk("완료", "Closed — nothing left.")).toBe(true);
    expect(doneByUserAsk("done", "The deploy is still running — I'll tell you when it ends.")).toBe(false);
    expect(doneByUserAsk("완료", "배포가 아직 도는 중입니다.")).toBe(false);
    expect(doneByUserAsk("show me", "ok")).toBe(false);
  });
  it("a longer message that tells us to close counts (AI Soul ownerOrdersDone · 2026-10-02)", () => {
    expect(doneByUserAsk("완료 된 것 아닌가요? 왜 안 됐는지 개선하고 완료 처리해주세요", "Closed.")).toBe(true);
    expect(userOrdersDone("The report looks fine. Please mark it as done.")).toBe(true);
    expect(userOrdersDone("완료 처리하지 마세요. 아직 볼 게 있어요")).toBe(false);
    expect(userOrdersDone("손님이 '완료 처리해주세요'라고 했는데 어떻게 하죠?")).toBe(false);
    expect(userOrdersDone("완료 처리는 보류해 주세요")).toBe(false);
    expect(doneByUserAsk("완료 처리해 주세요", "배포가 아직 도는 중입니다.")).toBe(false);
  });
});
