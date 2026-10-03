// Unchore worker (Railway): 1) scheduler heartbeat — calls the app's tick every minute and the nightly check at 04:00 Asia/Seoul;
// 2) real-browser recipes on POST /run. Auth for both directions: Bearer CRON_SECRET.
import http from "node:http";
import { chromium } from "playwright-core";
import { CANARIES, RECIPES } from "./recipes.mjs";
import * as claude from "./claude.mjs";
import * as chatgpt from "./chatgpt.mjs";
import { makeVideo } from "./video.mjs";
import { piecesTo, speechToText, youtubeText } from "./media.mjs";
import { browserTool, browsersOpen, seoAudit } from "./tools.mjs";
import { pool as warmPool } from "./warm.mjs";
import { makeDrain } from "./drain.mjs";

const APP = (process.env.APP_URL ?? "https://unchore.ai").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";
const PORT = Number(process.env.PORT ?? 8080);
const log = (...a) => console.log(new Date().toISOString(), ...a);
// One bad request must never restart the worker: a restart cuts every member's answer that is running at that moment.
process.on("unhandledRejection", (e) => log("unhandled", String(e?.message ?? e).slice(0, 160)));

const drain = makeDrain({ log, exit: (code) => process.exit(code), maxMs: Number(process.env.WORKER_DRAIN_MAX_MS) || undefined });

let browser = null;
async function getBrowser() {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  return browser;
}

const seatsReport = () => Object.fromEntries([["claude", claude.seats], ["chatgpt", chatgpt.seats]].flatMap(([p, x]) => [[`${p}`, x.answer.report()], [`${p}_side`, x.side.report()]]));
let running = 0;
async function runRecipe(id, args) {
  const fn = RECIPES[id];
  if (!fn) return { ok: false, why: `unknown recipe ${id}` };
  if (running >= 3) return { ok: false, why: "busy" };
  running++;
  const ctx = await (await getBrowser()).newContext({ locale: "ko-KR", timezoneId: "Asia/Seoul", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
  try {
    const page = await ctx.newPage();
    return await fn(page, args);
  } catch (e) {
    return { ok: false, why: String(e.message ?? e).slice(0, 200) };
  } finally {
    running--;
    await ctx.close().catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") { res.end(JSON.stringify({ ok: true, draining: drain.draining, running, browsers: browsersOpen(), warm: warmPool.report(), seats: seatsReport() })); return; }
  if (req.method !== "POST" || !(req.url === "/run" || req.url === "/video" || req.url === "/speech" || req.url === "/youtube" || req.url === "/tool" || req.url?.startsWith("/claude/") || req.url?.startsWith("/chatgpt/")) || req.headers.authorization !== `Bearer ${SECRET}` || !SECRET) { res.statusCode = 404; res.end(); return; }
  if (drain.draining) { res.statusCode = 503; res.end(); return; }   // a new worker is up: it takes the new work (worker/drain.mjs)
  drain.track(res);
  let body = "";
  // Chat bodies carry attached pictures (up to 4 MB each before base64, lib/uploads.ts) — the old 600 kB cap cut them off.
  // /video carries the member's attached clips (up to 50 MB each before base64, lib/upload-limits.ts).
  // The app may let go while its body is still coming (a 5 s warm call): that read throws «aborted». Unhandled, it took the whole
  // worker down and cut every member's running answer (2026-10-03 01:29 KST, «Error: aborted» → restart).
  try { for await (const c of req) { body += c; if (body.length > 40_000_000 && (!(req.url === "/video" || req.url === "/speech") || body.length > 160_000_000)) break; } }
  catch { res.destroy(); return; }
  let j;
  try { j = JSON.parse(body); } catch { res.statusCode = 400; res.end(); return; }
  if (req.url === "/video") { await videoRoute(res, j); return; }
  if (req.url === "/speech" || req.url === "/youtube") { await textRoute(req.url, res, j); return; }
  if (req.url.startsWith("/claude/")) { await claudeRoute(req, res, j, claude, "/claude/"); return; }
  if (req.url.startsWith("/chatgpt/")) { await claudeRoute(req, res, j, chatgpt, "/chatgpt/"); return; }
  if (req.url === "/tool") {
    const out = await memberTool(j).catch((e) => ({ ok: false, text: String(e.message ?? e).slice(0, 200) }));
    log("tool", j.name, out.ok ? "ok" : "no");   // never the page text or what was typed
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(out));
    return;
  }
  const out = await runRecipe(j.recipe, j.args ?? {});
  log("run", j.recipe, out.ok ? "ok" : out.why);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(out));
}).listen(PORT, () => log("worker listening", PORT));

// Member tools (worker/tools.mjs). The app has already checked who the member is and whether they said yes.
async function memberTool(j) {
  if (!claude.UUID.test(String(j.user ?? ""))) return { ok: false, text: "bad member" };
  const a = j.args && typeof j.args === "object" ? j.args : {};
  if (j.name === "browser") return browserTool(j.user, a, getBrowser);
  if (j.name === "seo_audit") return seoAudit(a);
  return { ok: false, text: `unknown tool ${j.name}` };
}

// Claude and ChatGPT subscription routes (same shape; ChatGPT signs in with a device code, so it has no «finish»).
// Never log codes or answers — only the route and the outcome.
async function claudeRoute(req, res, j, plan, at) {
  const json = (o, code = 200) => { res.statusCode = code; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  if (!claude.UUID.test(String(j.user ?? ""))) return json({ ok: false, why: "bad user" }, 400);
  try {
    const route = req.url.slice(at.length);
    if (route === "login/start") return json(await plan.loginStart(j.user));
    if (route === "login/finish" && plan.loginFinish) { const r = await plan.loginFinish(j.user, j.code); log(at, "login", r.ok ? "ok" : r.why); return json(r); }
    if (route === "status") return json(await plan.status(j.user));
    if (route === "logout") return json(await plan.logout(j.user));
    if (route === "warm") return json({ ok: true, state: plan.warm(j.user, j) });
    if (route === "interject") return json({ ok: !!plan.interject?.(j.user, String(j.turn ?? ""), j.text, j.images) });   // a message mid-answer (worker/claude.mjs)   // started ahead for this member (worker/warm.mjs)
    if (route === "chat") {
      res.setHeader("content-type", "text/plain; charset=utf-8");
      // Send the headers now: Opus can think for minutes before its first word, and the app's fetch gives up after 5 minutes
      // without headers (a photo-booth build failed at exactly 300 s as worker_unreachable, 2026-10-01).
      res.flushHeaders();
      const ac = new AbortController();
      res.on("close", () => { if (!res.writableFinished) ac.abort(); });
      const r = await plan.chat(j.user, j, (t) => res.write(t), ac.signal);
      if (!r.ok) { log(at, "chat", r.why, r.detail ?? ""); res.write(`\u0000${JSON.stringify({ ok: false, why: r.why, ...(r.resetsAt ? { resetsAt: r.resetsAt } : {}) })}`); }
      res.end();
      return;
    }
    return json({ ok: false, why: "unknown" }, 404);
  } catch (e) {
    return json({ ok: false, why: String(e.message ?? e).slice(0, 120) }, 500);
  }
}

// Videos (worker/video.mjs): two at a time — encoding fills the CPU, a third would slow all three past the app's wait.
let videos = 0;
async function videoRoute(res, j) {
  const json = (o, code = 200) => { res.statusCode = code; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  if (videos >= 2) return json({ ok: false, why: "busy" }, 429);
  videos++;
  const t0 = Date.now();
  try {
    const r = await makeVideo(await getBrowser(), j, Math.min(270_000, Math.max(20_000, Number(j.ms) || 240_000)));
    log("video", r.format, `${r.seconds}s`, `${Math.round(r.data.length / 1024)}kB`, `${Date.now() - t0}ms`);
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("x-format", r.format);
    res.setHeader("x-seconds", String(r.seconds));
    res.end(r.data);
  } catch (e) {
    log("video", "failed", String(e.message ?? e).slice(0, 200));
    json({ ok: false, why: String(e.message ?? e).slice(0, 300) }, 422);
  } finally { videos--; }
}

// Sound and YouTube into text (worker/media.mjs): one at a time — transcription fills the CPU like a video does.
let texts = 0;
async function textRoute(url, res, j) {
  const json = (o, code = 200) => { res.statusCode = code; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  if (texts >= 1 || videos >= 2) return json({ ok: false, why: "busy" }, 429);
  texts++;
  const ms = Math.min(Number(j.ms) || 240_000, 600_000);
  try {
    const r = url === "/speech"
      ? await speechToText(j.pieces ? piecesTo(piece(String(j.pieces.id ?? "")), Math.min(Number(j.pieces.n) || 0, 200)) : Buffer.from(String(j.b64 ?? ""), "base64"), typeof j.lang === "string" ? j.lang : "", ms)
      : await youtubeText(String(j.url ?? ""), ms);
    log(url.slice(1), "ok", `${r.seconds}s`, `${r.text.length} chars`);
    json({ ok: true, ...r });
  } catch (e) {
    log(url.slice(1), "failed", String(e.message ?? e).slice(0, 200));
    json({ ok: false, why: String(e.message ?? e).slice(0, 300) }, 422);
  } finally { texts--; }
}

/** One piece of a member's file over 50 MB, from the app (app/api/cron/file-piece). */
const piece = (id) => async (i) => {
  const r = await fetch(`${APP}/api/cron/file-piece?id=${encodeURIComponent(id)}&i=${i}`, { headers: { Authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
  return r?.ok ? Buffer.from(await r.arrayBuffer()) : null;
};

async function call(path, init = {}) {
  const r = await fetch(APP + path, { ...init, headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(280_000) }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  return { ok: r.ok, status: r.status, text: await r.text() };
}

let lastNightly = "";
const heartbeat = setInterval(async () => {
  const t = await call("/api/cron/tick");
  if (!t.ok || !t.text.includes('"ran":0')) log("tick", t.status, t.text.slice(0, 200));
  const kst = new Date(Date.now() + 9 * 3600e3).toISOString();
  const day = kst.slice(0, 10), hm = kst.slice(11, 16);
  if (hm >= "04:00" && hm < "04:05" && lastNightly !== day) {
    lastNightly = day;
    log("nightly", (await call("/api/cron/nightly")).text.slice(0, 300));
    for (const [id, args, name = id] of CANARIES) {
      const r = await runRecipe(id, typeof args === "function" ? args() : args);
      await call("/api/cron/health", { method: "POST", body: JSON.stringify({ recipe: name, ok: r.ok, detail: r.ok ? r.line : r.why }) });
    }
  }
}, 60_000);

// Deploy hand-over (worker/drain.mjs): stop the heartbeat (the new worker runs it), take no new work, finish what is running.
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { clearInterval(heartbeat); server.close(); drain.start(); });
