// ChatGPT subscription (Plus/Pro) — hosted, UNMODIFIED OpenAI Codex CLI, one CODEX_HOME folder per user (owner 2026-10-01
// «ChatGPT like AI Soul»; the same way AI Soul runs the owner's own ChatGPT plan, worker/codex-account.ts there).
//  · the user signs in on OpenAI's own page with a one-time device code (`codex login --device-auth`) — Unchore never sees
//    their password, and never copies, sends or logs the tokens Codex writes into that user's folder (only the account e-mail is read, for the settings row);
//  · answers run with every tool off (no commands, no files, no browser, no apps) in a read-only sandbox inside an empty
//    folder, so one user's Codex can't look at anything on this machine — checked 2026-10-01: asked to read a file next door,
//    it answered that it can't.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, mkdtempSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { UUID, buildPrompt, runLimitMs } from "./claude.mjs";
import { pool } from "./warm.mjs";
import { Slots } from "./slots.mjs";
import { parseResetAt } from "./reset-at.mjs";


const BIN = process.env.CODEX_BIN || "codex";
const ROOT = process.env.CODEX_HOME_ROOT || "/data/codex";
const MAX_RUNS = Number(process.env.CODEX_MAX_RUNS ?? 4);
const SIDE_RUNS = Number(process.env.CODEX_SIDE_RUNS ?? 2);
const MODELS = new Set(["gpt-6-sol", "gpt-6-astra", "gpt-6-luna"]);
const LOGIN_MS = 15 * 60_000;
/** Everything that could run a command or reach outside the answer (codex 0.155 `codex features list`). */
export const OFF = ["shell_tool", "unified_exec", "unified_exec_tty", "apps", "browser_use", "browser_use_external", "browser_use_full_cdp_access",
  "computer_use", "in_app_browser", "code_mode_host", "multi_agent", "plugins", "remote_plugin", "view_image", "image_generation", "hooks",
  "skill_mcp_dependency_install", "skill_search", "tool_suggest", "goals", "in_app_local_automation", "shell_snapshot", "workspace_dependencies", "sleep_tool"];

export function userDir(userId) {
  if (!UUID.test(userId)) throw new Error("bad user");
  return path.join(ROOT, userId);
}

function env(dir) {
  const e = { ...process.env, CODEX_HOME: dir, BROWSER: "/bin/false" };
  delete e.OPENAI_API_KEY; delete e.CODEX_API_KEY; delete e.CRON_SECRET; delete e.ANTHROPIC_API_KEY;
  return e;
}

/** The link and one-time code `codex login --device-auth` prints (colours stripped). */
export function parseDeviceLogin(out) {
  const clean = out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
  const url = /https:\/\/auth\.openai\.com\/[^\s"'<>]*device[^\s"'<>]*/.exec(clean)?.[0];
  const code = /one-time code[^\n]*\n\s*([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/i.exec(clean)?.[1] ?? /\b([A-Z0-9]{4}-[A-Z0-9]{5})\b/.exec(clean)?.[1];
  return url && code ? { url, code } : null;
}

const logins = new Map(); // userId -> { child, out, rc, timer }

/** Starts the sign-in; returns OpenAI's page and the code to type there. The process waits (15 min) for the user to finish. */
export function loginStart(userId) {
  const dir = userDir(userId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const old = logins.get(userId);
  if (old) { clearTimeout(old.timer); try { old.child.kill("SIGKILL"); } catch { /* gone */ } logins.delete(userId); }
  return new Promise((resolve) => {
    const child = spawn(BIN, ["login", "--device-auth"], { env: env(dir), stdio: ["ignore", "pipe", "pipe"] });
    const s = { child, out: "", rc: null, timer: setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } }, LOGIN_MS + 30_000) };
    logins.set(userId, s);
    let got = null;
    const give = setTimeout(() => { if (!got) resolve({ ok: false, why: "no sign-in link" }); }, 30_000);
    const onData = (d) => {
      s.out += d.toString(); if (s.out.length > 20_000) s.out = s.out.slice(-20_000);
      if (!got) { got = parseDeviceLogin(s.out); if (got) { clearTimeout(give); resolve({ ok: true, url: got.url, code: got.code }); } }
    };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    child.on("error", () => { clearTimeout(give); resolve({ ok: false, why: "codex not installed" }); });
    child.on("close", (rc) => { clearTimeout(s.timer); s.rc = rc; if (!got) { clearTimeout(give); resolve({ ok: false, why: "no sign-in link" }); } });
  });
}

function runOnce(args, dir, ms) {
  return new Promise((resolve) => {
    const child = spawn(BIN, args, { env: env(dir), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const t = setTimeout(() => child.kill("SIGKILL"), ms);
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("error", () => { clearTimeout(t); resolve(null); });
    child.on("close", (rc) => { clearTimeout(t); resolve({ rc, out }); });
  });
}

/** Signed in? While the sign-in is still waiting for the user: { waiting: true }. */
export async function status(userId) {
  const dir = userDir(userId);
  const s = logins.get(userId);
  if (s && s.rc === null) return { loggedIn: false, waiting: true };
  if (s) logins.delete(userId);
  if (!existsSync(dir)) return { loggedIn: false };
  const r = await runOnce(["login", "status"], dir, 30_000);
  const loggedIn = r?.rc === 0;   // measured on 0.155: signed out = exit 1 «Not logged in», signed in = 0 «Logged in using ChatGPT»
  return loggedIn ? { loggedIn, email: signedInEmail(dir) } : { loggedIn };
}

/** Which OpenAI account the folder is signed in with — only the «email» line of the sign-in's identity card (id_token in
 *  auth.json), as AI Soul does (worker/account-emails.ts). The tokens themselves are never returned, sent or logged. */
export function signedInEmail(dir) {
  try {
    const t = JSON.parse(readFileSync(path.join(dir, "auth.json"), "utf8"))?.tokens?.id_token;
    if (typeof t !== "string") return null;
    const e = JSON.parse(Buffer.from(t.split(".")[1] ?? "", "base64url").toString("utf8"))?.email;
    return typeof e === "string" && /^[^\s@]+@[^\s@]+$/.test(e) ? e : null;
  } catch { return null; }
}

export async function logout(userId) {
  const dir = userDir(userId);
  const s = logins.get(userId);
  if (s) { clearTimeout(s.timer); try { s.child.kill("SIGKILL"); } catch { /* */ } logins.delete(userId); }
  if (existsSync(dir)) await runOnce(["logout"], dir, 30_000);
  rmSync(dir, { recursive: true, force: true });
  return { ok: true };
}

export function classify(msg) {
  const m = String(msg).toLowerCase();
  if (/usage limit|rate limit|limit reached|hit your (\S+ )?limit|try again (at|in)|quota|429/.test(m)) return "limit";
  if (/not logged in|log ?in again|sign in again|refresh token|unauthorized|401|expired|authentication/.test(m)) return "signed_out";
  return "other";
}

/** Web search when the app asks for it (`web_search=live`, as AI Soul worker/engines/codex.ts). Codex 0.155 calls web search from
 *  inside code mode («code-mode host is disabled» otherwise), so that one stays on for a searching turn only — checked 2026-10-01:
 *  in there require/process/fetch/fs are all undefined and the tools are web__run, clock and apply_patch (read-only sandbox). Pictures ride along with `-i <file>` (Codex reads them itself — the view_image tool stays off), the way AI Soul does (worker/engines/codex.ts). */
export function codexArgs(model, cwd, imageFiles = [], webSearch = false) {
  return ["exec", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "-c", "project_doc_max_bytes=0",
    "-c", "model_reasoning_effort=medium", ...(webSearch ? ["-c", "web_search=live"] : []),
    ...OFF.filter((f) => !(webSearch && f === "code_mode_host")).flatMap((f) => ["--disable", f]), "-s", "read-only", "--json", "-m", model, "-C", cwd,
    ...imageFiles.flatMap((f) => ["-i", f]), "-"];
}

const pick = (body) => (MODELS.has(body.model) ? body.model : "gpt-6-sol");
export const warmKey = (model, webSearch) => JSON.stringify(["codex", model, webSearch]);

/** Codex in a fresh empty folder, waiting for the prompt on its input (pictures are fixed at start, so a turn with pictures starts fresh). */
function launch(userId, model, webSearch, images = []) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "uc-cx-"));
  try {
    const cwd = path.join(tmp, "work");
    mkdirSync(cwd);
    // Outside the answer's folder, removed with it.
    const imageFiles = images.map((im, i) => { const f = path.join(tmp, `img${i}.${im.mime.split("/")[1]}`); writeFileSync(f, Buffer.from(im.b64, "base64"), { mode: 0o600 }); return f; });
    const child = spawn(BIN, codexArgs(model, cwd, imageFiles, webSearch), { cwd, env: env(userDir(userId)), stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.on("error", () => { /* Codex ended first */ });
    return { child, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
  } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; }
}

/** The app saw this member start typing (or turn voice mode on): have their Codex ready (worker/warm.mjs). */
export function warm(userId, body, wp = pool) {
  if (!existsSync(userDir(userId))) return "signed_out";
  const model = pick(body), webSearch = body.webSearch === true;
  return wp.warm(userId, warmKey(model, webSearch), () => launch(userId, model, webSearch));
}

/** Answers wait in line for a seat; side calls (body.side — titles, memory) have their own seats (worker/slots.mjs). */
export const seats = { answer: new Slots(MAX_RUNS), side: new Slots(SIDE_RUNS) };
/** Streams answer text to `write` (Codex gives whole paragraphs, not letters). Returns { ok, why? }. */
export async function chat(userId, body, write, signal, wp = pool, slots = seats) {
  const dir = userDir(userId);
  if (!existsSync(dir)) return { ok: false, why: "signed_out" };
  const model = pick(body), webSearch = body.webSearch === true;
  const side = body.side === true;
  const { system, text, images } = buildPrompt(String(body.system ?? ""), Array.isArray(body.messages) ? body.messages : []);
  const release = await (side ? slots.side : slots.answer).take(signal);
  if (!release) return { ok: false, why: "busy" };
  const w = images.length || side ? null : wp.take(userId, warmKey(model, webSearch));
  let p = w;
  try {
    p ??= launch(userId, model, webSearch, images);
    const child = p.child;
    // Codex has no system slot: the instructions go first, then the member's message.
    const prompt = `${system}\n\n────────\nAbove are your instructions (you are Unchore). Below is the member's message.\n\n${text}`;
    return await new Promise((resolve) => {
      let buf = "", err = "", errMsg = null, wrote = false;
      const t = setTimeout(() => child.kill("SIGKILL"), runLimitMs(body));
      signal?.addEventListener("abort", () => child.kill("SIGTERM"));
      child.stderr.on("data", (d) => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
      child.stdout.on("data", (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          let j; try { j = JSON.parse(line); } catch { continue; }
          if (j.type === "item.completed" && j.item?.type === "agent_message" && j.item.text) { write((wrote ? "\n\n" : "") + j.item.text); wrote = true; }
          else if (j.type === "turn.failed" || j.type === "error") errMsg = j.error?.message ?? j.message ?? "error";
        }
      });
      child.on("error", () => { clearTimeout(t); resolve({ ok: false, why: "other" }); });
      child.on("close", (rc) => {
        clearTimeout(t);
        if (wrote && rc === 0) { resolve({ ok: true }); return; }
        const said = `${errMsg ?? ""} ${err}`, why = classify(said), resetsAt = why === "limit" ? parseResetAt(said) : null;
        resolve({ ok: false, why, ...(resetsAt ? { resetsAt } : {}) });
      });
      child.stdin.end(prompt);
    });
  } finally {
    release();
    if (!w) p?.cleanup();   // one started ahead is cleaned by the pool when it ends
  }
}
