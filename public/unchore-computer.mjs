#!/usr/bin/env node
// Unchore — connect your computer. Runs on YOUR computer or server; Unchore never connects into it, this program calls out.
// It asks unchore.ai for work from your chats that use «🖥 <this computer>», runs your own coding agent here — Claude Code,
// Codex or Hermes Agent (your files, your tools, your sign-in) — and sends the answer back to the chat.
// Needs Node 18+ and one of them signed in: Claude Code (`claude`), Codex (`codex`) or Hermes Agent (`hermes`).
//
//   node unchore-computer.mjs --token ucc_…      first time (the token is saved in ~/.unchore/computer.json)
//   node unchore-computer.mjs                    after that
//   options: --dir <folder>  where Claude Code works (default: the folder you start it in)
//            --full          let Claude Code act without asking (it can't ask you from a chat). Default: file edits only.
//            --engine <claude|codex|hermes>  which agent answers (default: the first one found, in that order)
//            --model <name>  model for that agent (default: its own)
//            --server <url>  default https://unchore.ai
//            --accounts <dir,dir,…>  more than one Claude sign-in (CLAUDE_CONFIG_DIR folders): when one hits its usage limit,
//                            the work carries on with the next (the session goes with it)
//            --nice <0-19>   how far the agent steps back so this computer stays quick for your other work (default 10, 0 = off)
// Stop it with Ctrl+C. Disconnect it any time in Unchore → Settings → Your computers.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { homedir, hostname, platform, setPriority, tmpdir } from "node:os";
import path from "node:path";

const VERSION = "3";
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (n) => argv.includes(`--${n}`);
/** 0 (normal) … 19 (lowest); anything that isn't a number keeps the default 10. */
const niceOf = (v) => { const n = Math.round(Number(v ?? 10)); return Number.isFinite(n) ? Math.max(0, Math.min(19, n)) : 10; };
const CONF = path.join(homedir(), ".unchore", "computer.json");
let saved = {};
try { saved = JSON.parse(readFileSync(CONF, "utf8")); } catch { saved = {}; }
const conf = {
  token: opt("token") ?? process.env.UNCHORE_COMPUTER_TOKEN ?? saved.token,
  server: (opt("server") ?? saved.server ?? "https://unchore.ai").replace(/\/+$/, ""),
  dir: path.resolve(opt("dir") ?? saved.dir ?? process.cwd()),
  full: flag("full") || Boolean(saved.full && !flag("ask")),
  model: opt("model") ?? saved.model,
  engine: opt("engine") ?? saved.engine,
  claude: opt("claude") ?? process.env.UNCHORE_CLAUDE_BIN ?? saved.claude ?? "claude",
  codex: opt("codex") ?? process.env.UNCHORE_CODEX_BIN ?? saved.codex ?? "codex",
  hermes: opt("hermes") ?? process.env.UNCHORE_HERMES_BIN ?? saved.hermes ?? "hermes",
  nice: niceOf(opt("nice") ?? process.env.UNCHORE_NICE ?? saved.nice),
  accounts: (opt("accounts") ?? process.env.UNCHORE_CLAUDE_ACCOUNTS ?? (saved.accounts ?? []).join(",")).split(",").map((d) => d.trim()).filter(Boolean).map((d) => path.resolve(d)),
};
if (!conf.token) { console.error("No token. Copy the command from Unchore → Settings → Your computers."); process.exit(2); }
mkdirSync(path.dirname(CONF), { recursive: true, mode: 0o700 });
writeFileSync(CONF, JSON.stringify(conf, null, 1), { mode: 0o600 });

const log = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The first line a program prints for --version («» when it isn't installed). */
const versionOf = (bin) => new Promise((res) => {
  let out = "";
  const p = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
  p.stdout.on("data", (b) => { out += b; }); p.on("error", () => res("")); p.on("close", () => res(out.trim().split("\n")[0] ?? ""));
});
const ENGINES = ["claude", "codex", "hermes"];
const NAMES = { claude: "Claude Code", codex: "Codex", hermes: "Hermes Agent" };
if (conf.engine && !ENGINES.includes(conf.engine)) { console.error(`--engine is one of: ${ENGINES.join(", ")}`); process.exit(2); }
const found = {};
for (const e of ENGINES) found[e] = await versionOf(conf[e]);
const engine = conf.engine ?? ENGINES.find((e) => found[e]) ?? "claude";
if (!found[engine]) log(`⚠ ${NAMES[engine]} («${conf[engine]}») was not found. Install it and sign in, then start this again.`);
const info = JSON.stringify({ v: VERSION, host: hostname().slice(0, 60), os: platform(), engine, claude: found[engine].slice(0, 40), dir: path.basename(conf.dir), full: conf.full });

/** Files the member attached to the question, fetched into a folder of their own on this computer. Returns the lines for the prompt. */
async function fetchFiles(job, dir) {
  if (!job.files?.length) return "";
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const got = [];
  for (const f of job.files) {
    const r = await fetch(`${conf.server}/api/computer/jobs/${job.id}/files?f=${f.id}`, { headers: { authorization: `Bearer ${conf.token}` }, signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (!r?.ok) { got.push(`- ${f.name} (couldn't fetch it)`); continue; }
    const at = path.join(dir, path.basename(f.name).replace(/[\\/]/g, "_") || "file");
    writeFileSync(at, Buffer.from(await r.arrayBuffer()), { mode: 0o600 });
    got.push(`- ${at}`);
  }
  return `## Files the member attached (on this computer now)\n${got.join("\n")}\n\n`;
}

/** [[attach: /path]] (or [[첨부: /path]]) lines in the answer: each file is sent back to the chat and the line taken out. */
const ATTACH = /^\s*\[\[\s*(?:attach|첨부)\s*:\s*(.+?)\s*\]\]\s*$/gim;
async function sendBack(job, text) {
  if (!text) return text;
  const lines = [];
  for (const m of text.matchAll(ATTACH)) {
    const p = path.resolve(conf.dir, m[1]);
    const name = path.basename(p);
    let size = -1; try { size = existsSync(p) && statSync(p).isFile() ? statSync(p).size : -1; } catch { size = -1; }
    if (size < 0) { lines.push(`⚠ ${name}: not found on the computer`); continue; }
    if (size > 4_000_000) { lines.push(`⚠ ${name}: too big to send back (${Math.round(size / 1e6)} MB, the limit is 4 MB) — it is at ${p}`); continue; }
    const r = await fetch(`${conf.server}/api/computer/jobs/${job.id}/files?name=${encodeURIComponent(name)}`, { method: "POST", body: readFileSync(p),
      headers: { authorization: `Bearer ${conf.token}`, "content-type": "application/octet-stream" }, signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (!r?.ok) lines.push(`⚠ ${name}: couldn't send it back${r ? ` (${(await r.json().catch(() => ({}))).error ?? r.status})` : ""}`);
  }
  const rest = text.replace(ATTACH, "").replace(/\n{3,}/g, "\n\n").trim();
  return lines.length ? `${rest}\n\n${lines.join("\n")}` : rest;
}

async function api(p, body) {
  const r = await fetch(`${conf.server}${p}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${conf.token}`, "content-type": "application/json", "x-unchore-computer": info },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 401) { log("This computer was disconnected in Unchore (or the token is wrong). Stopping."); process.exit(3); }
  return r.json().catch(() => ({}));
}

/** The agent runs at low priority, so the member's own work on this computer stays quick. Where that isn't allowed it runs as usual, said once. */
let niceFailed = false;
function lower(child) {
  if (!conf.nice || !child.pid || niceFailed) return;
  try { setPriority(child.pid, conf.nice); }
  catch (e) { niceFailed = true; log(`couldn't lower the agent's priority here (${e.code ?? e.message}) — it runs at normal priority`); }
}

/** A Claude sign-in that is out of its usage limit (or signed out) — try the next one. */
const SPENT = /hit your (?:session |weekly |daily )?limit|usage limit|rate limit|credit balance is too low|OAuth|Failed to authenticate|Invalid API key|Please run \/login/i;
const cooled = new Map();   // account folder → when it may be tried again
const pickAccounts = () => { const now = Date.now(); const ok = conf.accounts.filter((a) => (cooled.get(a) ?? 0) <= now); return conf.accounts.length ? (ok.length ? ok : conf.accounts) : [undefined]; };

/** Claude Code keeps a session inside its sign-in folder — carry it over so the next account continues the same work. */
function carrySession(from, to, session) {
  if (!session || !from || !to || from === to) return;
  try {
    for (const d of readdirSync(path.join(from, "projects"))) {
      const f = path.join(from, "projects", d, `${session}.jsonl`);
      if (existsSync(f)) { mkdirSync(path.join(to, "projects", d), { recursive: true }); copyFileSync(f, path.join(to, "projects", d, `${session}.jsonl`)); return; }
    }
  } catch { /* no session to carry: the next account starts fresh with the same question */ }
}

/** One run of Claude Code in the folder; its progress goes out with tick(). */
function attempt(job, prompt, sysFile, session, account, st) {
  const args = ["-p", "--verbose", "--output-format", "stream-json", "--append-system-prompt-file", sysFile,
    ...(session && !session.includes(":") ? ["--resume", session] : []), ...(conf.model ? ["--model", conf.model] : []),
    ...(conf.full ? ["--dangerously-skip-permissions"] : ["--permission-mode", "acceptEdits"])];
  const env = { ...process.env, ...(conf.full && process.getuid?.() === 0 ? { IS_SANDBOX: "1" } : {}), ...(account ? { CLAUDE_CONFIG_DIR: account } : {}) };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  const child = spawn(conf.claude, args, { cwd: conf.dir, env, stdio: ["pipe", "pipe", "pipe"] });
  st.child = child; lower(child);
  child.stdin.end(prompt);
  const r = { session, final: undefined, isError: false, errText: "", code: 0 };
  let buf = "";
  child.stderr.on("data", (b) => { r.errText = (r.errText + b).slice(-2000); });
  child.stdout.on("data", (b) => {
    buf += b;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.session_id) { r.session = e.session_id; st.session = e.session_id; }
      if (e.type === "assistant") for (const c of e.message?.content ?? []) {
        if (c.type === "text" && c.text) { st.pending += `${c.text}\n\n`; st.note = c.text.replace(/\s+/g, " ").trim().slice(0, 160); st.worked = true; }
        if (c.type === "tool_use") { st.note = `${c.name}: ${String(c.input?.command ?? c.input?.file_path ?? c.input?.pattern ?? c.input?.description ?? "").replace(/\s+/g, " ").slice(0, 140)}`; st.worked = true; }
      }
      if (e.type === "result") { r.final = typeof e.result === "string" ? e.result : undefined; r.isError = Boolean(e.is_error); }
    }
  });
  return new Promise((res) => { child.on("close", (code) => { r.code = code; res(r); }); child.on("error", (err) => { r.errText = String(err.message); r.code = -1; res(r); }); });
}

/** Codex keeps no extra system prompt, so the instructions go in front of the question. Its session is kept as «codex:<id>». */
function attemptCodex(job, prompt, session, st) {
  const own = session?.startsWith("codex:") ? session.slice(6) : undefined;
  const opts = ["--json", "--skip-git-repo-check", ...(conf.model ? ["-m", conf.model] : []),
    ...(conf.full ? ["--dangerously-bypass-approvals-and-sandbox"] : [])];
  // --sandbox belongs to exec, not its resume subcommand; keep the member's protection on both turns.
  const base = ["exec", ...(conf.full ? [] : ["--sandbox", "workspace-write"])];
  const args = own ? [...base, "resume", own, ...opts, "-"] : [...base, "-C", conf.dir, ...opts, "-"];
  const child = spawn(conf.codex, args, { cwd: conf.dir, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  st.child = child; lower(child);
  child.stdin.end(own ? prompt : `${job.system ? `${job.system}\n\n---\n\n` : ""}${prompt}`);
  const r = { session, final: undefined, isError: false, errText: "", code: 0 };
  let buf = "", last;
  child.stderr.on("data", (b) => { r.errText = (r.errText + b).slice(-2000); });
  child.stdout.on("data", (b) => {
    buf += b;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type === "thread.started" && e.thread_id) { r.session = `codex:${e.thread_id}`; st.session = r.session; }
      const it = e.item;
      if (e.type === "item.completed" && it?.type === "agent_message" && it.text) { if (last) st.pending += `${last}\n\n`; last = it.text; st.note = it.text.replace(/\s+/g, " ").trim().slice(0, 160); st.worked = true; }
      if (e.type === "item.started" && it?.type === "command_execution") { st.note = `Bash: ${String(it.command ?? "").replace(/\s+/g, " ").slice(0, 140)}`; st.worked = true; }
      if (e.type === "turn.failed" || e.type === "error") { r.isError = true; r.errText = (r.errText + (e.error?.message ?? e.message ?? "")).slice(-2000); }
    }
  });
  return new Promise((res) => {
    const end = (code) => { r.code = code; r.final = last; res(r); };
    child.on("close", end); child.on("error", (err) => { r.errText = String(err.message); end(-1); });
  });
}

/** Hermes Agent: one question per run with -Q (only the answer is printed). --pass-session-id adds a «session_id: …» line,
 *  kept as «hermes:<id>» so the next message in the chat continues the same Hermes session (--resume). */
function attemptHermes(job, prompt, session, st) {
  const own = session?.startsWith("hermes:") ? session.slice(7) : undefined;
  const q = own ? prompt : `${job.system ? `${job.system}\n\n---\n\n` : ""}${prompt}`;
  const args = ["chat", "-Q", "-q", q, "--pass-session-id", ...(own ? ["--resume", own] : []), ...(conf.model ? ["--model", conf.model] : []), ...(conf.full ? ["--yolo"] : [])];
  const child = spawn(conf.hermes, args, { cwd: conf.dir, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  st.child = child; lower(child); st.note = "Hermes Agent is working…";
  const r = { session, final: "", isError: false, errText: "", code: 0 };
  child.stdout.on("data", (b) => { r.final += b; st.worked = true; });
  child.stderr.on("data", (b) => { r.errText = (r.errText + b).slice(-2000); });
  return new Promise((res) => {
    const end = (code) => {
      r.code = code;
      const id = r.final.match(/^session_id:\s*(\S+)\s*$/m) ?? r.errText.match(/^session_id:\s*(\S+)\s*$/m);   // Hermes prints it on stderr
      if (id) { r.session = `hermes:${id[1]}`; st.session = r.session; }
      r.final = r.final.replace(/^session_id:\s*\S+\s*$/m, "").trim() || undefined;
      res(r);
    };
    child.on("close", end); child.on("error", (err) => { r.errText = String(err.message); end(-1); });
  });
}

/** One job: Claude Code in the folder, its progress sent every ~1.5 s, ■ Stop honoured, the final answer sent at the end. */
async function run(job) {
  log(`▶ work ${job.id.slice(0, 8)}`);
  const sysFile = path.join(tmpdir(), `unchore-${job.id}.md`);
  writeFileSync(sysFile, job.system || "", { mode: 0o600 });
  const filesDir = path.join(tmpdir(), `unchore-files-${job.id}`);
  const st = { child: null, pending: "", note: "", session: job.session ?? undefined, stopped: false, worked: false };
  let done = false;
  const tick = async () => {
    const body = { ...(st.pending ? { append: st.pending } : {}), ...(st.note ? { note: st.note } : {}), ...(st.session ? { session: st.session } : {}) };
    st.pending = "";
    const r = await api(`/api/computer/jobs/${job.id}`, body).catch(() => null);
    if (r?.stop && !st.stopped) { st.stopped = true; log("■ stop asked"); st.child?.kill("SIGTERM"); const c = st.child; setTimeout(() => c?.kill("SIGKILL"), 5000).unref(); }
  };
  (async () => { while (!done) { await sleep(1500); if (!done) await tick(); } })();
  let prompt = (await fetchFiles(job, filesDir).catch(() => "")) + job.prompt;
  let r, prev;
  const tried = new Set();
  if (engine !== "claude") r = engine === "codex" ? await attemptCodex(job, prompt, st.session, st) : await attemptHermes(job, prompt, st.session, st);
  else for (const account of pickAccounts()) {
    if (tried.has(account)) continue;
    tried.add(account);
    carrySession(prev, account, st.session);
    r = await attempt(job, prompt, sysFile, st.session, account, st);
    prev = account;
    const spent = !st.stopped && (r.code !== 0 || r.isError) && SPENT.test(`${r.final ?? ""}\n${r.errText}`);
    if (!spent || !account) break;
    cooled.set(account, Date.now() + 30 * 60_000);
    log(`⚠ ${path.basename(account)} is out of its limit — going on with the next account`);
    st.note = "Switching to another Claude account…"; st.pending = "";
    // with a session the next account picks the same work up where it stopped; without one it starts the question again
    if (st.session && st.worked) prompt = "(The previous attempt stopped because the AI account reached its usage limit. Carry on with the same task from where you were.)";
  }
  done = true;
  rmSync(sysFile, { force: true });
  const status = st.stopped ? "stopped" : r.code === 0 && !r.isError ? "done" : "failed";
  let final = r.final;
  if (final != null && status === "done") final = await sendBack(job, final).catch(() => final);
  rmSync(filesDir, { recursive: true, force: true });
  const error = status === "failed" ? (r.final || r.errText || `${NAMES[engine]} ended with code ${r.code}`).trim().slice(-900) : undefined;
  await api(`/api/computer/jobs/${job.id}`, { ...(st.pending ? { append: st.pending } : {}), ...(st.session ? { session: st.session } : {}), finish: { status, ...(final != null && status !== "failed" ? { final } : {}), ...(error ? { error } : {}) } }).catch(() => null);
  log(`${status === "done" ? "✓" : status === "stopped" ? "■" : "⚠"} work ${job.id.slice(0, 8)} ${status}`);
}

log(`Unchore computer — ${NAMES[engine]} · ${conf.server} · folder ${conf.dir}${conf.full ? " · acts without asking" : ""}`);
let wait = 0, fails = 0;
for (;;) {
  if (wait) await sleep(wait * 1000);
  try {
    const r = await api("/api/computer/next");
    if (fails) log("connected again"); fails = 0;
    if (r.job) { await run(r.job); wait = 0; } else wait = Math.max(1, Math.min(60, Number(r.wait) || 10));
  } catch (e) {
    fails++; wait = Math.min(60, 5 * fails);
    if (fails === 1 || fails % 10 === 0) log(`can't reach Unchore (${e.message}) — trying again`);
  }
}
