import { describe, expect, it } from "vitest";
import { dropEcho } from "../lib/voice/echo";

// Voice mode — Unchore's own words picked up by the microphone (ported from AI Soul, 2026-09-29).
describe("dropEcho", () => {
  it("drops the end of the last answer glued to the start of what was heard", () => {
    expect(dropEcho("편하게 말씀해 보세요 당신의 음성은 Google tts인가요", "준비됐어요, 편하게 말씀해 보세요.")).toBe("당신의 음성은 Google tts인가요");
    expect(dropEcho("Go ahead and ask what's the weather", "Ready. Go ahead and ask.")).toBe("what's the weather");
  });
  it("ignores [[marks]] and cuts only to a sentence end", () => {
    expect(dropEcho("확인해서 알려 드릴게요 그리고 하나 더", "네, 알겠어요. 확인해서 알려 드릴게요 [[맡김]]")).toBe("그리고 하나 더");
    expect(dropEcho("말씀해 보세요 당신의 목소리는", "편하게 말씀해 보세요. 당신이 원하시면 바로 할게요.")).toBe("당신의 목소리는");
  });
  it("keeps a quote glued to the user's words, short or unrelated matches", () => {
    const s = "편하게 말씀해 보세요처럼 당신의 말이 같이 들어가면 안 돼요";
    expect(dropEcho(s, "준비됐어요, 편하게 말씀해 보세요.")).toBe(s);
    expect(dropEcho("네 좋아요 그렇게 해요", "네 좋아요.")).toBe("네 좋아요 그렇게 해요");
    expect(dropEcho("오늘 날씨 어때요", null)).toBe("오늘 날씨 어때요");
  });
  it("only our own words → empty (listen again)", () => {
    expect(dropEcho("편하게 말씀해 보세요", "준비됐어요, 편하게 말씀해 보세요.")).toBe("");
  });
  it("stays fast on long text", () => {
    const t0 = Date.now();
    dropEcho("가나다라마바사 ".repeat(300) + "끝", "가나다라마바사. ".repeat(400));
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
