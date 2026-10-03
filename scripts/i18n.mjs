#!/usr/bin/env node
// Unchore's translations (2026-09-30 owner: «usable in 100 countries, every page, checked by the AI lead»).
//   node scripts/i18n.mjs check              — which lines are missing or broken, per language (exit 1 if any)
//   node scripts/i18n.mjs fill [codes…]      — translate missing lines with the server's `claude` command, then a second,
//                                              separate pass reviews them as a native reader (the «lead check») and fixes
//   node scripts/i18n.mjs review [codes…]    — the review pass alone, over every line of those languages
//   node scripts/i18n.mjs audit [codes…]     — meaning check: a fresh call translates the lines back to English without seeing
//                                              the source, another compares and fixes lines whose meaning drifted
//   node scripts/i18n.mjs polish [codes…]    — re-read every line with the no-ai-slop rules (AI-sounding wording out), changed
//                                              lines get the back-translation check; no codes = every language in lanes
//   node scripts/i18n.mjs index              — rewrite lib/locales/index.ts (after adding a language to lib/i18n.ts)
//   node scripts/i18n.mjs auto               — check, and if anything is missing: fill it (in parallel over several Claude logins
//                                              when I18N_ACCOUNT_DIR + I18N_ACCOUNTS are set), then check again. The one command to run.
// Korean (ko.json) is written by people — fill never touches it.
// Command words (lib/words/, 2026-09-30 owner: «what works when said in Korean must work in every country's language»):
// fill/check/audit also cover them — Opus writes each language's phrases for every meaning in lib/words/src.json, a separate
// native review removes false alarms and adds missing everyday phrases, and a blind back-translation drops phrases whose meaning
// drifted. Korean and English are hand-written in the code next to each check.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { unlinkSync, openSync, closeSync } from "node:fs";
import { collectKeys, placeholders } from "./i18n-keys.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "lib/locales");
const HUMAN = new Set(["ko"]);
const MODEL = process.env.I18N_MODEL || "opus";
const BATCH = Number(process.env.I18N_BATCH || 120);

/** The language list, read from lib/i18n.ts (code, English name). */
export function languages() {
  const src = readFileSync(join(ROOT, "lib/i18n.ts"), "utf8");
  return [...src.matchAll(/\{ code: "([^"]+)", name: "[^"]*", en: "([^"]+)"/g)].map((m) => ({ code: m[1], en: m[2] })).filter((l) => l.code !== "en");
}
const file = (code) => join(DIR, `${code}.json`);
export const load = (code) => (existsSync(file(code)) ? JSON.parse(readFileSync(file(code), "utf8")) : {});
function save(code, d, keys) {
  // Guard (2026-09-30): a save that would drop most of a language's lines is a bug in the caller, never intended.
  const before = Object.keys(load(code)).length;
  if (before > 20 && keys.length < before / 2) throw new Error(`refusing to save ${code}: ${keys.length} lines would replace ${before}`);
  const out = {};
  for (const k of [...keys].sort()) if (d[k] !== undefined) out[k] = d[k];   // key order fixed → small diffs; stale lines dropped
  writeFileSync(file(code), JSON.stringify(out, null, 1) + "\n");
}

/** Problems of one language: missing keys, placeholder mismatches, empty lines. */
export function problems(code, keys, d = load(code)) {
  const missing = [], broken = [];
  for (const k of keys) {
    const v = d[k];
    if (typeof v !== "string" || !v.trim()) { missing.push(k); continue; }
    const a = placeholders(k.replace(/#\w+$/, "")).join(","), b = placeholders(v).join(",");
    if (a !== b) broken.push(`${k} → {${b}} (needs {${a}})`);
  }
  return { missing, broken };
}

function writeIndex() {
  const codes = languages().map((l) => l.code);
  const id = (c) => `l_${c.replace(/-/g, "_")}`;
  const body = [
    "// Written by scripts/i18n.mjs index — one import per language (server only; see lib/i18n-server.ts).",
    ...codes.map((c) => `import ${id(c)} from "./${c}.json";`),
    "",
    "export const LOCALES: Record<string, Record<string, string>> = {",
    ...codes.map((c) => `  ${JSON.stringify(c)}: ${id(c)},`),
    "};",
    "",
  ].join("\n");
  writeFileSync(join(DIR, "index.ts"), body);
  for (const c of codes) if (!existsSync(file(c))) writeFileSync(file(c), "{}\n");
}

// «Doesn't read like AI» — the owner's rule for everything that goes out, from github.com/petergyang/no-ai-slop (MIT, our copy in
// the soul skills), cut down to what matters for short app lines and applied in the target language (2026-09-30).
const SLOP = (lang) => `No AI-sounding text (the no-ai-slop rules, applied the way they show up in ${lang.en}): no inflated words (the ${lang.en} equivalents of delve, leverage, seamless, robust, empower, elevate, unlock, supercharge, cutting-edge, game changer); no empty adverbs or filler (simply, truly, actually, just, «it's worth noting», «when it comes to»); no «not X but Y» contrasts or «here's the thing» openers that the English doesn't have; no puffery («powerful», «revolutionary», «effortless») the English doesn't have; direct verbs («decide», not «make a decision»); no marketing tone on buttons, labels or error lines — say it the way a well-made app from a ${lang.en}-speaking country says it. Keep the English meaning, facts and any emoji or marks it has; don't add new ones.`;

const GUIDE = (lang) => `You translate the interface of Unchore, a personal AI app (chat + automations: it answers, and when something repeats it offers to automate it). Target language: ${lang.en} (${lang.code}).
Rules:
- Write what a native ${lang.en} speaker would see in a well-made consumer app from their own country: short, plain, friendly, natural. Never word-for-word; no translated-sounding phrasing, no stiff formal register unless that is how apps in ${lang.en} normally talk.
- Keep every {placeholder} exactly as written (same names, same braces). Keep emoji, «», ↑ ↗ →, markdown links and line breaks (\\n). Keep product names as they are: Unchore, Claude, ChatGPT, OpenRouter, Anthropic, Google, API, JSON, sk-ant-, sk-or-.
- A key may end with "#word" (e.g. "Paused#count"): that is only a context hint — translate the text before "#", never output the "#word".
- "#tab" = the default name of a worksheet tab, exactly as Excel names it in that language, without the number (e.g. de «Tabelle», es «Hoja», fr «Feuil», it «Foglio», pt «Planilha», ru «Лист», nl «Blad»; languages whose Excel says «Sheet» keep «Sheet»).
- Buttons and labels short; keep the same meaning and tone. Use the words people in that language actually use in apps (e.g. the local word for "Settings", "Sign out").
- ${SLOP(lang)}
- Input is JSON {"English text": ""}. Output ONLY JSON {"English text": "translation"} with the same keys, nothing else.`;

const REVIEW = (lang) => `You are a native ${lang.en} (${lang.code}) editor reviewing the interface text of Unchore, a personal AI app (chat + automations). You get JSON {"English source": "current ${lang.en} text"}.
For each line check: meaning matches the English; reads naturally to a native speaker in an app (not translated-sounding, no AI-ish filler, right register for a consumer app); same {placeholders}; emoji/marks/links/line breaks kept; product names unchanged; "#word" at the end of a key is only a hint and must not appear in the text. ${SLOP(lang)}
Output ONLY JSON with the lines you changed: {"English source": "better ${lang.en} text"}. If every line is already right, output {}.`;

// The owner's own computer (scripts/owner-check.sh) has no `claude` command: there the same model answers through OpenRouter
// with I18N_OPENROUTER_KEY (2026-10-03). The call runs in a child node so `ask` stays synchronous like the claude path.
const OR_MODEL = { opus: "anthropic/claude-opus-5.5", sonnet: "anthropic/claude-sonnet-5", haiku: "anthropic/claude-haiku-4.5" }[MODEL] ?? MODEL;
const OR_CALL = `const i=JSON.parse(require("fs").readFileSync(0,"utf8"));fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{authorization:"Bearer "+process.env.I18N_OPENROUTER_KEY,"content-type":"application/json"},body:JSON.stringify({model:i.model,max_tokens:64000,messages:[{role:"system",content:i.system},{role:"user",content:i.input}],provider:{data_collection:"deny"}})}).then((r)=>r.json()).then((j)=>{if(!j.choices)throw new Error(JSON.stringify(j.error||j).slice(0,300));process.stdout.write(j.choices[0].message.content||"")}).catch((e)=>{console.error(String(e.message||e));process.exit(1)})`;

function ask(system, obj) {
  const input = JSON.stringify(obj, null, 1);
  const r = process.env.I18N_OPENROUTER_KEY
    ? spawnSync(process.execPath, ["-e", OR_CALL], { input: JSON.stringify({ model: OR_MODEL, system, input }), encoding: "utf8", maxBuffer: 64 << 20, timeout: 15 * 60_000 })
    : spawnSync("claude", ["-p", "--model", MODEL, "--output-format", "text", "--append-system-prompt", system, "--disallowedTools", "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Task"],
      { input, encoding: "utf8", maxBuffer: 64 << 20, timeout: 15 * 60_000, cwd: "/tmp" });
  const text = (r.stdout || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON from claude (exit ${r.status}): ${(r.stderr || text).slice(0, 300)}`);
  try { return JSON.parse(m[0]); } catch { return JSON.parse(m[0].replace(/[\u0000-\u001f]+/g, " ")); }   // a raw line break inside a string (pt, 2026-09-30)
}

const BACK = (lang) => `Translate each ${lang.en} line of this app interface into plain English, literally enough that a change of meaning would show. Input JSON {"id": "${lang.en} text"}; output ONLY JSON {"id": "English"} with the same ids.`;
const JUDGE = (lang) => `You check ${lang.en} (${lang.code}) interface translations of Unchore, a personal AI app. For each id you get the English source, the current ${lang.en} text and a blind back-translation of it. Flag only real problems: meaning changed, something missing or added, wrong tone for a friendly consumer app, a {placeholder} wrong, or not natural ${lang.en}. For each problem give a corrected ${lang.en} line. Output ONLY JSON {"id": "corrected ${lang.en} text"}; {} if all are right.`;

/** `only` = just these lines (new ones from fill); the file is still saved with every line in `keys`. */
function auditOne(lang, keys, only = keys) {
  const d = load(lang.code);
  const ids = only.filter((k) => d[k]);
  let fixed = 0;
  for (const part of chunks(ids, BATCH)) {
    const back = ask(BACK(lang), Object.fromEntries(part.map((k, i) => [String(i), d[k]])));
    const fixes = ask(JUDGE(lang), Object.fromEntries(part.map((k, i) => [String(i), { english: k.replace(/#\w+$/, ""), hint: /#\w+$/.test(k) ? k.match(/#(\w+)$/)[1] : undefined, current: d[k], back: back[String(i)] ?? "" }])));
    for (const [i, v] of Object.entries(fixes)) {
      const k = part[Number(i)];
      if (k && typeof v === "string" && v.trim() && v !== d[k] && placeholders(v).join() === placeholders(k.replace(/#\w+$/, "")).join()) { d[k] = v; fixed++; }
    }
  }
  save(lang.code, d, keys);
  return `${lang.code}: audited ${ids.length}, fixed ${fixed}`;
}


// ── Command words ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const WDIR = join(ROOT, "lib/words");
export const wordSrc = () => JSON.parse(readFileSync(join(WDIR, "src.json"), "utf8"));
const wfile = (id) => join(WDIR, `${id}.json`);
export const wload = (id) => (existsSync(wfile(id)) ? JSON.parse(readFileSync(wfile(id), "utf8")) : {});
const MIN_LEN = { contains: 2, prefix: 2, heading: 2, exact: 1, afterNumber: 1 };
/** Clean one list: strings only, trimmed, lower case, no duplicates, long enough for how it is matched. */
export function cleanList(list, mode) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    const t = typeof p === "string" ? p.trim().toLowerCase() : "";
    if (t && [...t].length >= (MIN_LEN[mode] ?? 2) && t.length <= 60 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 40);
}
/** Files are shared by all languages and lanes run in parallel — write under a lock. */
function withLock(path, fn) {
  const lock = `${path}.lock`;
  const until = Date.now() + 120_000;
  for (;;) {
    try { closeSync(openSync(lock, "wx")); break; } catch { if (Date.now() > until) { try { unlinkSync(lock); } catch {} } else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); }
  }
  try { return fn(); } finally { try { unlinkSync(lock); } catch {} }
}
function wsaveLang(code, lists) {
  const src = wordSrc();
  for (const [id, list] of Object.entries(lists)) withLock(wfile(id), () => {
    const d = wload(id);
    d[code] = list;
    const out = {};
    for (const k of Object.keys(d).sort()) out[k] = d[k];
    const text = JSON.stringify(out, null, 1) + "\n";
    writeFileSync(wfile(id), text);
    for (const m of src[id]?.mirror ?? []) writeFileSync(join(ROOT, m), text);   // a standalone skill keeps its own copy
  });
}
export function wordMissing(code, src = wordSrc()) { return Object.keys(src).filter((id) => !(wload(id)[code]?.length)); }

const MATCH = {
  contains: "matched anywhere in the message. In languages written with spaces a phrase must start a word but may end mid-word, so for words with many endings give the stem (at least 3 letters) that still clearly carries the meaning",
  exact: "the whole short message must be exactly one of these (punctuation ignored) — list the complete everyday replies",
  afterNumber: "matched right after a number («5 Minuten», «30分») — list every form written after a number, short forms too",
  prefix: "written just before a name or an example",
  heading: "a heading on its own line — the words an assistant writing in this language would put as that heading",
};
const WGUIDE = (lang) => `You write the word lists that let Unchore, a personal AI app, understand what a user means when they write or speak ${lang.en} (${lang.code}). You get JSON {id: {meaning, match, en: [...], ko: [...]}} — the English and Korean lists are examples of the same meaning, not text to translate word for word.
For each id give the phrases native ${lang.en} speakers really type or say for that meaning in a chat app: casual and polite forms, common spellings (with and without accents or diacritics if people type both), 4–25 phrases. ${lang.en} only, lower case where the script has case.
Leave out phrases that often mean something else in everyday ${lang.en} — a missed phrase costs less than a false alarm. Nothing shorter than 3 letters in alphabetic scripts unless it is a whole everyday word.
Output ONLY JSON {id: ["phrase", ...]} with the same ids.`;
const WREVIEW = (lang) => `You are a native ${lang.en} (${lang.code}) editor checking the word lists Unchore uses to recognise what a user means. JSON {id: {meaning, match, phrases}}. For each id remove phrases that are unnatural, not ${lang.en}, or that would often fire when the user means something else; add common everyday phrases that are missing. Output ONLY JSON {id: [the full corrected list]} for the ids you changed; {} if all are right.`;
const WBACK = (lang) => `Translate each ${lang.en} phrase into plain English, literally enough that its real meaning shows. Input JSON {"n": "phrase"}; output ONLY JSON {"n": "English"} with the same keys.`;
const WJUDGE = `You check word lists an app uses to recognise what a user means. For each id you get the meaning and each phrase with a blind English back-translation. List only phrases that do NOT carry that meaning or would usually mean something else. Output ONLY JSON {id: ["phrase to drop", ...]} — {} if all fit.`;

function wordsOne(lang, src, all = false) {
  const ids = all ? Object.keys(src) : wordMissing(lang.code, src);
  if (!ids.length) return `${lang.code}: words complete`;
  const spec = (id) => ({ meaning: src[id].meaning, match: MATCH[src[id].mode] ?? MATCH.contains });
  const got = ask(WGUIDE(lang), Object.fromEntries(ids.map((id) => [id, { ...spec(id), en: src[id].en, ko: src[id].ko }])));
  const lists = Object.fromEntries(ids.map((id) => [id, cleanList(got[id], src[id].mode)]));
  // Separate native review (the «lead check»).
  const fixes = ask(WREVIEW(lang), Object.fromEntries(ids.map((id) => [id, { ...spec(id), phrases: lists[id] }])));
  let changed = 0;
  for (const [id, v] of Object.entries(fixes)) if (lists[id] && cleanList(v, src[id].mode).length) { lists[id] = cleanList(v, src[id].mode); changed++; }
  // Blind back-translation: drop phrases whose meaning drifted.
  const flat = ids.flatMap((id) => lists[id].map((p) => [id, p]));
  const back = ask(WBACK(lang), Object.fromEntries(flat.map(([, p], i) => [String(i), p])));
  const drop = ask(WJUDGE, Object.fromEntries(ids.map((id) => [id, { meaning: src[id].meaning, phrases: flat.map(([j, p], i) => (j === id ? { phrase: p, english: back[String(i)] ?? "" } : null)).filter(Boolean) }])));
  let dropped = 0;
  for (const [id, v] of Object.entries(drop)) if (lists[id] && Array.isArray(v)) {
    const bad = new Set(v.map((x) => String(x).trim().toLowerCase()));
    const keep = lists[id].filter((p) => !bad.has(p));
    if (keep.length) { dropped += lists[id].length - keep.length; lists[id] = keep; }
  }
  wsaveLang(lang.code, Object.fromEntries(ids.filter((id) => lists[id].length).map((id) => [id, lists[id]])));
  return `${lang.code}: words for ${ids.length} meanings, review changed ${changed}, back-check dropped ${dropped}, still missing ${wordMissing(lang.code, src).length}`;
}

function chunks(list, n) { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; }

function fillOne(lang, keys, reviewAll) {
  const d = load(lang.code);
  const todo = reviewAll ? [] : problems(lang.code, keys, d).missing.concat(problems(lang.code, keys, d).broken.map((b) => b.split(" → ")[0]));
  for (const part of chunks(todo, BATCH)) {
    const got = ask(GUIDE(lang), Object.fromEntries(part.map((k) => [k, ""])));
    for (const k of part) if (typeof got[k] === "string" && got[k].trim()) d[k] = got[k];
  }
  // The lead check: a separate call reads the new lines (or all, for `review`) as a native editor and fixes what's off.
  const look = reviewAll ? keys : todo;
  let changed = 0;
  for (const part of chunks(look.filter((k) => d[k]), BATCH)) {
    const fixes = ask(REVIEW(lang), Object.fromEntries(part.map((k) => [k, d[k]])));
    for (const [k, v] of Object.entries(fixes)) if (part.includes(k) && typeof v === "string" && v.trim() && placeholders(v).join() === placeholders(k.replace(/#\w+$/, "")).join()) { d[k] = v; changed++; }
  }
  save(lang.code, d, keys);
  // New lines also get the blind back-translation meaning check (the full `audit` is for every line).
  const audited = !reviewAll && todo.length ? auditOne(lang, keys, todo) : "";
  const p = problems(lang.code, keys);
  return `${lang.code}: translated ${todo.length}, reviewed ${look.length}, review changed ${changed}${audited ? ` (${audited.replace(/^[^:]+: /, "")})` : ""}, still missing ${p.missing.length}, broken ${p.broken.length}`;
}

/** Re-read every line of a language with the no-ai-slop rules; changed lines get the blind back-translation check. */
function polishOne(lang, keys) {
  const d = load(lang.code);
  const changedKeys = [];
  for (const part of chunks(keys.filter((k) => d[k]), BATCH)) {
    const fixes = ask(REVIEW(lang), Object.fromEntries(part.map((k) => [k, d[k]])));
    for (const [k, v] of Object.entries(fixes)) if (part.includes(k) && typeof v === "string" && v.trim() && v !== d[k] && placeholders(v).join() === placeholders(k.replace(/#\w+$/, "")).join()) { d[k] = v; changedKeys.push(k); }
  }
  save(lang.code, d, keys);
  const audited = changedKeys.length ? auditOne(lang, keys, changedKeys) : "";
  return `${lang.code}: polished ${keys.length}, changed ${changedKeys.length}${audited ? ` (${audited.replace(/^[^:]+: /, "")})` : ""}`;
}

/** Run `sub` («fill» or «polish») for these languages in parallel lanes over the Claude logins set in the environment. */
async function lanes(sub, codes) {
  const base = process.env.I18N_ACCOUNT_DIR || "";
  const accs = base ? (process.env.I18N_ACCOUNTS || "").split(",").map((a) => a.trim()).filter((a) => a && existsSync(`${base}${a}`)) : [];
  const n = Math.max(1, Math.min(codes.length, (accs.length || 1) * 2));
  console.log(`${codes.length} language(s) to ${sub} over ${n} lane(s)${accs.length ? ` (${accs.length} logins)` : ""}`);
  await Promise.all(Array.from({ length: n }, (_, i) => new Promise((done) => {
    const mine = codes.filter((_, j) => j % n === i);
    const env = { ...process.env, I18N_LANE: "1", I18N_BATCH: process.env.I18N_BATCH || "400", ...(accs.length ? { CLAUDE_CONFIG_DIR: `${base}${accs[i % accs.length]}` } : {}) };
    const c = spawn(process.execPath, [fileURLToPath(import.meta.url), sub, ...mine], { env, stdio: ["ignore", "pipe", "inherit"] });
    c.stdout.on("data", (b) => process.stdout.write(b));
    c.on("close", done);
  })));
}

const [cmd = "check", ...args] = process.argv.slice(2);
const keys = [...collectKeys(ROOT).keys.keys()];
/** Languages with something to do (lines or command words). */
function needWork() {
  const src = wordSrc();
  return languages().filter((l) => !HUMAN.has(l.code)).map((l) => ({ l, p: problems(l.code, keys), w: wordMissing(l.code, src) })).filter((x) => x.p.missing.length || x.p.broken.length || x.w.length);
}
function checkAll() {
  let bad = 0;
  const src = wordSrc();
  for (const l of [{ code: "ko", en: "Korean" }, ...languages().filter((x) => x.code !== "ko")]) {
    const p = problems(l.code, keys);
    const w = HUMAN.has(l.code) ? [] : wordMissing(l.code, src);
    const stale = Object.keys(load(l.code)).filter((k) => !keys.includes(k)).length;
    if (p.missing.length || p.broken.length || w.length) { bad++; console.log(`✗ ${l.code}: missing ${p.missing.length}, broken ${p.broken.length}${w.length ? `, command words missing ${w.length} (${w.slice(0, 3).join(", ")})` : ""}${stale ? `, unused ${stale}` : ""}${p.missing.length ? ` — e.g. «${p.missing[0].slice(0, 60)}»` : ""}${p.broken.length ? ` — ${p.broken[0].slice(0, 90)}` : ""}`); }
  }
  console.log(`${keys.length} lines + ${Object.keys(src).length} command-word meanings × ${languages().length} languages — ${bad ? `${bad} language(s) need work (run: node scripts/i18n.mjs auto)` : "all complete"}`);
  return bad;
}
if (cmd === "index") { writeIndex(); console.log("lib/locales/index.ts written"); }
else if (cmd === "check") process.exit(checkAll() ? 1 : 0);
else if (cmd === "fill" || cmd === "review") {
  const want = args.length ? args : languages().map((l) => l.code);
  const src = wordSrc();
  for (const l of languages().filter((x) => want.includes(x.code) && !HUMAN.has(x.code))) {
    // one more try before giving up: the translator now and then sends a reply that isn't clean JSON for one language
    // (10/2 «ne» and «tr» — each left a whole upload stopped at the language check; a second ask filled it)
    const again = (f) => { try { return f(); } catch { return f(); } };
    try { console.log(again(() => fillOne(l, keys, cmd === "review"))); } catch (e) { console.log(`${l.code}: FAILED — ${e.message}`); }
    try { console.log(again(() => wordsOne(l, src, cmd === "review"))); } catch (e) { console.log(`${l.code}: words FAILED — ${e.message}`); }
  }
} else if (cmd === "audit") {
  const want = args.length ? args : languages().map((l) => l.code);
  for (const l of languages().filter((x) => want.includes(x.code) && !HUMAN.has(x.code))) {
    try { console.log(auditOne(l, keys)); } catch (e) { console.log(`${l.code}: FAILED — ${e.message}`); }
  }
} else if (cmd === "auto") {
  // One command for everything: nothing missing → done; else parallel lanes (I18N_ACCOUNT_DIR + I18N_ACCOUNTS) or one lane.
  const todo = needWork();
  if (!todo.length) { checkAll(); process.exit(0); }
  await lanes("fill", todo.map((x) => x.l.code));
  process.exit(checkAll() ? 1 : 0);
} else if (cmd === "polish") {
  // From the command line: these languages (none = all) in parallel lanes; inside a lane (I18N_LANE): the lane's own languages.
  const want = args.filter((a) => a !== "all");
  if (!process.env.I18N_LANE) { await lanes("polish", languages().filter((l) => !HUMAN.has(l.code) && (!want.length || want.includes(l.code))).map((l) => l.code)); process.exit(checkAll() ? 1 : 0); }
  for (const l of languages().filter((x) => want.includes(x.code) && !HUMAN.has(x.code))) {
    try { console.log(polishOne(l, keys)); } catch (e) { console.log(`${l.code}: FAILED — ${e.message}`); }
  }
} else { console.log("usage: node scripts/i18n.mjs check | auto | polish [codes…] | fill [codes…] | review [codes…] | audit [codes…] | index"); process.exit(2); }
