import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WarmPool } from "../worker/warm.mjs";
import { decide, readOnlyTool } from "../worker/connector-guard.mjs";

// Owner «yes» 2026-10-02 21:40: a Claude plan answer may read the member's own claude.ai connectors — off by default, read-only tools,
// each turn in a folder of its own made with that member's sign-in and removed after, nothing shared between members.
const A = "0f8fad5b-d9cb-469f-a165-70867728950e", B = "1f8fad5b-d9cb-469f-a165-70867728950e", C = "2f8fad5b-d9cb-469f-a165-70867728950e";
const GUARD = path.resolve("worker/connector-guard.mjs");

describe("read-only connector tools (worker/connector-guard.mjs)", () => {
  it("lets search/get/list/fetch/read/query through", () => {
    for (const t of ["mcp__claude_ai_Notion__notion-search", "mcp__claude_ai_Notion__notion-fetch", "mcp__claude_ai_Slack__slack_search_public",
      "mcp__claude_ai_Google_Drive__read_file_content", "mcp__claude_ai_Google_Calendar__list_events", "mcp__claude_ai_Atlassian__getJiraIssue",
      "mcp__claude_ai_Linear__query_issues"]) expect(readOnlyTool(t), t).toBe(true);
  });
  it("refuses writing, sending and deleting tools — and names that say nothing", () => {
    for (const t of ["mcp__claude_ai_Notion__notion-create-pages", "mcp__claude_ai_Notion__notion-update-page", "mcp__claude_ai_Slack__slack_send_message",
      "mcp__claude_ai_Gmail__create_draft", "mcp__claude_ai_Google_Drive__delete_file", "mcp__claude_ai_Notion__fetch_and_update", "mcp__claude_ai_X__get_or_create",
      "mcp__claude_ai_Claude_Docs__batch", "mcp__claude_ai_Claude_Docs__guide", "mcp__claude_ai_Search__x", "mcp__unchore__notes_search", "WebSearch"])
      expect(readOnlyTool(t), t).toBe(false);
  });
  it("answers Claude Code's hook — and refuses what it can't read", () => {
    const run = (input: string) => JSON.parse(spawnSync(process.execPath, [GUARD, "--hook"], { input, encoding: "utf8" }).stdout).hookSpecificOutput;
    expect(run(JSON.stringify({ tool_name: "mcp__claude_ai_Notion__notion-search" })).permissionDecision).toBe("allow");
    expect(run(JSON.stringify({ tool_name: "mcp__claude_ai_Slack__slack_send_message" })).permissionDecision).toBe("deny");
    expect(run("not json").permissionDecision).toBe("deny");
    expect(decide("mcp__claude_ai_Notion__notion-move-pages").hookSpecificOutput.permissionDecisionReason).toMatch(/only read/);
  });
});

describe("connector turns (worker/claude.mjs)", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "uc-conn-test-"));
  const argsLog = path.join(root, "args.log");
  let claude: typeof import("../worker/claude.mjs");
  beforeAll(async () => {
    vi.stubEnv("CLAUDE_BIN", path.resolve("tests/fixtures/fake-claude-connectors.mjs"));
    vi.stubEnv("CLAUDE_HOME_ROOT", root);
    vi.stubEnv("FAKE_ARGS_LOG", argsLog);
    for (const [id, tok] of [[A, "TOKEN-A"], [B, "TOKEN-B"]] as const) {
      mkdirSync(path.join(root, id));
      writeFileSync(path.join(root, id, ".credentials.json"), tok);
      writeFileSync(path.join(root, id, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: `${tok}@x.test` }, userID: tok, mcpServers: { leak: {} }, projects: { "/x": {} } }));
    }
    vi.resetModules();
    claude = await import("../worker/claude.mjs");
  });
  afterAll(() => vi.unstubAllEnvs());
  type Seen = { cfg: string; home: string; cache: string; me: string; files: string[]; homeFiles: string[]; system: string; account: Record<string, unknown> };
  const ask = async (who: string, q: string, wp = new WarmPool({ free: () => 8 * 1024 ** 3 })) => {
    let out = "";
    const r = await claude.chat(who, { model: "sonnet", connectors: true, system: "BE KIND", messages: [{ role: "user", content: q }] }, (t: string) => { out += t; }, undefined, wp);
    return { r, seen: JSON.parse(out) as Seen };
  };
  const leftovers = (id: string) => readdirSync(path.join(root, id)).filter((f) => f.startsWith("uc-turn-"));

  it("two members taking turns never see each other's sign-in, connectors, questions or folders", async () => {
    const a1 = await ask(A, "SECRET-QUESTION-OF-A");
    const b1 = await ask(B, "question of B");
    const a2 = await ask(A, "second question of A");
    for (const x of [a1, b1, a2]) expect(x.r).toEqual({ ok: true });
    expect([a1.seen.me, b1.seen.me, a2.seen.me]).toEqual(["TOKEN-A", "TOKEN-B", "TOKEN-A"]);
    // A brand-new folder every turn, inside that member's own folder, with only the sign-in link and the account card in it.
    expect(new Set([a1.seen.cfg, b1.seen.cfg, a2.seen.cfg]).size).toBe(3);
    expect(path.dirname(b1.seen.cfg)).toBe(path.join(root, B));
    for (const x of [a1, b1, a2]) {
      expect(x.seen.files).toEqual([".claude.json", ".credentials.json", "cache", "config", "data", "home", "state"]);
      expect(x.seen.homeFiles).toEqual([]);
      expect(x.seen.home.startsWith(x.seen.cfg)).toBe(true);
      expect(x.seen.cache.startsWith(x.seen.cfg)).toBe(true);
      expect(x.seen.account).toEqual({ oauthAccount: { emailAddress: `${x.seen.me}@x.test` }, userID: x.seen.me, hasCompletedOnboarding: true });
    }
    expect(JSON.stringify(b1.seen)).not.toContain("SECRET-QUESTION-OF-A");
    expect(JSON.stringify(b1.seen)).not.toContain("TOKEN-A");
    // Removed after each turn; the member's own sign-in is untouched.
    for (const x of [a1, b1, a2]) expect(existsSync(x.seen.cfg)).toBe(false);
    expect(leftovers(A)).toEqual([]); expect(leftovers(B)).toEqual([]);
    expect(readFileSync(path.join(root, A, ".credentials.json"), "utf8")).toBe("TOKEN-A");
  });
  it("tells the AI the connectors are read-only, and never uses a program started ahead", async () => {
    const wp = new WarmPool({ free: () => 8 * 1024 ** 3 });
    claude.warm(A, { model: "sonnet" }, wp);
    const { seen } = await ask(A, "hi", wp);
    expect(seen.system).toMatch(/^BE KIND[\s\S]*read-only/);
    expect(wp.report()).toMatchObject({ used: 0 });
  });
  it("lets the member's connectors in (no strict list) behind the read-only checkpoint", () => {
    // The last turn's own start (a program started ahead has no system prompt file and may log after it).
    const last = readFileSync(argsLog, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]).filter((a) => a.includes("-p") && a.includes("--system-prompt-file")).pop()!;
    expect(last).not.toContain("--strict-mcp-config");
    expect(last).not.toContain("--safe-mode");
    expect(last[last.indexOf("--setting-sources") + 1]).toBe("");
    expect(last[last.indexOf("--tools") + 1]).toBe("");
    const hook = JSON.parse(last[last.indexOf("--settings") + 1]!).hooks.PreToolUse[0];
    expect(hook.matcher).toBe("mcp__claude_ai_.*");
    expect(hook.hooks[0].command).toMatch(/connector-guard\.mjs --hook$/);
  });
  it("off by default: the usual empty connector list", () => {
    const a = claude.isolation(true);
    expect(a).toContain("--strict-mcp-config");
    expect(claude.connectorIsolation("/t/mcp.json", true)).toEqual(expect.arrayContaining(["--mcp-config", "/t/mcp.json", "--allowedTools", "mcp__unchore,WebSearch"]));
  });
  it("a sign-in Claude Code renewed during the turn goes back to the member's folder", async () => {
    vi.stubEnv("FAKE_RENEW", "1");
    try { await ask(B, "renew"); } finally { vi.stubEnv("FAKE_RENEW", ""); }
    const cred = path.join(root, B, ".credentials.json");
    expect(readFileSync(cred, "utf8")).toBe("TOKEN-B-renewed");
    expect(lstatSync(cred).isSymbolicLink()).toBe(false);
    expect(leftovers(B)).toEqual([]);
  });
  it("a member who never signed in gets «signed out», and no folder is made", async () => {
    const r = await claude.chat(C, { connectors: true, messages: [{ role: "user", content: "hi" }] }, () => {}, undefined);
    expect(r).toEqual({ ok: false, why: "signed_out" });
    expect(existsSync(path.join(root, C))).toBe(false);
  });
});
