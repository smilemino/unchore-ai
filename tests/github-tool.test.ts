import { afterEach, describe, expect, it, vi } from "vitest";
import { diffText, githubTool } from "@/lib/tools/github";

// Pull-request review with the member's own GitHub connection (lib/tools/github.ts) — a fake GitHub, no network, no database.
const me = { userId: "u1", yes: false };
const calls: Array<{ url: string; method: string; body?: unknown }> = [];
function fakeGitHub(routes: Record<string, { status?: number; body: unknown }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghs_tok");
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    const r = key ? routes[key]! : { status: 404, body: { message: "Not Found" } };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; });

describe("GitHub pull requests", () => {
  it("without a connection, gives the one-tap connect link", async () => {
    const r = await githubTool(me, { action: "prs", repo: "a/b" }, null);
    expect(r.ok).toBe(false);
    expect(r.text).toContain("/api/connect/github/start");
  });

  it("refuses a repository that isn't owner/name", async () => {
    for (const repo of ["", "nope", "a/b/c", "a b/c"]) expect((await githubTool(me, { action: "prs", repo }, "ghs_tok")).ok).toBe(false);
  });

  it("lists open pull requests (a github.com link works too)", async () => {
    fakeGitHub({ "/repos/a/b/pulls?state=open&per_page=30": { body: [{ number: 7, title: "Fix login", user: { login: "kim" }, draft: false, updated_at: "2026-10-01T03:00:00Z" }] } });
    const r = await githubTool(me, { action: "prs", repo: "https://github.com/a/b" }, "ghs_tok");
    expect(r).toEqual({ ok: true, text: "Open pull requests in a/b:\n#7 Fix login — kim · updated 2026-10-01" });
  });

  it("reads one pull request with its diffs", async () => {
    fakeGitHub({
      "/repos/a/b/pulls/7": { body: { title: "Fix login", body: "Closes #3", user: { login: "kim" }, base: { ref: "main" }, head: { ref: "fix" }, html_url: "https://github.com/a/b/pull/7", changed_files: 1 } },
      "/repos/a/b/pulls/7/files?per_page=100": { body: [{ filename: "app.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" }] },
    });
    const r = await githubTool(me, { action: "pr", repo: "a/b", number: 7 }, "ghs_tok");
    expect(r.ok).toBe(true);
    expect(r.text).toContain("#7 Fix login — kim · fix → main · 1 file(s)");
    expect(r.text).toContain("Closes #3");
    expect(r.text).toContain("### app.ts (modified, +1 −1)\n```diff\n@@ -1 +1 @@\n-a\n+b\n```");
    expect(r.text).not.toContain("ghs_tok");
  });

  it("cuts long diffs per file and in all, and says so", () => {
    const big = Array.from({ length: 12 }, (_, i) => ({ filename: `f${i}.ts`, status: "modified", additions: 1, deletions: 0, patch: "x".repeat(20_000) }));
    const t = diffText(big);
    expect(t).toContain("this file's diff is cut here");
    expect(t).toMatch(/more file\(s\) not shown/);
    expect(t.length).toBeLessThan(70_000);
  });

  it("won't post without the member's yes", async () => {
    fakeGitHub({});
    const r = await githubTool(me, { action: "comment", repo: "a/b", number: 7, body: "Looks good" }, "ghs_tok");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("yes");
    expect(calls).toHaveLength(0);
  });

  it("posts a review — on one line when a file and line are given", async () => {
    fakeGitHub({ "/repos/a/b/pulls/7/reviews": { status: 200, body: { html_url: "https://github.com/a/b/pull/7#r1" } } });
    const r = await githubTool({ ...me, yes: true }, { action: "comment", repo: "a/b", number: 7, body: "Rename this", path: "app.ts", line: 1 }, "ghs_tok");
    expect(r).toEqual({ ok: true, text: "Posted on a/b#7: https://github.com/a/b/pull/7#r1" });
    expect(calls[0]).toMatchObject({ method: "POST", body: { event: "COMMENT", body: "Comment on app.ts line 1.", comments: [{ path: "app.ts", line: 1, side: "RIGHT", body: "Rename this" }] } });
    await githubTool({ ...me, yes: true }, { action: "comment", repo: "a/b", number: 7, body: "Overall fine" }, "ghs_tok");
    expect(calls[1]!.body).toEqual({ event: "COMMENT", body: "Overall fine" });
  });

  it("explains GitHub's no", async () => {
    fakeGitHub({ "/repos/a/b/pulls/9": { status: 404, body: { message: "Not Found" } }, "/repos/a/b/pulls/9/files?per_page=100": { status: 404, body: {} } });
    const r = await githubTool(me, { action: "pr", repo: "a/b", number: 9 }, "ghs_tok");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("doesn't exist or this connection can't see it");
  });
});
