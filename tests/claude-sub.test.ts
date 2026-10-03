import { describe, expect, it } from "vitest";
import { buildPrompt, classify, findLoginUrl, runLimitMs, userDir, validCode } from "../worker/claude.mjs";
import { chooseModel, fastModel, providerOf } from "@/lib/ai";
import { subMessage } from "@/lib/claude-sub";

describe("claude plan (worker)", () => {
  it("finds Anthropic's sign-in link in Claude Code's output", () => {
    const out = "Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=y\nPaste code here if prompted > ";
    expect(findLoginUrl(out)).toBe("https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=y");
    expect(findLoginUrl("nothing yet")).toBeNull();
  });
  it("accepts one-line codes only", () => {
    expect(validCode("abcDEF123456#state-xyz_09")).toBe(true);
    expect(validCode("short")).toBe(false);
    expect(validCode("abc def 123456789")).toBe(false);
    expect(validCode("abc\nrm -rf /")).toBe(false);
  });
  it("keeps each user in their own folder and refuses odd ids", () => {
    expect(userDir("0f8fad5b-d9cb-469f-a165-70867728950e")).toMatch(/0f8fad5b-d9cb-469f-a165-70867728950e$/);
    expect(() => userDir("../other")).toThrow();
  });
  it("puts earlier turns in the system prompt and asks the last one", () => {
    const p = buildPrompt("SYS", [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }, { role: "user", content: "price?" }]);
    expect(p.text).toBe("price?");
    expect(p.system).toContain("User: hi");
    expect(p.system).toContain("Assistant: hello");
    expect(buildPrompt("SYS", [{ role: "user", content: "x" }]).system).toBe("SYS");
  });
  it("tells limits from sign-outs", () => {
    expect(classify("You've hit your session limit · resets 5pm")).toBe("limit");
    expect(classify("Not logged in · Please run /login")).toBe("signed_out");
    expect(classify("Prompt is too long")).toBe("too_long");   // the question itself — the next connection would refuse it too
    expect(classify("Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access")).toBe("blocked");
    expect(classify("boom")).toBe("other");
  });
});

describe("claude plan (app)", () => {
  it("routes sub: models to the plan", () => expect(providerOf("sub:opus")).toBe("claude_sub"));
  it("prefers a plan the user already pays for", () => {
    expect(chooseModel({ claude_sub: "u", openrouter: "k" })).toBe("sub:opus");
    expect(fastModel({ claude_sub: "u" })).toBe("sub:haiku");
    expect(chooseModel({ openrouter: "k" }, "sub:opus")).toBe("openrouter/auto");
  });
  it("explains a hit limit in plain words", () => expect(subMessage("limit", "ko")).toContain("한도"));
});

describe("runLimitMs", () => {
  it("keeps 280 s for chat and lets app builds ask for longer, within 1–13 minutes", () => {
    expect(runLimitMs({})).toBe(280_000);
    expect(runLimitMs({ timeoutMs: 600_000 })).toBe(600_000);
    expect(runLimitMs({ timeoutMs: 5_000 })).toBe(60_000);
    expect(runLimitMs({ timeoutMs: 99_000_000 })).toBe(780_000);
    expect(runLimitMs({ timeoutMs: "x" })).toBe(280_000);
  });
});
