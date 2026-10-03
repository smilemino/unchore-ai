import { describe, expect, it } from "vitest";
import { isolation } from "../worker/claude.mjs";
import { codexArgs } from "../worker/chatgpt.mjs";
import { blockMessage, checkQuery } from "../worker/search-guard.mjs";
import { SEARCH_PROVIDERS, canWebSearch } from "@/lib/ai";

// 2026-10-01: web search was on only for the Anthropic key, OpenRouter and credit — a member on their own Claude or ChatGPT plan
// got «I can't browse» while AI Soul searched on the same plans.
describe("web search on the member's own plans", () => {
  it("both plans count as connections that can search", () => {
    expect(canWebSearch("sub:opus")).toBe(true);
    expect(canWebSearch("cx:gpt-6-sol")).toBe(true);
    expect(canWebSearch("claude-opus-5-5")).toBe(true);
    expect(canWebSearch("deepseek:deepseek-chat")).toBe(false);
    expect(SEARCH_PROVIDERS).toEqual(expect.arrayContaining(["anthropic", "openrouter", "credit", "claude_sub", "chatgpt_sub"]));
  });
  it("Claude Code: no tools by default; with search, WebSearch alone behind the privacy hook and an empty connector list", () => {
    expect(isolation(false)).toEqual(["--safe-mode", "--setting-sources", "", "--tools", ""]);
    const a = isolation(true);
    expect(a).not.toContain("--safe-mode");   // --safe-mode skips hooks (AI Soul measured 2026-09-24)
    expect(a[a.indexOf("--tools") + 1]).toBe("WebSearch");
    expect(a[a.indexOf("--allowedTools") + 1]).toBe("WebSearch");
    expect(JSON.parse(a[a.indexOf("--mcp-config") + 1]!)).toEqual({ mcpServers: {} });
    expect(a).toContain("--strict-mcp-config");
    const hook = JSON.parse(a[a.indexOf("--settings") + 1]!).hooks.PreToolUse[0];
    expect(hook.matcher).toBe("WebSearch");
    expect(hook.hooks[0].command).toMatch(/search-guard\.mjs --hook$/);
  });
  it("Codex: web_search=live and code mode only on a searching turn", () => {
    const on = codexArgs("gpt-6-sol", "/tmp/w", [], true), off = codexArgs("gpt-6-sol", "/tmp/w");
    expect(on.join(" ")).toContain("web_search=live");
    expect(on.join(" ")).not.toContain("--disable code_mode_host");
    expect(off.join(" ")).not.toContain("web_search");
    expect(off.join(" ")).toContain("--disable code_mode_host");
    expect(on.join(" ")).toContain("--disable shell_tool");
  });
  it("the checkpoint stops personal details and lets dates and plain words through", () => {
    expect(checkQuery("weather Seoul tomorrow")).toEqual([]);
    expect(checkQuery("원달러 환율 2026-10-01")).toEqual([]);
    expect(checkQuery("010-1234-5678 누구 번호")).toEqual(["phone number"]);
    expect(checkQuery("카드 1234 5678 9012 3456")).toEqual(["card number"]);
    expect(checkQuery("국민은행 123-456-789012")).toEqual(["bank account number"]);
    expect(checkQuery("900101-1234567")).toContain("national ID number");
    expect(checkQuery("mail john@example.com")).toEqual(["e-mail address"]);
    expect(checkQuery("sk-ant-abcdefghijklmnopqrstuvwxyz123")).toContain("secret key");
    expect(blockMessage(["phone number"])).toMatch(/general words/);
  });
});
