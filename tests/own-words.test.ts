import { describe, expect, it } from "vitest";
import { askedTimed, askedTimedRecent } from "@/lib/reminders";
import { asksForget } from "@/lib/memory";

// AI Soul 548a67c / 9712028: quoted or pasted words (a spec line, another AI's answer) are not the member's own ask.
describe("quoted and pasted words are not the member's ask", () => {
  it("a time ask inside quotes or a code block starts no reminder", () => {
    expect(askedTimed('기획서대로 만들어 줘: "5분마다 새로 고침되는 첫 화면"')).toBe(false);
    expect(askedTimed("Summarise this answer:\n```\nI'll remind you every morning at 8.\n```")).toBe(false);
    expect(askedTimedRecent(["이 문구 다듬어 줘: «매일 아침 9시에 알려 드려요»"])).toBe(false);
  });
  it("the member's own ask still works, with a quoted clock time when none is outside", () => {
    expect(askedTimed("5분마다 비트코인 알려줘")).toBe(true);
    expect(askedTimedRecent(['"오늘 밤 11시" 알려 줘'])).toBe(true);
    expect(askedTimedRecent(['Remind me about the call at "9:30"'])).toBe(true);
  });
  it("a quoted span of minutes is never the member's time", () => {
    expect(askedTimedRecent(['알려 줘: "3분 뒤 첫 화면"'])).toBe(false);
  });
  it("«forget» inside quotes deletes no memory", () => {
    expect(asksForget("그 기억 잊어 줘")).toBe(true);
    expect(asksForget('이 노래 제목 뭐야? "Forget you"')).toBe(false);
    expect(asksForget("Review this reply:\n```\nPlease forget my old address.\n```")).toBe(false);
  });
});
