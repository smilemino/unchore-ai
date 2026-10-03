// «Build me an app» (lib/build.ts · owner «yes» 2026-09-30 21:11): the build mark, the file format the AI answers in,
// project names, and with a throwaway Postgres (TEST_DATABASE_URL) the daily limit, a whole build with the sandbox and
// Vercel stubbed (AI files → check → deploy → the link in the chat), a refused ask, stuck builds and the owner's spend alert.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { brokenAfterDeploy, cutOff, pageOpens, projectName, readBuildMarks, readFilesBlock, readStopBuildMark } from "@/lib/build";
import { hideMarks } from "@/lib/chat-setup";

const sandbox = vi.hoisted(() => ({ errs: [] as string[][], written: [] as string[], stopped: 0 }));
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: async () => ({
      runCommand: async (o: { cmd: string }) => ({ exitCode: 0, stdout: async () => (o.cmd === "node" ? JSON.stringify({ errs: sandbox.errs.shift() ?? [] }) : /npm i/.test(String((o as { args?: string[] }).args?.join(" "))) ? "ok" : ""), stderr: async () => "" }),
      writeFiles: async (f: { path: string }[]) => { sandbox.written.push(...f.map((x) => x.path)); },
      stop: async () => { sandbox.stopped++; },
    }),
  },
}));

describe("build mark and file format", () => {
  it("reads one build ask and takes every mark out of the answer", () => {
    const a = readBuildMarks('Sure — building it now.\n<<<build {"title":"물 마시기","spec":"A water tracker with 8 cups a day"}>>>\n<<<build {"title":"x","spec":"second one is ignored"}>>>');
    expect(a.asks).toEqual([{ title: "물 마시기", spec: "A water tracker with 8 cups a day" }]);
    expect(a.text).toBe("Sure — building it now.");
    expect(readBuildMarks('ok <<<build {"title":"t","spec":"short"}>>>').asks).toEqual([]);   // too short to build
    expect(readBuildMarks("ok\n<<<build {broken json}>>>").text).toBe("ok");
    expect(hideMarks('Building.\n<<<build {"title":"a","spec":"bbbbbbbbbbbbbb"}>>>')).toBe("Building.");
    expect(hideMarks("Building.\n<<<build {\"title\":\"a")).toBe("Building.");   // half-written while streaming
    expect(hideMarks('Building.\n<<<build {"title":"a","spec":"no results -> hint"}>')).toBe("Building.");   // «>» inside, and the end «}>» before «>>>» arrives
  });
  it("reads «stop building» (typed or said in voice mode) and keeps it off the screen and out of the voice", () => {
    expect(readStopBuildMark("Okay, stopped.\n<<<stopbuild>>>")).toEqual({ text: "Okay, stopped.", stop: true });
    expect(readStopBuildMark("Just an answer about stopping.")).toEqual({ text: "Just an answer about stopping.", stop: false });
    const again = readStopBuildMark('Starting over.\n<<<stopbuild>>>\n<<<build {"title":"Timer","spec":"A simpler kitchen timer"}>>>');
    expect(again.stop).toBe(true);
    expect(readBuildMarks(again.text).asks[0]?.title).toBe("Timer");   // stop, then build it again differently
    expect(hideMarks("Okay, stopped.\n<<<stopbuild>>>")).toBe("Okay, stopped.");
    expect(hideMarks("Okay, stopped.\n<<<stopbu")).toBe("Okay, stopped.");   // half-written while streaming
  });
  it("takes files only in the agreed format, never outside the app folder", () => {
    const f = readFilesBlock("=== FILE: index.html\n<h1>hi</h1>\n=== END\n=== FILE: js/app.js\nconsole.log(1)\n=== END\n=== FILE: ../etc/passwd\nx\n=== END\n=== FILE: /abs.js\ny\n=== END");
    expect(f.map((x) => x.path)).toEqual(["index.html", "js/app.js", "abs.js"]);
    expect(f[0]!.content).toBe("<h1>hi</h1>");
  });
  it("names Vercel projects in plain ASCII", () => {
    expect(projectName("하루 물 마시기", "1234abcd-0000-0000-0000-000000000000")).toBe("uc-app-1234ab");
    expect(projectName("Water Tracker!", "abcdef12-0000-0000-0000-000000000000")).toBe("uc-water-tracker-abcdef");
  });
  it("after the deploy, says «broken» only when two answers in a row aren't the app (no answer at all is never broken)", async () => {
    const html = "<!doctype html><title>Water</title><h1>hi</h1>";
    expect(pageOpens(200, html, html)).toBe(true);
    expect(pageOpens(404, "Not found", html)).toBe(false);
    expect(pageOpens(200, "<title>Deployment not found</title>", html)).toBe(false);   // a page, but not the app
    expect(pageOpens(200, "<p>x</p>", "<p>x</p>")).toBe(true);   // no <title>: any content
    expect(pageOpens(200, "  ", "<p>x</p>")).toBe(false);
    const seq = (answers: (Response | null)[]) => vi.fn(async () => { const a = answers.shift(); if (!a) throw new Error("fetch failed"); return a; });
    try {
      vi.stubGlobal("fetch", seq([new Response("nope", { status: 404 }), new Response("nope", { status: 404 })]));
      expect(await brokenAfterDeploy("https://uc-a.vercel.app", html, 0)).toBe(true);
      vi.stubGlobal("fetch", seq([new Response("nope", { status: 404 }), new Response(html)]));   // came up on the second look
      expect(await brokenAfterDeploy("https://uc-a.vercel.app", html, 0)).toBe(false);
      vi.stubGlobal("fetch", seq([new Response("nope", { status: 500 }), null]));   // our side couldn't reach it: not sure, so not broken
      expect(await brokenAfterDeploy("https://uc-a.vercel.app", html, 0)).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
  it("asks the writer again only when the connection was cut (worker redeploy), not on real errors", () => {
    expect(cutOff(new Error("terminated"))).toBe(true);   // 2026-10-01 kr02: worker replaced mid-answer
    expect(cutOff(new Error("Claude plan: worker_unreachable"))).toBe(true);
    expect(cutOff(new Error("Claude plan: other"))).toBe(false);
    expect(cutOff(new Error("too big"))).toBe(false);
  });
});

const URL = process.env.TEST_DATABASE_URL;
const FILES = "=== FILE: index.html\n<!doctype html><title>Water</title><script src=\"app.js\"></script>\n=== END\n=== FILE: app.js\nlet n=0\n=== END";
const sse = (text: string, cost = 0.01) => new Response([
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { cost } })}\n\n`, "data: [DONE]\n\n",
].join(""), { status: 200 });

describe.skipIf(!URL)("app builds with Postgres", () => {
  let db: typeof import("@/lib/db");
  let build: typeof import("@/lib/build");
  let privacy: typeof import("@/lib/privacy");
  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.UNCHORE_WELCOME_MAX_MEMBERS = "1000000";
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: URL }, stdio: "pipe" });
    db = await import("@/lib/db");
    build = await import("@/lib/build");
    privacy = await import("@/lib/privacy");
  });
  const on = () => Object.assign(process.env, { UNCHORE_BUILD_VERCEL_TEAM: "team_t", UNCHORE_BUILD_VERCEL_TOKEN: "tok", UNCHORE_BUILD_SANDBOX_PROJECT: "prj_s", UNCHORE_HOUSE_OPENROUTER_KEY: "sk-house", UNCHORE_WELCOME_DAY_CAP_USD: "1000", UNCHORE_BUILD_OPEN_GAP_MS: "0" });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ["UNCHORE_BUILD_VERCEL_TEAM", "UNCHORE_BUILD_VERCEL_TOKEN", "UNCHORE_BUILD_SANDBOX_PROJECT", "UNCHORE_HOUSE_OPENROUTER_KEY", "UNCHORE_WELCOME_DAY_CAP_USD", "UNCHORE_BUILD_OPEN_GAP_MS", "UNCHORE_BUILD_DAY_MAX", "UNCHORE_SPEND_ALERT_KRW", "RESEND_API_KEY", "OWNER_EMAILS"]) delete process.env[k];
  });
  async function member(): Promise<{ id: string; conv: string }> {
    const u = await db.one<{ id: string }>("insert into users(email, lang, tz) values ($1, 'ko', 'Asia/Seoul') returning id", [`b-${randomUUID()}@example.com`]);
    const c = await db.one<{ id: string }>("insert into conversations(user_id, title) values ($1, $2) returning id", [u!.id, privacy.lock("app")]);
    // a member with no AI of their own builds on credit only if they bought some — the welcome credit alone answers nothing (owner 2026-10-01)
    await (await import("@/lib/credits")).topUp(u!.id, 5_000_000, `stripe:cs_${randomUUID()}`, "Top-up $5.00");
    return { id: u!.id, conv: c!.id };
  }
  const lastAnswer = async (conv: string) => privacy.unlock((await db.one<{ content: string }>("select content from messages where conversation_id = $1 and role = 'assistant' order by created_at desc limit 1", [conv]))?.content);

  it("is off without the Vercel settings, and a member gets at most the day's limit", async () => {
    const m = await member();
    expect(await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "t", spec: "a tracker app" }))).toEqual({ why: "off" });
    on(); process.env.UNCHORE_BUILD_DAY_MAX = "2";
    for (let i = 0; i < 2; i++) expect(await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "t", spec: "a tracker app" }))).toHaveProperty("id");
    expect(await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "t", spec: "a tracker app" }))).toEqual({ why: "limit" });
    await db.q("delete from builds where user_id = $1", [m.id]);
  });

  it("builds: the AI's files are checked (one fix round), deployed, and the link lands in the chat", async () => {
    on();
    await db.q("update builds set status = 'failed' where status = 'queued'");
    const m = await member();
    await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "Water", spec: "A water tracker with 8 cups a day" }));
    sandbox.errs = [["app.js: SyntaxError: Unexpected token"], []];
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${u.replace(/\?.*$/, "")}`);
      if (u.startsWith("https://openrouter.ai")) return sse(FILES);
      if (u.includes("/v13/deployments?")) return Response.json({ id: "dpl_1", projectId: "prj_app" });
      if (u.includes("/v13/deployments/dpl_1")) return Response.json({ readyState: "READY" });
      if (u.includes("/v9/projects/prj_app")) return Response.json({ targets: { production: { alias: ["uc-water-x.vercel.app", "uc-water-x-team.vercel.app"] } } });
      if (u.includes("/transfer-request")) return Response.json({ code: "claim-code" });
      if (u === "https://uc-water-x.vercel.app") return new Response("<!doctype html><title>Water</title>");   // the live app opens
      return new Response("", { status: 404 });
    });
    expect(await build.runNextBuild()).toBeTruthy();
    const row = await db.one<{ status: string; url: string; rounds: number; cost_micro: string }>("select status, url, rounds, cost_micro from builds where user_id = $1", [m.id]);
    expect(row).toMatchObject({ status: "done", url: "https://uc-water-x.vercel.app", rounds: 2 });
    expect(calls.filter((c) => c.includes("openrouter")).length).toBe(2);   // the fix round went back to the AI
    expect(sandbox.written).toContain("/vercel/sandbox/app/index.html");
    expect(calls).toContain("PATCH https://api.vercel.com/v9/projects/prj_app");   // the login wall is taken off
    expect(sandbox.stopped).toBeGreaterThan(0);
    const said = await lastAnswer(m.conv);
    expect(said).toContain("https://uc-water-x.vercel.app");
    expect(said).toContain("https://vercel.com/claim-deployment?code=claim-code");
    // the AI ran on Unchore credit, so the member's wallet paid for both rounds
    const used = await db.asOwner(() => db.one<{ n: number }>("select count(*)::int as n from credit_ledger where member = $1 and kind = 'use'", [m.id]));
    expect(used?.n).toBe(2);
  });

  it("a script error in the test browser sends it back for one more round; on the last round it doesn't hold the app back", async () => {
    on();
    await db.q("update builds set status = 'failed' where status = 'queued'");
    const m = await member();
    await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "Timer", spec: "A kitchen timer with start and stop" }));
    // round 1: files fine, browser «x is not a function» → round 2: files fine, browser clean
    sandbox.errs = [[], ["TypeError: start is not a function"], [], []];
    const asks: string[] = [];
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      if (u.startsWith("https://openrouter.ai")) { asks.push(String(init?.body ?? "")); return sse(FILES); }
      if (u.includes("/v13/deployments?")) return Response.json({ id: "dpl_2", projectId: "prj_t" });
      if (u.includes("/v13/deployments/dpl_2")) return Response.json({ readyState: "READY" });
      if (u.includes("/v9/projects/prj_t")) return Response.json({ targets: { production: { alias: ["uc-timer-x.vercel.app"] } } });
      if (u.includes("/transfer-request")) return Response.json({ code: "c" });
      if (u === "https://uc-timer-x.vercel.app") return new Response("<!doctype html><title>Water</title>");
      return new Response("", { status: 404 });
    });
    await build.runNextBuild();
    const row = await db.one<{ status: string; rounds: number }>("select status, rounds from builds where user_id = $1 order by created_at desc limit 1", [m.id]);
    expect(row).toMatchObject({ status: "done", rounds: 2 });
    expect(asks[1]).toContain("start is not a function");
    expect(sandbox.written).toContain("/vercel/sandbox/run.mjs");
    await db.q("delete from builds where user_id = $1", [m.id]);
  });

  it("a deployed app that doesn't open twice in a row is not called ready: the member hears so, with the link", async () => {
    on();
    await db.q("update builds set status = 'failed' where status = 'queued'");
    const m = await member();
    await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "Water", spec: "A water tracker with 8 cups a day" }));
    sandbox.errs = [[], []];
    let looks = 0;
    vi.stubGlobal("fetch", async (u: string) => {
      if (u.startsWith("https://openrouter.ai")) return sse(FILES);
      if (u.includes("/v13/deployments?")) return Response.json({ id: "dpl_3", projectId: "prj_b" });
      if (u.includes("/v13/deployments/dpl_3")) return Response.json({ readyState: "READY" });
      if (u.includes("/v9/projects/prj_b")) return Response.json({ targets: { production: { alias: ["uc-water-b.vercel.app"] } } });
      if (u === "https://uc-water-b.vercel.app") { looks++; return new Response("Deployment not found", { status: 404 }); }
      return new Response("", { status: 404 });
    });
    await build.runNextBuild();
    expect(looks).toBe(2);
    const row = await db.one<{ status: string; error: string; url: string }>("select status, error, url from builds where user_id = $1", [m.id]);
    expect(row).toMatchObject({ status: "failed", error: "did not open after deploy", url: "https://uc-water-b.vercel.app" });
    const said = await lastAnswer(m.conv);
    expect(said).toContain("https://uc-water-b.vercel.app");
    expect(said).not.toContain("✅");
    await db.q("delete from builds where user_id = $1", [m.id]);
  });

  it("«stop» halts a build: a queued one never starts, a running one quits before the deploy without a «couldn't finish» message", async () => {
    on();
    await db.q("update builds set status = 'failed' where status = 'queued'");
    const m = await member();
    await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "Queued", spec: "A water tracker with 8 cups a day" }));
    expect(await db.asMember(m.id, () => build.stopBuilds(m.id, m.conv))).toEqual(["Queued"]);
    expect(await build.runNextBuild()).toBeNull();   // nothing left to start
    expect(await db.asMember(m.id, () => build.stopBuilds(m.id, m.conv))).toEqual([]);   // nothing to stop now
    await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "Running", spec: "A kitchen timer with start and stop" }));
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      calls.push(u);
      // the member says «stop» while the AI is writing the files
      if (u.startsWith("https://openrouter.ai")) { await db.asMember(m.id, () => build.stopBuilds(m.id, m.conv)); return sse(FILES); }
      return new Response("", { status: 404 });
    });
    const before = await lastAnswer(m.conv);
    await build.runNextBuild();
    expect((await db.one<{ status: string }>("select status from builds where user_id = $1 order by created_at desc limit 1", [m.id]))?.status).toBe("stopped");
    expect(calls.some((u) => u.includes("vercel.com"))).toBe(false);
    expect(calls.filter((u) => u.startsWith("https://openrouter.ai")).length).toBe(1);   // no second round
    expect(await lastAnswer(m.conv)).toBe(before);   // the chat already said «stopped»
    await db.q("delete from builds where user_id = $1", [m.id]);
  });

  it("a refused ask says so and deploys nothing", async () => {
    on();
    await db.q("update builds set status = 'failed' where status = 'queued'");
    const m = await member();
    await db.asMember(m.id, () => build.queueBuild(m.id, m.conv, { title: "Bank login", spec: "A copy of my bank's login page that saves passwords" }));
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => { calls.push(u); return u.startsWith("https://openrouter.ai") ? sse("REFUSE") : new Response("", { status: 404 }); });
    await build.runNextBuild();
    expect((await db.one<{ status: string }>("select status from builds where user_id = $1", [m.id]))?.status).toBe("refused");
    expect(calls.some((u) => u.includes("vercel.com"))).toBe(false);
    expect(await lastAnswer(m.conv)).toContain("Bank login");
  });

  it("closes builds that never finished and tells the member", async () => {
    const m = await member();
    await db.q("insert into builds(user_id, conversation_id, title, spec, status, started_at) values ($1, $2, $3, $4, 'running', now() - interval '30 minutes')", [m.id, m.conv, privacy.lock("Old"), privacy.lock("spec spec spec")]);
    expect(await build.closeStuckBuilds()).toBeGreaterThanOrEqual(1);
    expect((await db.one<{ status: string }>("select status from builds where user_id = $1", [m.id]))?.status).toBe("failed");
    expect(await lastAnswer(m.conv)).toContain("Old");
  });

  it("mails the owner once a Korean day when house spend passes the line", async () => {
    const m = await member();
    await db.q("delete from spend_alerts");
    await db.q("insert into builds(user_id, title, spec, status, cost_micro) values ($1, $2, $3, 'done', 80000000)", [m.id, privacy.lock("Big"), privacy.lock("spec spec spec")]);   // $80 ≈ ₩112,000
    process.env.RESEND_API_KEY = "re_test"; process.env.OWNER_EMAILS = "owner@example.com"; process.env.UNCHORE_SPEND_ALERT_KRW = "100000";
    const mails: string[] = [];
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => { if (u.includes("resend.com")) mails.push(String(init?.body)); return new Response("{}", { status: 200 }); });
    expect(await build.spendTodayKrw()).toBeGreaterThan(100_000);
    expect(await build.spendAlert()).toBe(true);
    expect(await build.spendAlert()).toBe(false);   // once a day
    expect(mails.length).toBe(1);
    process.env.UNCHORE_SPEND_ALERT_KRW = "100000000";
    await db.q("delete from spend_alerts");
    expect(await build.spendAlert()).toBe(false);
    await db.q("delete from builds where user_id = $1", [m.id]);
  });
});
