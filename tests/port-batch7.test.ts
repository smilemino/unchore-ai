// Port batch 7 from AI Soul (2026-09-30 sync): phone «back» goes one step up to main.
import { describe, expect, it } from "vitest";
import { isAppPage, isMain, replaceOnNavigate } from "@/lib/back-nav";
import { tr } from "@/lib/i18n-server";
import { aiErrorMessage } from "@/lib/ai";

const O = "https://unchore.ai";
const at = (href: string) => { const u = new URL(href, O); return { pathname: u.pathname, search: u.search }; };

describe("back = one step up", () => {
  it("knows main: /app with no chat open (a project filter is still main)", () => {
    expect(isMain("/app", "")).toBe(true);
    expect(isMain("/app", "?p=abc")).toBe(true);
    expect(isMain("/app", "?c=abc")).toBe(false);
    expect(isMain("/app/settings", "")).toBe(false);
  });
  it("adds history from main, replaces it everywhere else", () => {
    expect(replaceOnNavigate(at("/app"), "/app?c=1", O)).toBe(false);
    expect(replaceOnNavigate(at("/app?c=1"), "/app?c=2", O)).toBe(true);
    expect(replaceOnNavigate(at("/app?c=1"), "/app/settings?tab=ai", O)).toBe(true);
    expect(replaceOnNavigate(at("/app/settings"), "/app", O)).toBe(true);
  });
  it("leaves files, other sites, the same screen and sign-in alone", () => {
    expect(replaceOnNavigate(at("/app?c=1"), "/api/files/9", O)).toBe(false);
    expect(replaceOnNavigate(at("/app?c=1"), "https://claude.ai/upgrade", O)).toBe(false);
    expect(replaceOnNavigate(at("/app?c=1"), "/app?c=1", O)).toBe(false);
    expect(replaceOnNavigate(at("/app?c=1"), "/login", O)).toBe(false);
    expect(isAppPage("/login")).toBe(false);
  });
});

describe("failed send wording", () => {
  it("tells the member the question is kept, in both languages", () => {
    expect(tr("en", "Couldn't send this. Your question is kept — press «Send again».")).toContain("Send again");
    expect(tr("ko", "Couldn't send this. Your question is kept — press «Send again».")).toContain("다시 보내기");
    expect(tr("ko", "Jump to the latest")).toBe("맨 아래로");
  });
});

describe("AI company errors read as plain words", () => {
  it("never shows the provider's raw reply and keeps the code", () => {
    expect(aiErrorMessage(401, "ko")).toBe("API 키가 맞지 않아 답을 받지 못했어요. 새 키를 이 창에 붙여 넣으시면 바로 바꿔 드려요. (오류 401)");
    expect(aiErrorMessage(402, "en")).toContain("out of credit");
    expect(aiErrorMessage(503, "en")).toContain("(error 503)");
    expect(aiErrorMessage(418, "ko")).toContain("다른 AI");
  });
});
