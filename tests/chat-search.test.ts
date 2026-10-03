// «Find what we said before» — the member's earlier chats searched (lib/tools/chat-search.ts · 2026-10-02 «I can't» → built).
import { describe, expect, it } from "vitest";
import { findInChats, type ChatRow } from "@/lib/tools/chat-search";
import { OPEN_TOOLS, TOOL_DEFS } from "@/lib/tools/defs";
import { runTool } from "@/lib/tools/run";

const row = (conv: string, content: string, at = "2026-10-01"): ChatRow => ({ conv, title: `chat ${conv}`, role: "user", at, content });

describe("searching the member's earlier chats", () => {
  it("finds lines holding every word, in any order and case, with the chat's title", () => {
    const hits = findInChats([row("a", "빵집 로고는 파란색으로 하자"), row("b", "로고 이야기만"), row("c", "Bakery LOGO in blue")], "로고 빵집");
    expect(hits.map((h) => h.conv)).toEqual(["a"]);
    expect(hits[0]!.title).toBe("chat a");
    expect(findInChats([row("c", "Bakery LOGO in blue")], "logo bakery")).toHaveLength(1);
  });

  it("at most two lines from one chat and eight in all; an empty query finds nothing", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(String(i % 10), `주소는 서울 ${i}`));
    const hits = findInChats(rows, "주소");
    expect(hits).toHaveLength(8);
    expect(Math.max(...[...new Set(hits.map((h) => h.conv))].map((c) => hits.filter((h) => h.conv === c).length))).toBeLessThanOrEqual(2);
    expect(findInChats(rows, "  ")).toEqual([]);
  });

  it("a long line is cut around the match", () => {
    const h = findInChats([row("a", `${"가".repeat(500)} 비밀번호 바꾸는 법 ${"나".repeat(500)}`)], "비밀번호")[0]!;
    expect(h.snippet.startsWith("…")).toBe(true);
    expect(h.snippet).toContain("비밀번호 바꾸는 법");
    expect(h.snippet.length).toBeLessThan(340);
  });

  it("the AI is offered the tool — every member gets it and the ad check; the browser stays with the owners", async () => {
    expect(TOOL_DEFS.some((d) => d.name === "search_my_chats")).toBe(true);
    expect(OPEN_TOOLS.map((d) => d.name).sort()).toEqual(["ad_check", "github", "jobs", "mcp", "personal_ui", "search_my_chats", "seo_audit", "skills"]);
    const ctx = { userId: "u", convId: "c", lang: "ko", tz: "Asia/Seoul", yes: false, computer: false };
    expect((await runTool(ctx, "browser", { action: "open", url: "https://example.com" })).ok).toBe(false);
    expect((await runTool(ctx, "ad_check", { text: "100% 완치" })).ok).toBe(true);
  });
});

describe("OpenAI's newest models and tools", () => {
  it("the «tools need reasoning_effort none» refusal is told apart from «no tools here» (it used to drop every member tool)", async () => {
    const { AiError, toolsNeedNoReasoning } = await import("@/lib/ai");
    expect(toolsNeedNoReasoning(new AiError(400, "Function tools with reasoning_effort are not supported for gpt-6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'."))).toBe(true);
    expect(toolsNeedNoReasoning(new AiError(400, "This model does not support tools"))).toBe(false);
    expect(toolsNeedNoReasoning(new AiError(500, "reasoning_effort tool"))).toBe(false);
  });
});
