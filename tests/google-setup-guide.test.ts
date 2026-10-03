// A member without Google connected who asks about their mail or calendar gets the one-tap link, not «I can't»
// (lib/google-lookup.ts asksGoogle · GOOGLE_SETUP_GUIDE · ability gap #59, 2026-10-03).
import { describe, expect, it } from "vitest";
import { GOOGLE_SETUP_GUIDE, asksGoogle } from "@/lib/google-lookup";

describe("Google not connected yet", () => {
  it("spots mail and calendar questions in Korean and English; Drive only by name", () => {
    expect(asksGoogle("메일이랑 캘린더에서 할 일 좀 뽑아 줘")).toEqual(["calendar", "gmail"]);
    expect(asksGoogle("Pull my tasks from my inbox and calendar")).toEqual(["calendar", "gmail"]);
    expect(asksGoogle("구글 드라이브에 있는 문서 요약해 줘")).toContain("drive");
    expect(asksGoogle("이 파일 요약해 줘")).toEqual([]);
    expect(asksGoogle("오늘 날씨 어때?")).toEqual([]);
  });
  it("gives the connect link for just the missing services and is honest about the inbox", () => {
    const g = GOOGLE_SETUP_GUIDE(["calendar", "gmail"], "https://unchore.ai");
    expect(g).toContain("https://unchore.ai/api/connect/google/start?s=calendar,gmail");
    expect(g).toContain("Don't say you can't");
    expect(g).toMatch(/Reading their inbox isn't available yet/);
    expect(g).not.toMatch(/picker/);
  });
});
