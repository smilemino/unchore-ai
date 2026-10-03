// Member tools that need the worker (ported from AI Soul's /workspace/tools, 2026-09-30 owner: «everything Soul has, Unchore has»).
//  · browser    — Soul «server-browser»: one real browser per member, sign-ins kept (encrypted on /data), read → act by number.
//                 Never runs code the AI wrote (Soul's «do» takes Python; here only fixed actions).
//                 Irreversible buttons (pay, order, send, submit, delete…) need the member's «yes» — the app decides that, not the AI.
//  · seo_audit  — Soul «seo-audit»: reads a sitemap slowly and lists search-listing problems per page (the app turns rows into Excel).
// Every result is data for the AI, never instructions (the app fences it).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.TOOL_DATA_ROOT || "/data/tools";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IDLE_MS = 10 * 60_000;
const MAX_OPEN = Number(process.env.TOOL_BROWSERS_MAX ?? 6);
const TEXT_MAX = 6000;

// Words on a button/link that make a click hard to undo. Checked on the element's own label, in the languages we serve most.
export const RISKY = /(pay|payment|checkout|check out|buy|purchase|place (your )?order|order now|subscribe|submit|send|post|publish|delete|remove|cancel (my )?(subscription|order|account)|unsubscribe|transfer|withdraw|sign (the )?contract|agree and|book now|reserve|결제|구매|주문|구독|제출|보내기|전송|발송|등록|게시|올리기|삭제|지우기|탈퇴|해지|취소하기|송금|이체|출금|계약|동의하고|예약하기|購入|注文|支払|送信|削除|予約|购买|下单|支付|提交|发送|删除|预订|comprar|pagar|enviar|eliminar|acheter|payer|envoyer|supprimer|kaufen|bezahlen|senden|löschen)/i;

function boxKey() {
  const s = process.env.CRON_SECRET ?? "";
  if (!s) throw new Error("no secret");
  return createHash("sha256").update(`unchore-browser-state:${s}`).digest();
}
function seal(buf) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", boxKey(), iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}
function unseal(buf) {
  const d = createDecipheriv("aes-256-gcm", boxKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}
const stateFile = (uid) => path.join(ROOT, "browser", `${uid}.bin`);

function loadState(uid) {
  try { return JSON.parse(unseal(readFileSync(stateFile(uid))).toString("utf8")); } catch { return undefined; }
}
function saveState(uid, st) {
  mkdirSync(path.dirname(stateFile(uid)), { recursive: true, mode: 0o700 });
  writeFileSync(stateFile(uid), seal(Buffer.from(JSON.stringify(st))), { mode: 0o600 });
}

const open = new Map();   // uid -> { ctx, page, timer }

async function session(uid, getBrowser) {
  let s = open.get(uid);
  if (s && !s.page.isClosed()) { clearTimeout(s.timer); s.timer = setTimeout(() => closeSession(uid), IDLE_MS); return s; }
  if (open.size >= MAX_OPEN) {
    const oldest = [...open.keys()][0];
    await closeSession(oldest);
  }
  const ctx = await (await getBrowser()).newContext({ storageState: loadState(uid), viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
  // Links and redirects can't reach the worker's own network either.
  await ctx.route("**/*", (r) => (/^(https?|data|blob):/.test(r.request().url()) && (!/^https?:/.test(r.request().url()) || safeUrl(r.request().url())) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  s = { ctx, page, timer: setTimeout(() => closeSession(uid), IDLE_MS) };
  open.set(uid, s);
  return s;
}

async function closeSession(uid) {
  const s = open.get(uid);
  if (!s) return;
  open.delete(uid);
  clearTimeout(s.timer);
  try { saveState(uid, await s.ctx.storageState()); } catch { /* browser gone */ }
  await s.ctx.close().catch(() => {});
}

/** Title, address, visible text and a numbered list of things you can press or fill (numbers are what click/type use). */
async function snapshot(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
  const r = await page.evaluate((max) => {
    document.querySelectorAll("[data-uc-ref]").forEach((e) => e.removeAttribute("data-uc-ref"));
    const seen = [];
    const els = document.querySelectorAll("a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=checkbox], [role=tab], [role=menuitem], [contenteditable=true]");
    let n = 0;
    for (const e of els) {
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const st = getComputedStyle(e);
      if (st.visibility === "hidden" || st.display === "none") continue;
      if (++n > 150) break;
      e.setAttribute("data-uc-ref", String(n));
      const tag = e.tagName.toLowerCase();
      const type = e.getAttribute("type") || "";
      const label = (e.getAttribute("aria-label") || e.innerText || e.getAttribute("placeholder") || e.getAttribute("title") || e.getAttribute("name") || e.getAttribute("value") || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const kind = tag === "a" ? "link" : tag === "select" ? "select" : tag === "textarea" || (tag === "input" && !/^(button|submit|checkbox|radio|reset|image)$/.test(type)) ? `field${type ? ":" + type : ""}` : type === "checkbox" ? "checkbox" : "button";
      seen.push(`[${n}] ${kind} ${label}`);
    }
    const text = (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, max);
    return { title: document.title, text, refs: seen };
  }, TEXT_MAX);
  return `Page: ${r.title}\nAddress: ${page.url()}\n\n--- visible text ---\n${r.text}\n\n--- things you can press or fill (use the number) ---\n${r.refs.join("\n") || "(none)"}`;
}

async function labelOf(page, ref) {
  return page.locator(`[data-uc-ref="${ref}"]`).first().evaluate((e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("value") || e.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 80)).catch(() => null);
}

// Local pages only for tests on a developer machine — the worker image sets NODE_ENV=production, which turns this off.
const LOCAL_OK = process.env.UC_TOOLS_ALLOW_LOCAL === "1" && process.env.NODE_ENV !== "production";
function safeUrl(u) {
  let x;
  try { x = new URL(String(u)); } catch { return null; }
  if (!/^https?:$/.test(x.protocol)) return null;
  if (LOCAL_OK && /^(127\.0\.0\.1|localhost)$/.test(x.hostname)) return x.toString();
  // No reaching into the worker's own network (cloud metadata, private ranges, localhost).
  if (/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|metadata\.google)/i.test(x.hostname) || x.hostname.endsWith(".internal") || x.hostname.endsWith(".railway.internal")) return null;
  return x.toString();
}

export async function browserTool(uid, a, getBrowser) {
  if (!UUID.test(uid)) return { ok: false, text: "bad member" };
  const act = String(a.action ?? "");
  if (act === "close") { await closeSession(uid); return { ok: true, text: "Browser closed. Sign-ins are kept for next time." }; }
  if (act === "forget") { await closeSession(uid); rmSync(stateFile(uid), { force: true }); return { ok: true, text: "Browser closed and all saved sign-ins for this member deleted." }; }
  const s = await session(uid, getBrowser);
  const { page } = s;
  try {
    if (act === "open") {
      const url = safeUrl(a.url);
      if (!url) return { ok: false, text: "Only public http(s) addresses can be opened." };
      await page.goto(url, { timeout: 45_000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      return { ok: true, text: await snapshot(page) };
    }
    if (act === "read") return { ok: true, text: await snapshot(page) };
    if (act === "back") { await page.goBack({ timeout: 20_000 }).catch(() => {}); await page.waitForTimeout(1500); return { ok: true, text: await snapshot(page) }; }
    if (act === "scroll") { await page.mouse.wheel(0, a.up ? -800 : 800); await page.waitForTimeout(800); return { ok: true, text: await snapshot(page) }; }
    if (act === "screenshot") {
      const png = await page.screenshot({ type: "png", fullPage: false });
      return { ok: true, text: `Screenshot of ${page.url()} saved to the chat.`, file: { name: "screenshot.png", mime: "image/png", b64: png.toString("base64") } };
    }
    if (act === "click" || act === "type" || act === "select" || act === "press") {
      const ref = Number(a.ref);
      const el = Number.isInteger(ref) && ref > 0 ? page.locator(`[data-uc-ref="${ref}"]`).first() : null;
      if (act !== "press" && (!el || !(await el.count()))) return { ok: false, text: `No item [${a.ref}] on this page — read the page again and use a number from the list.` };
      const label = el ? (await labelOf(page, ref)) ?? "" : "";
      // Pressing Enter in a field or clicking a risky button submits something outside — needs the member's yes.
      // Enter in a field sends its form: risky when that form's own buttons say pay/send/order… (a search or sign-in form is not).
      const enter = (act === "type" && a.submit) || (act === "press" && /^enter$/i.test(String(a.key ?? "Enter")));
      const formWords = enter ? await (el ?? page.locator(":focus").first()).evaluate((e) => {
        const f = e.form || e.closest("form");
        return f ? [...f.querySelectorAll("button, input[type=submit], [role=button]")].map((b) => b.innerText || b.value || b.getAttribute("aria-label") || "").join(" ") : "";
      }).catch(() => "") : "";
      const risky = (act === "click" && RISKY.test(label)) || (enter && RISKY.test(formWords));
      if (risky && a.confirmed !== true) {
        return { ok: false, needsYes: true, text: `Stopped before «${label || "submit"}» — this can't be undone easily. Ask the member in plain words what will happen (what, where, how much) and wait for their «yes» in the chat; then do this step again.` };
      }
      if (act === "click") await el.click({ timeout: 15_000 });
      else if (act === "type") { await el.fill(String(a.text ?? ""), { timeout: 15_000 }); if (a.submit) await el.press("Enter"); }
      else if (act === "select") await el.selectOption({ label: String(a.text ?? "") }, { timeout: 15_000 }).catch(() => el.selectOption(String(a.text ?? "")));
      else await page.keyboard.press(String(a.key ?? "Enter"));
      await page.waitForTimeout(2000);
      try { saveState(uid, await s.ctx.storageState()); } catch { /* keep going */ }
      const what = act === "type" ? `Filled [${ref}]${a.secret ? " with the saved secret" : ""}${a.submit ? " and pressed Enter" : ""}.` : act === "click" ? `Pressed [${ref}] «${label}».` : act === "select" ? `Chose «${a.text}» in [${ref}].` : `Pressed ${a.key ?? "Enter"}.`;
      return { ok: true, text: `${what}\n\n${await snapshot(page)}` };
    }
    return { ok: false, text: `Unknown action «${act}». Use open, read, click, type, select, press, scroll, back, screenshot, close or forget.` };
  } catch (e) {
    return { ok: false, text: `Browser step failed: ${String(e.message ?? e).split("\n")[0].slice(0, 200)}` };
  }
}

// ── seo_audit (Soul /workspace/tools/seo-audit, open-seo «page check» way) ──
const UA = "Mozilla/5.0 (compatible; UnchoreSEOAudit/1.0; +https://unchore.ai)";
async function get(url) {
  const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r) return { status: 0, url, body: "" };
  const body = (await r.text().catch(() => "")).slice(0, 3_000_000);
  return { status: r.status, url: r.url, body };
}
const pick = (re, s) => { const m = s.match(re); return m ? m[1].replace(/\s+/g, " ").trim() : ""; };
const meta = (name, s) => pick(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)`, "i"), s) || pick(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"), s);

export async function seoAudit(a) {
  const start = safeUrl(a.sitemap);
  if (!start) return { ok: false, text: "Give a public sitemap address (https://…/sitemap.xml) or a page address." };
  const max = Math.min(Math.max(Number(a.max) || 100, 1), 300);
  let urls = [];
  const sm = await get(start);
  if (/<(urlset|sitemapindex)/i.test(sm.body)) {
    const locs = [...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    if (/<sitemapindex/i.test(sm.body)) {
      for (const child of locs.slice(0, 10)) { const c = await get(child); urls.push(...[...c.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])); if (urls.length >= max) break; }
    } else urls = locs;
  } else urls = [start];
  urls = [...new Set(urls.map(safeUrl).filter(Boolean))].slice(0, max);
  const rows = [];
  const titles = new Map();
  for (const u of urls) {
    const p = await get(u);
    const s = p.body;
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i, s);
    const desc = meta("description", s);
    const canon = pick(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i, s);
    const robots = meta("robots", s);
    const h1 = (s.match(/<h1[\s>]/gi) ?? []).length;
    const ogt = meta("og:title", s), ogi = meta("og:image", s);
    const noAlt = (s.match(/<img(?![^>]*\balt=)[^>]*>/gi) ?? []).length;
    const probs = [];
    if (p.status !== 200) probs.push(`status ${p.status}`);
    if (!title) probs.push("no title"); else if (title.length < 10 || title.length > 60) probs.push(`title ${title.length} chars (10–60)`);
    if (!desc) probs.push("no description"); else if (desc.length < 50 || desc.length > 160) probs.push(`description ${desc.length} chars (50–160)`);
    if (!canon) probs.push("no canonical");
    if (/noindex/i.test(robots)) probs.push("noindex");
    if (h1 !== 1) probs.push(`${h1} h1`);
    if (!ogt || !ogi) probs.push("share preview incomplete");
    if (noAlt) probs.push(`${noAlt} images without alt`);
    if (title) titles.set(title, (titles.get(title) ?? 0) + 1);
    rows.push({ url: u, status: p.status, title, desc: desc.length, canonical: canon ? "yes" : "no", noindex: /noindex/i.test(robots) ? "yes" : "no", h1, problems: probs });
    await new Promise((r) => setTimeout(r, 500));   // two pages a second at most — be kind to the site
  }
  for (const r of rows) if (r.title && (titles.get(r.title) ?? 0) > 1) r.problems.push("same title as another page");
  const bad = rows.filter((r) => r.problems.length);
  return { ok: true, rows, text: `Checked ${rows.length} page(s); ${bad.length} with problems.\n` + bad.slice(0, 20).map((r) => `- ${r.url}: ${r.problems.join(", ")}`).join("\n") };
}

export function _test() { return { safeUrl, RISKY, seal, unseal, loadState, saveState }; }
export function browsersOpen() { return open.size; }
if (!existsSync(ROOT)) { try { mkdirSync(ROOT, { recursive: true, mode: 0o700 }); } catch { /* read-only in tests */ } }
