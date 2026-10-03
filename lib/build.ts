import { Sandbox } from "@vercel/sandbox";
import { tr } from "@/lib/i18n-server";
import { autoModel, complete, providerOf, userKeys } from "./ai";
import { asMember, asOwner, one, q } from "./db";
import { esc, sendMail } from "./mail";
import { lock, unlock } from "./privacy";
import { pushUser } from "./push";
import { appUrl } from "./app-url";
import { HAPPY_DOM, RUN_CHECK, hardErrors } from "./build-run";

// «Build me an app» (owner «yes» 2026-09-30 21:11: on for every member; tell the owner when a Korean day passes ₩100,000).
// The chat answer ends with <<<build {"title":…,"spec":…}>>>; the member's own AI connection writes the files (so the AI is paid
// the way their chats are), a throwaway Vercel Sandbox checks and builds them (member code never runs on our servers), and
// the result goes online as its own Vercel project with a 24-hour «make it yours» link (Vercel claim).
// Test of the path, 2026-09-30 21:04: Seoul sandbox up in 1–9 s, app written in 20 s, online in 78 s, sandbox ≈ $0.002.

const TEAM = () => process.env.UNCHORE_BUILD_VERCEL_TEAM ?? "";
const TOKEN = () => process.env.UNCHORE_BUILD_VERCEL_TOKEN ?? "";
const SANDBOX_PROJECT = () => process.env.UNCHORE_BUILD_SANDBOX_PROJECT ?? "";
const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
/** Our Vercel Sandbox account (the same one app builds and members' own computers use). */
export const sandboxCred = () => ({ token: TOKEN(), teamId: TEAM(), projectId: SANDBOX_PROJECT() });
/** Off with UNCHORE_BUILD=off, or when the Vercel settings are missing. */
export const buildOn = () => process.env.UNCHORE_BUILD !== "off" && Boolean(TEAM() && TOKEN() && SANDBOX_PROJECT());
/** Builds one member may start in 24 h — stops a loop or abuse, not normal use. */
export const buildDayMax = () => num(process.env.UNCHORE_BUILD_DAY_MAX, 20);
/** The owner hears about it once a Korean day when house spend passes this (KRW). */
export const alertKrw = () => num(process.env.UNCHORE_SPEND_ALERT_KRW, 100_000);
export const krwPerUsd = () => num(process.env.UNCHORE_KRW_PER_USD, 1400);
/** Upper estimate of what a sandbox minute costs us: 2 vCPU fully busy + 4 GB, Vercel Pro rates with a regional margin. */
const SANDBOX_USD_PER_HOUR = 0.5;
const ROUNDS = 3;
/** A Claude-plan build may write for up to 10 minutes (a camera app with filters took longer than the 280 s chat limit, 2026-10-01). */
const BUILD_WRITE_MS = 600_000;
const MAX_FILES = 60, MAX_BYTES = 8_000_000;

export type BuildAsk = { title: string; spec: string };

export const BUILD_GUIDE = [
  "## Building an app (Unchore builds it and puts it online)",
  "When the user asks you to make something that runs in a web browser — an app, tool, calculator, tracker, checklist, quiz, game, timer, landing page, one-page site —",
  "Unchore can build it for real and give them a link. Do it when they asked for it or said yes to your offer: end your answer with ONE line",
  '<<<build {"title":"<short name in the user\'s language>","spec":"<everything the builder needs: purpose, who uses it, screens, buttons, what is saved, texts, language of the app, look>"}>>>',
  "and say in one sentence that it is being built and the link will appear in this chat in a few minutes. Don't write the code in the answer.",
  "What can be built: a static web app (HTML, CSS, JavaScript; data kept in the browser; it may call free public data services). No server, no accounts, no payments.",
  "Never for phishing, fake login pages, collecting passwords or card numbers, pretending to be a company or person, scams, gambling or adult content — refuse those instead.",
  "Own web address: when the user wants an app Unchore already built for them on their own domain (\"put it on myshop.com\"), end your answer with ONE line",
  '<<<domain {"app":"<the app\'s link or name>","domain":"<their domain or sub-domain>"}>>>',
  "and say Unchore will add it and show the DNS lines to set at their domain company.",
  "Stop: when the user asks to stop or cancel an app that is still being built in this chat (by voice too — «stop», «cancel it», «never mind the app»), end your answer with ONE line",
  "<<<stopbuild>>>",
  "and say in one sentence that it is stopped. To build it again differently, put <<<stopbuild>>> and then the new <<<build {…}>>> line.",
].join("\n");

const DOMAIN_RE = /<<<domain\s*(\{[^\n]*\})\s*>>>/g;
export type DomainAsk = { app: string; domain: string };
/** «Put my app on my own address» asks (at most one), with the marks taken out. */
export function readDomainMarks(text: string): { text: string; asks: DomainAsk[] } {
  const asks: DomainAsk[] = [];
  const out = text.replace(DOMAIN_RE, (_a, j: string) => {
    try {
      const v = JSON.parse(j) as { app?: unknown; domain?: unknown };
      const domain = cleanDomain(String(v.domain ?? ""));
      if (domain && !asks.length) asks.push({ app: String(v.app ?? "").trim().slice(0, 200), domain });
    } catch { /* a broken mark does nothing */ }
    return "";
  }).replace(/<<<domain\b[^\n]*/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: out, asks };
}

/** A domain someone owns — never ours, Vercel's, or a local name. */
export function cleanDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (d.length > 253 || !/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(d) || !/\.[a-z]{2,}$/.test(d)) return null;
  if (/(^|\.)(unchore\.ai|vercel\.app|vercel\.com|localhost|local|internal)$/.test(d)) return null;
  return d;
}

/** The DNS line to set: an apex name (example.com, example.co.kr) points by A record, a sub-domain by CNAME. */
export function dnsFor(domain: string): { type: "A" | "CNAME"; name: string; value: string } {
  const parts = domain.split(".");
  const apexLen = /\.(co|com|or|ne|go|ac|re|pe|org|net|gov|edu)\.[a-z]{2}$/.test(domain) ? 3 : 2;
  return parts.length <= apexLen ? { type: "A", name: "@", value: "76.76.21.21" } : { type: "CNAME", name: parts.slice(0, parts.length - apexLen).join("."), value: "cname.vercel-dns.com" };
}

/** Add the member's domain to one of their built apps (Vercel project) and say what to set. Never throws. */
export async function connectDomain(userId: string, ask: DomainAsk, lang: string): Promise<string> {
  const apps = (await q<{ title: string; url: string | null; vercel_project: string | null }>(
    "select title, url, vercel_project from builds where user_id = $1 and status = 'done' and vercel_project is not null order by created_at desc limit 50", [userId]))
    .map((b) => ({ ...b, title: unlock(b.title) }));
  const want = ask.app.toLowerCase();
  const host = (u: string | null) => { try { return u ? new URL(u).host : ""; } catch { return ""; } };
  const app = apps.find((a) => want && host(a.url) && want.includes(host(a.url))) ?? apps.find((a) => want && (a.title.toLowerCase() === want || want.includes(a.title.toLowerCase()) || a.title.toLowerCase().includes(want)))
    ?? (apps.length === 1 ? apps[0] : undefined);
  if (!app) return `⚠ ${tr(lang, "I couldn't tell which of your apps to put on {domain}. Say the app's link or name.", { domain: ask.domain })}`;
  try {
    const r = await vercel<{ verified?: boolean; verification?: { type: string; domain: string; value: string }[] }>(`/v10/projects/${app.vercel_project}/domains`, { name: ask.domain });
    const dns = dnsFor(ask.domain);
    const lines = [tr(lang, "🌐 Added {domain} to «{title}». At the company where you bought the domain, add this DNS line:", { domain: ask.domain, title: app.title }),
      `${dns.type} · ${dns.name} · ${dns.value}`,
      ...(r.verified === false && r.verification?.length ? [tr(lang, "Also add this line to prove the domain is yours:"), ...r.verification.map((v) => `${v.type} · ${v.domain} · ${v.value}`)] : []),
      tr(lang, "It usually works within an hour (sometimes up to a day). The secure lock (HTTPS) is set up by itself.")];
    return lines.join("\n");
  } catch (e) {
    const m = (e as Error).message;
    if (/vercel (403|404)/.test(m)) return `⚠ ${tr(lang, "«{title}» is in your own Vercel account now, so add the domain there: the project → Settings → Domains.", { title: app.title })}`;
    if (/vercel 409/.test(m)) return `⚠ ${tr(lang, "{domain} is already used by another project. Remove it there first, then ask again.", { domain: ask.domain })}`;
    return `⚠ ${tr(lang, "Couldn't add {domain} just now. Try again in a moment.", { domain: ask.domain })}`;
  }
}

const BUILD_RE = /<<<build\s*(\{[^\n]*\})\s*>>>/g;
/** The build asks at the end of an answer (at most one), with the marks taken out. */
export function readBuildMarks(text: string): { text: string; asks: BuildAsk[] } {
  const asks: BuildAsk[] = [];
  const out = text.replace(BUILD_RE, (_a, j: string) => {
    try {
      const v = JSON.parse(j) as { title?: unknown; spec?: unknown };
      const title = String(v.title ?? "").trim().slice(0, 80), spec = String(v.spec ?? "").trim().slice(0, 6000);
      if (title && spec.length >= 10 && !asks.length) asks.push({ title, spec });
    } catch { /* a broken mark builds nothing */ }
    return "";
  }).replace(/<<<build\b[^\n]*/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: out, asks };
}

/** «Stop building»: whether the answer asks it, with the mark taken out. */
export function readStopBuildMark(text: string): { text: string; stop: boolean } {
  const stop = text.includes("<<<stopbuild>>>");
  return { text: stop ? text.replaceAll("<<<stopbuild>>>", "").replace(/\n{3,}/g, "\n\n").trim() : text, stop };
}

/** Stop this chat's builds that haven't finished (inside the member's request). A running one quits at its next step (runBuild). */
export async function stopBuilds(userId: string, convId: string): Promise<string[]> {
  const r = await q<{ title: string }>("update builds set status = 'stopped', finished_at = now() where user_id = $1 and conversation_id = $2 and status in ('queued', 'running') returning title", [userId, convId]);
  return r.map((x) => unlock(x.title));
}

/** Queue one build for this member (inside their request). Returns the id, or why not. */
export async function queueBuild(userId: string, convId: string, ask: BuildAsk): Promise<{ id: string } | { why: "off" | "limit" }> {
  if (!buildOn()) return { why: "off" };
  const n = await one<{ n: number }>("select count(*)::int as n from builds where user_id = $1 and created_at > now() - interval '1 day'", [userId]);
  if ((n?.n ?? 0) >= buildDayMax()) return { why: "limit" };
  const r = await one<{ id: string }>("insert into builds(user_id, conversation_id, title, spec) values ($1, $2, $3, $4) returning id", [userId, convId, lock(ask.title), lock(ask.spec)]);
  return { id: r!.id };
}

type File = { path: string; content: string };
const FILE_RE = /^=== FILE: ([^\n]+)\n([\s\S]*?)\n=== END$/gm;
export function readFilesBlock(s: string): File[] {
  const files: File[] = [];
  for (const m of s.matchAll(FILE_RE)) {
    const path = m[1]!.trim().replace(/^\.?\/+/, "");
    if (!/^[\w.-]+(\/[\w.-]+)*$/.test(path) || path.includes("..") || files.some((f) => f.path === path)) continue;
    files.push({ path, content: m[2]! });
  }
  return files.slice(0, MAX_FILES);
}

const WRITER = [
  "You are Unchore's app builder. Build the web app described by the user, complete and working, ready to put online as it is.",
  "Rules: a static site — index.html at the top, plus .css/.js files as needed (or everything in index.html). Plain HTML/CSS/JavaScript,",
  "no build step, no npm, no frameworks from a CDN unless essential. Works on phones first: fits a 360-px-wide screen with no sideways scrolling — fields side by side get min-width:0 (or wrap). The app's words are in the language the spec asks for",
  "(else the spec's language). Data is kept in the browser (localStorage). Free public data services without a key are allowed. No secrets or keys.",
  "Clean, friendly look; buttons big enough for a thumb. No placeholder text like «lorem ipsum» or «TODO».",
  "Look: unless the spec names a style, pick ONE of these and keep to it — «calm» (off-white #f7f6f2 background, near-black text, one accent colour, system font, generous spacing),",
  "«bold» (one strong brand colour, large headings, rounded cards), «dark» (#111 background, soft white text, one bright accent). Avoid the generic AI look: no purple-to-blue gradients,",
  "no glowing shadows, no emoji in every heading, no «Welcome to …» hero. The main job is visible and usable on the first screen with no scrolling or sign-up.",
  "Small touches that make it feel finished: a clear empty state, a short sound or vibration on the main action only if the app is a game or timer (with a mute switch), and a title and favicon (inline SVG).",
  "If the request is phishing, a fake login, collects passwords or card numbers, pretends to be a company or person, a scam, gambling or adult content,",
  "reply with exactly REFUSE and nothing else.",
  "Output format — every file, in full, and nothing else:",
  "=== FILE: index.html",
  "(file content)",
  "=== END",
].join("\n");

/** The house spend today in Korea (sandboxes + AI on Unchore's account + the nightly «how to answer me», lib/answer-style.ts), in KRW. */
export async function spendTodayKrw(): Promise<number> {
  const r = await asOwner(() => one<{ b: string; c: string; s: string }>(
    `select (select coalesce(sum(cost_micro), 0) from builds where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) as b,
            (select coalesce(sum(cost_micro), 0) from credit_ledger where kind = 'use' and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) as c,
            (select coalesce(sum(cost_micro), 0) from style_review_runs where (ran_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) as s`));
  return Math.round(((Number(r?.b ?? 0) + Number(r?.c ?? 0) + Number(r?.s ?? 0)) / 1_000_000) * krwPerUsd());
}

/** Once a Korean day: mail the owner when house spend passed the line. Never throws. */
export async function spendAlert(): Promise<boolean> {
  try {
    const krw = await spendTodayKrw();
    if (krw <= alertKrw()) return false;
    const got = await asOwner(() => q("insert into spend_alerts(day, krw) values ((now() at time zone 'Asia/Seoul')::date, $1) on conflict do nothing returning day", [krw]));
    if (!got.length) return false;
    const owners = (process.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const to of owners) {
      const lang = (await asOwner(() => one<{ lang: string }>("select lang from users where lower(email) = lower($1)", [to])).catch(() => null))?.lang ?? "ko";
      const won = (n: number) => n.toLocaleString("ko-KR");
      const line = tr(lang, "Today (Korean time) Unchore spent {krw} won on its own account — past your alert line of {limit} won. It adds up app-building sandboxes and AI run on Unchore credit (an estimate, $1 = {rate} won).", { krw: won(krw), limit: won(alertKrw()), rate: String(krwPerUsd()) });
      await sendMail(to, `Unchore · ${tr(lang, "Spent today: {krw} won (over your line)", { krw: won(krw) })}`, `<p>${esc(line)}</p>`, line);
    }
    return true;
  } catch (e) { console.warn(`spend alert failed: ${(e as Error).message}`); return false; }
}

type Job = { id: string; user_id: string; conversation_id: string | null; title: string; spec: string };

/** Take the oldest queued build (skip-locked, so two runners never share one) and run it. */
export async function runNextBuild(): Promise<string | null> {
  const [j] = await q<Job>(`update builds set status = 'running', started_at = now()
    where id = (select id from builds where status = 'queued' order by created_at limit 1 for update skip locked)
    returning id, user_id, conversation_id, title, spec`);
  if (!j) return null;
  await asMember(j.user_id, () => runBuild({ ...j, title: unlock(j.title), spec: unlock(j.spec) }));
  return j.id;
}

/** Start the build runner (its own function, up to 13 minutes). Waits only for the request to be handed over. */
export async function kickBuilds(req?: Request): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 3000);
  await fetch(`${appUrl(req)}/api/build/run`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: c.signal }).catch(() => {});
  clearTimeout(t);
}

/** Minute timer: close builds that never finished, start any still waiting, and the owner's spend alert. */
export async function buildTick(): Promise<{ stuck: number; waiting: number; alerted: boolean }> {
  const stuck = await closeStuckBuilds().catch(() => 0);
  const w = await one<{ n: number }>("select count(*)::int as n from builds where status = 'queued' and created_at < now() - interval '1 minute'").catch(() => null);
  if (w?.n) await kickBuilds();
  return { stuck, waiting: w?.n ?? 0, alerted: await spendAlert() };
}

/** Builds that never finished (the function was cut): close them so the member hears back. */
export async function closeStuckBuilds(): Promise<number> {
  const stuck = await q<{ id: string; user_id: string; conversation_id: string | null; title: string }>(
    `update builds set status = 'failed', error = 'timed out', finished_at = now()
     where status = 'running' and started_at < now() - interval '20 minutes' returning id, user_id, conversation_id, title`);
  for (const s of stuck) await asMember(s.user_id, () => reply(s.user_id, s.conversation_id, "fail", unlock(s.title))).catch(() => {});
  return stuck.length;
}

export function region(tz: string): "icn1" | "hnd1" | "sin1" | "fra1" | "iad1" | "sfo1" {
  if (/^Asia\/(Seoul|Pyongyang)/.test(tz)) return "icn1";
  if (/^Asia\/(Tokyo)/.test(tz)) return "hnd1";
  if (/^(Asia|Australia|Pacific)\//.test(tz)) return "sin1";
  if (/^(Europe|Africa)\//.test(tz)) return "fra1";
  if (/^America\/(Los_Angeles|Vancouver|Tijuana)/.test(tz)) return "sfo1";
  return "iad1";
}

/** Plain-ASCII Vercel project name: uc-<words>-<6 of the id>. */
export function projectName(title: string, id: string): string {
  const w = title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return `uc-${w || "app"}-${id.replace(/-/g, "").slice(0, 6)}`;
}

const CHECK = `
const fs=require("fs"),path=require("path"),cp=require("child_process");const root="/vercel/sandbox/app";const errs=[];const all=[];
(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(fs.statSync(p).isDirectory())walk(p);else all.push(p);}})(root);
if(!fs.existsSync(root+"/index.html"))errs.push("index.html is missing");
for(const f of all){const rel=path.relative(root,f);
 if(/\\.m?js$/.test(f)){try{cp.execFileSync(process.execPath,["--check",f],{stdio:"pipe"});}catch(e){errs.push(rel+": "+String(e.stderr).split("\\n").slice(0,6).join(" "));}}
 if(/\\.html$/.test(f)){const h=fs.readFileSync(f,"utf8");
  for(const m of h.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)){const u=m[1];if(/^(https?:|data:|mailto:|tel:|\\/\\/|javascript:|blob:)/.test(u))continue;
   const abs=u.startsWith("/")?path.join(root,u):path.join(path.dirname(f),u);if(!fs.existsSync(abs))errs.push(rel+" points to a missing file: "+u);}
  for(const m of h.matchAll(/<script(?![^>]*\\bsrc=)([^>]*)>([\\s\\S]*?)<\\/script>/g)){if(/type=["'](module|application\\/ld\\+json|text\\/template|importmap)/.test(m[1]))continue;
   try{new Function(m[2]);}catch(e){errs.push(rel+" inline script: "+e.message);}}}}
console.log(JSON.stringify({errs,files:all.map(f=>path.relative(root,f))}));`;

class Stopped extends Error {}

async function runBuild(j: Job): Promise<void> {
  const t0 = Date.now();
  const u = await one<{ tz: string }>("select tz from users where id = $1", [j.user_id]);
  const tz = u?.tz ?? "UTC";
  const done = (patch: Record<string, unknown>) => q(`update builds set ${Object.keys(patch).map((k, i) => `${k} = $${i + 2}`).join(", ")}, finished_at = now() where id = $1`, [j.id, ...Object.values(patch)]);
  const keys = await userKeys(j.user_id);
  const model = autoModel(keys, j.spec, true);
  if (!model) { await done({ status: "failed", error: "no AI connection" }); await reply(j.user_id, j.conversation_id, "nokey", j.title); return; }
  let sb: Sandbox | null = null, sandboxMs = 0, rounds = 0, sbAt = 0, browserReady = false, browserTried = false;
  // The member said «stop» (stopBuilds): quit at the next step, before more AI rounds or the deploy.
  const halt = async () => { if ((await one<{ status: string }>("select status from builds where id = $1", [j.id]))?.status === "stopped") throw new Stopped(); };
  // Which step it is on, for the «working» line above the member's chat input (lib/build-live.ts) — never holds the build up.
  const step = (s: string) => q("update builds set step = $2 where id = $1", [j.id, s]).catch(() => {});
  try {
    let files: File[] = [];
    let problems = "";
    for (; rounds < ROUNDS; rounds++) {
      const ask = rounds === 0 ? `App name: ${j.title}\n\nSpec:\n${j.spec}`
        : `App name: ${j.title}\n\nSpec:\n${j.spec}\n\nYour last version had these problems — fix them and send every file again in full:\n${problems}\n\nLast version:\n${files.map((f) => `=== FILE: ${f.path}\n${f.content}\n=== END`).join("\n")}`;
      await step(`write:${rounds + 1}`);
      const write = () => complete({ model, key: keys[providerOf(model)]!, system: WRITER, messages: [{ role: "user", content: ask }], maxTokens: 32_000, timeoutMs: BUILD_WRITE_MS });
      // The worker being replaced by a new version cuts the stream («terminated»): ask once more instead of failing the member's build.
      const out = await write().catch((e: Error) => { if (!cutOff(e)) throw e; console.warn(`build ${j.id}: writer cut off (${e.message}), asking again`); return write(); });
      await halt();
      if (/^\s*REFUSE\s*$/.test(out)) { await done({ status: "refused", model, rounds: rounds + 1 }); await reply(j.user_id, j.conversation_id, "refused", j.title, { model }); return; }
      const got = readFilesBlock(out);
      if (!got.length) { problems = "No files came back in the «=== FILE: … / === END» format."; continue; }
      files = got;
      if (files.reduce((s, f) => s + Buffer.byteLength(f.content), 0) > MAX_BYTES) throw new Error("too big");
      await step("check");
      if (!sb) sbAt = Date.now();
      if (!sb) sb = await Sandbox.create({ token: TOKEN(), teamId: TEAM(), projectId: SANDBOX_PROJECT(), region: region(tz), resources: { vcpus: 2 }, timeout: 10 * 60_000, tags: { kind: "unchore-build" } });
      await sb.runCommand({ cmd: "bash", args: ["-c", "rm -rf /vercel/sandbox/app && mkdir -p /vercel/sandbox/app"] });
      await sb.writeFiles([...files.map((f) => ({ path: `/vercel/sandbox/app/${f.path}`, content: f.content })), { path: "/vercel/sandbox/check.js", content: CHECK }, { path: "/vercel/sandbox/run.mjs", content: RUN_CHECK }]);
      const r = await sb.runCommand({ cmd: "node", args: ["/vercel/sandbox/check.js"] });
      const res = JSON.parse(((await r.stdout()).trim().split("\n").pop()) || "{}") as { errs?: string[] };
      problems = (res.errs ?? []).slice(0, 20).join("\n");
      if (problems) continue;
      // Then open it in a test browser and press each button once (lib/build-run.ts). On the last round a complaint only
      // the test browser has doesn't hold the app back; if the test browser can't start, the check above stands alone.
      await step("browser");
      if (!browserReady && !browserTried) {
        browserTried = true;
        browserReady = await sb.runCommand({ cmd: "bash", args: ["-c", `cd /vercel/sandbox && npm i --no-save --no-audit --no-fund --silent ${HAPPY_DOM} >/dev/null 2>&1 && echo ok`] }).then(async (x) => (await x.stdout()).includes("ok")).catch(() => false);
      }
      const live = browserReady ? await sb.runCommand({ cmd: "node", args: ["/vercel/sandbox/run.mjs", "/vercel/sandbox/app"] })
        .then(async (x) => JSON.parse(((await x.stdout()).trim().split("\n").pop()) || "{}") as { errs?: string[] }).catch(() => null) : null;
      const hard = hardErrors(live?.errs);
      if (hard.length && rounds < ROUNDS - 1) { problems = `Opened in a test browser and each button pressed once, the app showed these script errors:\n${hard.slice(0, 15).join("\n")}`; continue; }
      problems = "";
      break;
    }
    if (sb) { await sb.stop().catch(() => {}); sandboxMs = Date.now() - sbAt; sb = null; }
    if (!files.length || problems) throw new Error(`not working after ${ROUNDS} tries: ${problems.slice(0, 300)}`);
    await halt();
    await step("deploy");
    const name = projectName(j.title, j.id);
    const dep = await vercel<{ id: string; projectId: string }>("/v13/deployments?skipAutoDetectionConfirmation=1", {
      name, target: "production", projectSettings: { framework: null },
      files: files.map((f) => ({ file: f.path, data: Buffer.from(f.content).toString("base64"), encoding: "base64" })),
    });
    let url = "";
    for (let i = 0; i < 40 && !url; i++) {
      const d = await vercel<{ readyState: string }>(`/v13/deployments/${dep.id}`);
      if (d.readyState === "ERROR" || d.readyState === "CANCELED") throw new Error(`deploy ${d.readyState}`);
      if (d.readyState === "READY") {
        // A member's app is public: Vercel's login wall (on by default for new projects) off, then the plain <name>.vercel.app address.
        await vercel(`/v9/projects/${dep.projectId}`, { ssoProtection: null }, "PATCH").catch(() => null);
        const p = await vercel<{ targets?: { production?: { alias?: string[] } } }>(`/v9/projects/${dep.projectId}`);
        const al = p.targets?.production?.alias ?? [];
        url = `https://${al.find((a) => a === `${name}.vercel.app`) ?? al[0] ?? `${name}.vercel.app`}`;
        break;
      }
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    if (!url) throw new Error("deploy not ready");
    // Open it like a visitor would before saying «ready»: two answers in a row that aren't the app = broken (owner rule for
    // auto-rollback 2026-09-30: only a sure failure). Each build is its own new project, so there is no earlier version to go back to.
    await step("open");
    if (await brokenAfterDeploy(url, files.find((f) => f.path === "index.html")?.content ?? "")) {
      await done({ status: "failed", model, url, vercel_project: dep.projectId, rounds: rounds + 1, sandbox_ms: sandboxMs, cost_micro: cost(sandboxMs), error: "did not open after deploy" });
      await reply(j.user_id, j.conversation_id, "unopened", j.title, { url, model });
      return;
    }
    const claim = await vercel<{ code?: string }>(`/projects/${dep.projectId}/transfer-request`, {}).then((c) => c.code ? `https://vercel.com/claim-deployment?code=${c.code}` : "").catch(() => "");
    await done({ status: "done", model, url, vercel_project: dep.projectId, rounds: rounds + 1, sandbox_ms: sandboxMs, cost_micro: cost(sandboxMs) });
    await reply(j.user_id, j.conversation_id, "done", j.title, { url, claim, sec: Math.round((Date.now() - t0) / 1000), model });
  } catch (e) {
    if (sb) { await sb.stop().catch(() => {}); sandboxMs = Date.now() - sbAt; }
    if (e instanceof Stopped) { await q("update builds set model = $2, rounds = $3, sandbox_ms = $4, cost_micro = $5 where id = $1", [j.id, model, rounds, sandboxMs, cost(sandboxMs)]); return; }
    console.warn(`build ${j.id} failed: ${(e as Error).message}`);
    await done({ status: "failed", model, rounds, sandbox_ms: sandboxMs, cost_micro: cost(sandboxMs), error: (e as Error).message.slice(0, 500) });
    await reply(j.user_id, j.conversation_id, "fail", j.title);
  }
}

/** A connection cut mid-answer (worker redeploy, network), not a real refusal or error from the AI. */
export const cutOff = (e: Error) => /^(terminated|fetch failed|other side closed)$|worker_unreachable/i.test(e.message);

/** The live page is the app: a 200 that carries the app's own <title> (or, without one, isn't empty). */
export function pageOpens(status: number, body: string, indexHtml: string): boolean {
  if (status !== 200) return false;
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(indexHtml)?.[1]?.trim();
  return title ? body.includes(title) : body.trim().length > 0;
}

/** Two looks a short while apart, both answered and both not the app. No answer at all (our network) is never «broken». */
export async function brokenAfterDeploy(url: string, indexHtml: string, gapMs = Number(process.env.UNCHORE_BUILD_OPEN_GAP_MS ?? 20_000)): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, gapMs));
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) }).then(async (x) => ({ s: x.status, b: await x.text() })).catch(() => null);
    if (!r || pageOpens(r.s, r.b, indexHtml)) return false;
  }
  return true;
}

const cost = (ms: number) => Math.round((ms / 3_600_000) * SANDBOX_USD_PER_HOUR * 1_000_000);

async function vercel<T>(path: string, body?: unknown, method?: "PATCH"): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`https://api.vercel.com${path}${sep}teamId=${TEAM()}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { Authorization: `Bearer ${TOKEN()}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) throw new Error(`vercel ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

/** Tell the member in the chat (and on their phone) how it went. */
async function reply(userId: string, convId: string | null, kind: "done" | "fail" | "refused" | "nokey" | "unopened", title: string, v: { url?: string; claim?: string; sec?: number; model?: string } = {}): Promise<void> {
  const u = await one<{ lang: string }>("select lang from users where id = $1", [userId]);
  const lang = u?.lang ?? "en";
  const text = kind === "done"
    ? [tr(lang, "✅ «{title}» is ready: {url}", { title, url: v.url! }), tr(lang, "Built and put online in {sec} seconds. Open it on your phone and add it to the home screen to use it like an app.", { sec: String(v.sec ?? 0) }),
      ...(v.claim ? [tr(lang, "To make it yours (your own Vercel account, free), open this within 24 hours: {claim}", { claim: v.claim })] : []),
      tr(lang, "Tell me what to change and I'll build a new version.")].join("\n\n")
    : kind === "refused" ? tr(lang, "I can't build «{title}» — it looks like something that could be used to deceive people.", { title })
    : kind === "unopened" ? tr(lang, "«{title}» went online, but it didn't open when I checked it twice: {url}\n\nTry the link again in a few minutes. If it still doesn't open, ask me to build it again.", { title, url: v.url! })
    : kind === "nokey" ? tr(lang, "I couldn't build «{title}»: connect an AI first — type «connect Claude» here, or paste an AI key — then ask again.", { title })
    : tr(lang, "I couldn't finish «{title}» this time. Ask again, maybe with a simpler description, and I'll try once more.", { title });
  if (convId) {
    await q("insert into messages(conversation_id, role, content, model, asks) values ($1, 'assistant', $2, $3, $4)", [convId, lock(text), v.model ?? null, kind === "fail" || kind === "nokey" || kind === "unopened"]);   // a build that didn't finish waits for the member (🟠) — never tidied into «Done» (lib/auto-done.ts)
    await q("update conversations set updated_at = now(), done = false where id = $1", [convId]);
  }
  await pushUser(userId, { title: kind === "done" ? tr(lang, "Your app is ready") : "Unchore", body: text.split("\n")[0]!.slice(0, 150), url: convId ? `/app?c=${convId}` : "/app", tag: "build" }).catch(() => 0);
}
