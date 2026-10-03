import { describe, expect, it } from "vitest";
import { detectKey, hideMarks, looksLikeClaudeCode, maskSecret, readSecretAsks, readSetMarks, wantsConnect } from "../lib/chat-setup";
import { readNudgeMarks } from "../lib/nudge";

const ANT = "sk-ant-api03-" + "A".repeat(40);
describe("connect in the chat — what did they paste?", () => {
  it("keys by their first letters, alone or inside a sentence", () => {
    expect(detectKey(ANT)).toEqual({ provider: "anthropic", key: ANT });
    expect(detectKey(`이거 제 열쇠예요 ${"sk-or-v1-" + "b".repeat(40)} 넣어 주세요`)?.provider).toBe("openrouter");
    expect(detectKey("sk-proj-" + "c".repeat(40))?.provider).toBe("openai");
    expect(detectKey("sk-" + "d".repeat(30))?.provider).toBe("auto");   // ChatGPT, DeepSeek or Kimi — the server tries them (2026-10-01)
    expect(detectKey("sk-short")).toBeNull();
    expect(detectKey("ask-me-anything about sk- keys")).toBeNull();
  });
  it("Claude's one-time code is one long token; a normal question isn't", () => {
    expect(looksLikeClaudeCode("AbC123_def-456#state_789XYZabc")).toBe(true);
    expect(looksLikeClaudeCode("내일 날씨 알려줘")).toBe(false);
    expect(looksLikeClaudeCode("short")).toBe(false);
    expect(looksLikeClaudeCode(ANT)).toBe(false);
  });
  it("the chat shows only a masked key", () => {
    expect(maskSecret(ANT)).toBe("sk-ant-…AAAA");
    expect(maskSecret(ANT)).not.toContain("A".repeat(10));
    expect(maskSecret("short")).toBe("••••");
  });
  it("«클로드 연결» opens the steps; «연결 끊어» and long questions don't", () => {
    expect(wantsConnect("클로드 연결")).toBe(true);
    expect(wantsConnect("connect my Claude")).toBe(true);
    expect(wantsConnect("Conectar Claude.", "conectar Claude")).toBe(true);   // the screen language's own phrase (2026-09-30, 58 languages)
    expect(wantsConnect("¿Qué es Claude?", "conectar Claude")).toBe(false);
    expect(wantsConnect("AI 다시 연결해 줘")).toBe(true);
    expect(wantsConnect("클로드 연결 끊어 줘")).toBe(false);
    expect(wantsConnect("오늘 회의 내용을 정리해서 거래처 연결 담당자에게 보낼 메일 초안을 써 줘")).toBe(false);
  });
});

describe("settings by asking — the marks", () => {
  it("reads known marks, hides unknown ones", () => {
    const r = readSetMarks("알겠어요, 바꿨어요.\n<<<set theme=dark>>>\n<<<set rules+=항상 존댓말로 답하기>>>\n<<<set hack=1>>>");
    expect(r.text).toBe("알겠어요, 바꿨어요.");
    expect(r.marks).toEqual([{ key: "theme", value: "dark" }, { key: "rules+", value: "항상 존댓말로 답하기" }]);
    expect(readSetMarks("<<<set model=claude-opus-5-5>>>").marks).toEqual([{ key: "model", value: "claude-opus-5-5" }]);
  });
  it("a saved-login box, and marks hidden while streaming", () => {
    const s = readSecretAsks("아래 칸에 넣어 주세요.\n<<<secret name=airline-login>>>");
    expect(s).toEqual({ text: "아래 칸에 넣어 주세요.", names: ["airline-login"] });
    expect(readSecretAsks('<<<secret name="bank login">>>').names).toEqual(["bank login"]);
    expect(readSecretAsks("<<<secret name = `x.y@z` >>>").names).toEqual(["x.y@z"]);
    expect(hideMarks("done <<<set lang=en>>> <<<nudge off>>>")).toBe("done");
    expect(hideMarks("almost <<<set the")).toBe("almost");
  });
  it("the daily note can be turned back on in words", () => {
    expect(readNudgeMarks("ok <<<nudge on>>>").marks).toEqual([{ kind: "on" }]);
  });
});
