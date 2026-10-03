import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// «My computer» (lib/tools/computer.ts): a fake Vercel Sandbox and a fake vault — no network, no database.
const files = new Map<string, string>();
const runs: Array<{ args: string[]; env?: Record<string, string>; cwd?: string }> = [];
let reply: (cmd: string) => { code: number; out: string } = () => ({ code: 0, out: "" });
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    getOrCreate: vi.fn(async () => ({
      runCommand: async (p: { args: string[]; env?: Record<string, string>; cwd?: string }) => {
        runs.push(p);
        const r = reply(p.args[1] ?? "");
        return { exitCode: r.code, stdout: async () => r.out, stderr: async () => "" };
      },
      writeFiles: async (fs: Array<{ path: string; content: Buffer }>) => { for (const f of fs) files.set(f.path, f.content.toString("utf8")); },
      readFileToBuffer: async ({ path }: { path: string }) => (files.has(path) ? Buffer.from(files.get(path)!) : null),
    })),
  },
}));
vi.mock("@/lib/vault", () => ({ vaultSecret: async (_u: string, n: string) => (n === "GITHUB_TOKEN" ? "ghp_realtokenvalue123" : null) }));
vi.mock("../lib/vault", () => ({ vaultSecret: async (_u: string, n: string) => (n === "GITHUB_TOKEN" ? "ghp_realtokenvalue123" : null) }));

const { computerTool, computerFor, needsYes, WORK } = await import("@/lib/tools/computer");
const { toolDefsFor, TOOL_DEFS } = await import("@/lib/tools/defs");
const { COMPUTER } = await import("@/lib/tools/computer");
const me = { userId: "0f8fad5b-d9cb-469f-a165-70867728950e", tz: "Asia/Seoul", yes: false };

beforeEach(() => {
  files.clear(); runs.length = 0; reply = () => ({ code: 0, out: "" });
  process.env.UNCHORE_BUILD_VERCEL_TEAM = "team"; process.env.UNCHORE_BUILD_VERCEL_TOKEN = "tok"; process.env.UNCHORE_BUILD_SANDBOX_PROJECT = "prj";
  process.env.OWNER_EMAILS = "Owner@Example.com";
  delete process.env.UNCHORE_COMPUTER; delete process.env.UNCHORE_BUILD;
});
afterEach(() => { delete process.env.OWNER_EMAILS; });

describe("who gets a computer", () => {
  it("every member (machine time is metered); only the owners with UNCHORE_COMPUTER=owner; nobody when off or without the sandbox account", () => {
    expect(computerFor("owner@example.com")).toBe(true);
    expect(computerFor("someone@example.com")).toBe(true);
    process.env.UNCHORE_COMPUTER = "owner";
    expect(computerFor("someone@example.com")).toBe(false);
    expect(computerFor(null)).toBe(false);
    expect(computerFor("owner@example.com")).toBe(true);
    process.env.UNCHORE_COMPUTER = "off";
    expect(computerFor("owner@example.com")).toBe(false);
    delete process.env.UNCHORE_COMPUTER;
    process.env.UNCHORE_BUILD = "off";
    expect(computerFor("owner@example.com")).toBe(false);
  });
  it("adds the computer to the tool list only when it is on", () => {
    expect(toolDefsFor(false, TOOL_DEFS, COMPUTER).some((d) => d.name === "computer")).toBe(false);
    expect(toolDefsFor(true, TOOL_DEFS, COMPUTER).some((d) => d.name === "computer")).toBe(true);
  });
});

describe("steps that wait for the member's yes", () => {
  it("catches pushes to main, force pushes, merges, releases and production deploys", () => {
    for (const c of ["git push origin main", "cd app && git push -u origin HEAD:master", "git push --force origin fix", "git push origin +fix", "git push -f",
      "gh pr merge 12 --squash", "npm publish", "vercel deploy --prod", "railway up", "gh repo delete me/x --yes", "git push origin --delete old"]) expect(needsYes(c), c).not.toBeNull();
  });
  it("lets ordinary work through", () => {
    for (const c of ["git push -u origin fix/login-button", "git push origin feature/main-menu", "git status", "pnpm test", "vercel deploy", "gh pr create --fill", "git commit -m 'main fix'"]) expect(needsYes(c), c).toBeNull();
  });
  it("stops a push to main without a yes and passes it with one", async () => {
    const no = await computerTool(me, { action: "run", command: "git push origin main" });
    expect(no.ok).toBe(false);
    expect(no.text).toMatch(/yes/);
    expect(runs.length).toBe(0);
    const yes = await computerTool({ ...me, yes: true }, { action: "run", command: "git push origin main" });
    expect(yes.ok).toBe(true);
    expect(runs.at(-1)!.env!.UC_YES).toBe("1");
  });
  it("stops a push that skips the safety hook", async () => {
    expect((await computerTool(me, { action: "run", command: "git push --no-verify -u origin fix" })).ok).toBe(false);
  });
});

describe("running commands", () => {
  it("passes a saved secret for that command only and never shows its value", async () => {
    reply = (c) => (c.includes("echo") ? { code: 0, out: "token is ghp_realtokenvalue123" } : { code: 0, out: "" });
    const r = await computerTool(me, { action: "run", command: "echo $GITHUB_TOKEN", secrets: ["GITHUB_TOKEN"] });
    expect(r.text).not.toContain("ghp_realtokenvalue123");
    expect(r.text).toContain("***");
    const last = runs.at(-1)!;
    expect(last.env!.GITHUB_TOKEN).toBe("ghp_realtokenvalue123");
    expect(last.env!.GH_TOKEN).toBe("ghp_realtokenvalue123");
    expect(last.args[1]).not.toContain("ghp_");
    expect(last.cwd).toBe(WORK);
  });
  it("asks for a secret that isn't saved instead of running", async () => {
    const r = await computerTool(me, { action: "run", command: "vercel ls", secrets: ["VERCEL_TOKEN"] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/<<<secret name="VERCEL_TOKEN">>>/);
  });
  it("reports the exit code and cuts long output from the front", async () => {
    reply = (c) => (c === "pnpm test" ? { code: 1, out: `${"x".repeat(9000)}\nFAIL tests/a.test.ts` } : { code: 0, out: "" });
    const r = await computerTool(me, { action: "run", command: "pnpm test" });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/^exit 1/);
    expect(r.text).toContain("FAIL tests/a.test.ts");
    expect(r.text.length).toBeLessThan(7300);
  });
  it("starts long work in the background with a log to check", async () => {
    reply = () => ({ code: 0, out: "started" });
    const r = await computerTool(me, { action: "run", command: "pnpm build", background: true });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/\.uc-jobs\/.*\.log/);
    expect(runs.at(-1)!.args[1]).toMatch(/^mkdir -p ~\/\.uc-jobs && nohup bash -lc 'pnpm build'/);
  });
  it("sets up git and the push guard once", async () => {
    await computerTool({ ...me, userId: "11111111-1111-4111-8111-111111111111" }, { action: "run", command: "ls" });
    const setup = runs.find((x) => x.args[1]!.includes("pre-push"))!;
    expect(setup.args[1]).toMatch(/^test -f ~\/\.uc-hooks\/pre-push \|\| \{ /);
    expect(setup.args[1]).toContain("core.hooksPath");
    expect(setup.args[1]).not.toMatch(/ghp_|GITHUB_TOKEN=/);
  });
});

describe("files", () => {
  it("writes, edits one exact piece, and refuses an ambiguous edit", async () => {
    await computerTool(me, { action: "write", path: "app/a.ts", text: "const a = 1;\nconst b = 1;\n" });
    expect(files.get(`${WORK}/app/a.ts`)).toBe("const a = 1;\nconst b = 1;\n");
    const amb = await computerTool(me, { action: "edit", path: "app/a.ts", old: " = 1;", new: " = 2;" });
    expect(amb.ok).toBe(false);
    expect(amb.text).toMatch(/2 times/);
    expect((await computerTool(me, { action: "edit", path: "app/a.ts", old: "const b = 1;", new: "const b = $& 2;" })).ok).toBe(true);
    expect(files.get(`${WORK}/app/a.ts`)).toBe("const a = 1;\nconst b = $& 2;\n");
    expect((await computerTool(me, { action: "edit", path: "app/a.ts", old: "nothing like this", new: "x" })).ok).toBe(false);
    expect((await computerTool(me, { action: "edit", path: "/etc/none", old: "a", new: "b" })).text).toMatch(/No file/);
  });
});

describe("GitHub not connected yet", () => {
  it("gives the one-tap connect link instead of asking for a token", async () => {
    const { computerTool: run } = await import("@/lib/tools/computer");
    const vault = await import("@/lib/vault");
    const spy = vi.spyOn(vault, "vaultSecret").mockResolvedValue(null);
    const r = await run(me, { action: "run", command: "git clone https://github.com/a/b", secrets: ["GITHUB_TOKEN"] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/\/api\/connect\/github\/start/);
    spy.mockRestore();
  });
});

// Reminder «check first» commands (AI Soul reminder gates, migration b83a 2026-10-03): exit 10 = nothing to tell, 0 = material, else = failed.
describe("reminder check command", () => {
  it("exit 10 skips, exit 0 hands the output over masked, anything else says it failed", async () => {
    const { runGate, GATE_QUIET } = await import("@/lib/tools/computer");
    reply = (c) => (c.includes("quiet") ? { code: GATE_QUIET, out: "" } : c.includes("boom") ? { code: 2, out: "no such file" } : { code: 0, out: "new mail: 1 · token ghp_realtokenvalue123" });
    expect(await runGate(me.userId, me.tz, "check quiet")).toEqual({ skip: true });
    const found = await runGate(me.userId, me.tz, "check mail", ["GITHUB_TOKEN"]);
    expect(found).toEqual({ skip: false, out: "new mail: 1 · token ***" });
    expect(runs.at(-1)?.env).toMatchObject({ GITHUB_TOKEN: "ghp_realtokenvalue123" });
    const bad = await runGate(me.userId, me.tz, "boom");
    expect(bad.skip).toBe(false);
    expect(!bad.skip && bad.out).toContain("exit 2");
  });
});
